import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { AgentProvider } from '../types';
import WebSocket from 'ws';
import { db } from '../db';
import { resolveApiKey } from '../routes/settings';
import { markConnectionQuotaExceeded } from '../routes/connections';
import { writeEvent } from './events';
import { createWorktree, removeWorktree } from './git';

const QUOTA_PATTERNS = [
  /rate.?limit/i, /429/, /too.?many.?requests/i,
  /quota/i, /overloaded_error/i, /insufficient.?quota/i,
];

const COMPLETED_TTL_MS = 30 * 60 * 1000;
const MAX_BUFFER = 200;
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');

function sessionLogPath(sessionId: string): string {
  return path.join(DATA_DIR, `${sessionId}.log`);
}

// ---------------------------------------------------------------------------
// Session shape expected by this service
// ---------------------------------------------------------------------------

export interface SessionRef {
  id: string;
  agentId: string;
  projectId: string;
  workTaskId?: string;
  specId?: string;
  parentSessionId?: string;
  shiftId?: string;
  provider: AgentProvider;
  branch: string;
  worktreePath: string;
  status: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Persistence helpers — synchronous DB updates
// ---------------------------------------------------------------------------

function updateSessionStatus(sessionId: string, status: string): void {
  db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, sessionId);
}

function updateTaskStatusForSession(sessionId: string, status: string): void {
  const session = db.prepare('SELECT work_task_id FROM sessions WHERE id = ?').get(sessionId) as
    | { work_task_id: string | null }
    | undefined;
  if (!session?.work_task_id) return;
  db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(
    status, new Date().toISOString(), session.work_task_id
  );
}

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

function nvmBinPaths(): string[] {
  const nvmDir = path.join(process.env.HOME ?? '', '.nvm', 'versions', 'node');
  try {
    return fs.readdirSync(nvmDir).map(v => path.join(nvmDir, v, 'bin'));
  } catch { return []; }
}

const EXTRA_PATHS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  ...nvmBinPaths(),
  `${process.env.HOME}/.npm-global/bin`,
  `${process.env.HOME}/.local/bin`,
].join(':');

function resolvedEnv(base: Record<string, string | undefined>): Record<string, string> {
  const PATH = [base.PATH ?? '', EXTRA_PATHS].filter(Boolean).join(':');
  return { ...base, PATH } as Record<string, string>;
}

function findBinary(name: string): string | null {
  try {
    return execSync(`which ${name}`, {
      env: resolvedEnv(process.env as Record<string, string | undefined>),
    }).toString().trim() || null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

function resolveModel(agentId: string): string | undefined {
  const agent = db.prepare('SELECT connection_id FROM agents WHERE id = ?').get(agentId) as { connection_id: string | null } | undefined;
  if (!agent?.connection_id) return undefined;
  const conn = db.prepare('SELECT model FROM connections WHERE id = ?').get(agent.connection_id) as { model: string | null } | undefined;
  return conn?.model ?? undefined;
}

function resolvePersonality(agentId: string): string | undefined {
  const agent = db.prepare('SELECT personality FROM agents WHERE id = ?').get(agentId) as { personality: string | null } | undefined;
  return agent?.personality ?? undefined;
}

function resolveConnectionId(agentId: string): string | undefined {
  const agent = db.prepare('SELECT connection_id FROM agents WHERE id = ?').get(agentId) as { connection_id: string | null } | undefined;
  return agent?.connection_id ?? undefined;
}

function buildCommand(provider: AgentProvider, prompt: string, model?: string, mcpConfigPath?: string): { cmd: string; args: string[] } {
  if (provider === 'claude') {
    const args = ['-p', prompt, '--dangerously-skip-permissions', '--verbose', '--output-format', 'stream-json'];
    if (model) args.push('--model', model);
    if (mcpConfigPath) args.push('--mcp-config', mcpConfigPath);
    return { cmd: 'claude', args };
  }
  const args = ['--approval-policy', 'auto', '-q', prompt];
  if (model) args.push('--model', model);
  return { cmd: 'codex', args };
}

function apiKeyEnv(provider: AgentProvider, apiKey: string): Record<string, string> {
  return provider === 'claude' ? { ANTHROPIC_API_KEY: apiKey } : { OPENAI_API_KEY: apiKey };
}

// ---------------------------------------------------------------------------
// Active / completed session maps
// ---------------------------------------------------------------------------

interface ActiveSession {
  proc: ReturnType<typeof spawn>;
  buffer: string[];
  subs: Set<WebSocket>;
}

const active    = new Map<string, ActiveSession>();
const completed = new Map<string, string[]>();

// ---------------------------------------------------------------------------
// MCP config builder
// ---------------------------------------------------------------------------

function buildMcpConfig(agentId: string, sessionId: string): string | null {
  // Direct employee tool assignments
  const toolRows = db.prepare(`
    SELECT t.mcp_config FROM tools t
    JOIN agent_tools agt ON agt.tool_id = t.id
    WHERE agt.agent_id = ?
  `).all(agentId) as { mcp_config: string }[];

  // Department-inherited tools (via the agent's department)
  const deptToolRows = db.prepare(`
    SELECT t.mcp_config FROM tools t
    JOIN department_tools dt ON dt.tool_id = t.id
    JOIN agents a ON a.department_id = dt.department_id
    WHERE a.id = ?
  `).all(agentId) as { mcp_config: string }[];

  const allRows = [...deptToolRows, ...toolRows]; // employee-direct overrides dept
  if (allRows.length === 0) return null;

  const mcpServers: Record<string, unknown> = {};
  for (const row of allRows) {
    try { Object.assign(mcpServers, JSON.parse(row.mcp_config)); } catch { /* skip invalid */ }
  }
  if (Object.keys(mcpServers).length === 0) return null;

  const configPath = path.join(DATA_DIR, `${sessionId}-mcp.json`);
  fs.writeFileSync(configPath, JSON.stringify({ mcpServers }, null, 2));
  return configPath;
}

// ---------------------------------------------------------------------------
// Knowledge context builder
// ---------------------------------------------------------------------------

function buildKnowledgeContext(userId: string, agentId: string): string {
  const agent = db.prepare('SELECT department_id FROM agents WHERE id = ?').get(agentId) as { department_id: string | null } | undefined;

  const companyDocs = db.prepare(
    "SELECT title, content FROM knowledge WHERE user_id = ? AND scope = 'company' AND content != '' ORDER BY created_at ASC"
  ).all(userId) as { title: string; content: string }[];

  const deptDocs = agent?.department_id ? db.prepare(
    "SELECT title, content FROM knowledge WHERE user_id = ? AND scope = 'department' AND scope_id = ? AND content != '' ORDER BY created_at ASC"
  ).all(userId, agent.department_id) as { title: string; content: string }[] : [];

  const employeeDocs = db.prepare(
    "SELECT title, content FROM knowledge WHERE user_id = ? AND scope = 'employee' AND scope_id = ? AND content != '' ORDER BY created_at ASC"
  ).all(userId, agentId) as { title: string; content: string }[];

  const parts: string[] = [];
  if (companyDocs.length > 0)  parts.push('# Company Knowledge\n\n'    + companyDocs.map(d => `## ${d.title}\n\n${d.content}`).join('\n\n'));
  if (deptDocs.length > 0)     parts.push('# Department Knowledge\n\n' + deptDocs.map(d => `## ${d.title}\n\n${d.content}`).join('\n\n'));
  if (employeeDocs.length > 0) parts.push('# Personal Context\n\n'     + employeeDocs.map(d => `## ${d.title}\n\n${d.content}`).join('\n\n'));

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Journal capture
// ---------------------------------------------------------------------------

function captureJournal(sessionId: string, worktreePath: string): void {
  try {
    const content = fs.readFileSync(path.join(worktreePath, 'JOURNAL.md'), 'utf-8').trim();
    if (content) db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(content, sessionId);
  } catch { /* no journal written — that's fine */ }
}

// ---------------------------------------------------------------------------
// Review capture
// ---------------------------------------------------------------------------

function captureReview(reviewSessionId: string, worktreePath: string): void {
  try {
    const content = fs.readFileSync(path.join(worktreePath, 'REVIEW.md'), 'utf-8').trim();
    if (!content) return;

    db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(content, reviewSessionId);

    const firstLine = content.split('\n')[0].toUpperCase();
    const verdict   = firstLine.includes('APPROVED') ? 'approved'
                    : firstLine.includes('CHANGES')  ? 'changes_requested'
                    : null;

    const row = db.prepare('SELECT parent_session_id FROM sessions WHERE id = ?').get(reviewSessionId) as { parent_session_id: string | null } | undefined;
    if (row?.parent_session_id && verdict) {
      db.prepare('UPDATE sessions SET review_verdict = ? WHERE id = ?').run(verdict, row.parent_session_id);
    }
  } catch { /* no review written */ }
}

// ---------------------------------------------------------------------------
// Shift auto-advance
// ---------------------------------------------------------------------------

interface TaskRowMin { id: string; prompt: string; base_branch: string; project_id: string }
interface ProjectRowMin { id: string; name: string; repo_path: string; role: string; created_at: string }
interface AgentRowMin  { id: string; provider: string }

function generateShiftReport(shiftId: string): void {
  try {
    interface ShiftTaskRow { title: string; status: string; started_at: string | null; completed_at: string | null }
    const shiftTasks = db.prepare(
      'SELECT title, status, started_at, completed_at FROM tasks WHERE shift_id = ? ORDER BY started_at ASC'
    ).all(shiftId) as ShiftTaskRow[];

    const done   = shiftTasks.filter(t => t.status === 'done').length;
    const failed = shiftTasks.filter(t => t.status === 'failed').length;
    const lines  = [`Shift complete — ${done} done, ${failed} failed.\n`];

    for (const t of shiftTasks) {
      const icon = t.status === 'done' ? '✓' : '✗';
      let suffix = '';
      if (t.started_at && t.completed_at) {
        const secs = Math.round((new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()) / 1000);
        suffix = ` (${secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`})`;
      }
      lines.push(`${icon} ${t.title}${suffix}`);
    }

    db.prepare("UPDATE shifts SET report = ? WHERE id = ?").run(lines.join('\n'), shiftId);
  } catch { /* non-critical */ }
}

async function advanceShift(shiftId: string, agentId: string, userId: string): Promise<void> {
  const nextTask = db.prepare(
    "SELECT * FROM tasks WHERE shift_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1"
  ).get(shiftId) as TaskRowMin | undefined;

  if (!nextTask) {
    const completedAt = new Date().toISOString();
    db.prepare("UPDATE shifts SET status = 'completed', completed_at = ? WHERE id = ?").run(completedAt, shiftId);
    generateShiftReport(shiftId);
    return;
  }

  const agent   = db.prepare('SELECT id, provider FROM agents WHERE id = ?').get(agentId) as AgentRowMin | undefined;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(nextTask.project_id) as ProjectRowMin | undefined;
  if (!agent || !project) return;

  const sessionId = uuid();
  const branch    = `agent/${sessionId}`;
  const projectObj = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };

  try {
    const worktreePath = await createWorktree(projectObj, sessionId, nextTask.base_branch);
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, status, shift_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(sessionId, userId, agentId, project.id, nextTask.id, agent.provider, branch, worktreePath, 'idle', shiftId, now);
    db.prepare(
      'UPDATE tasks SET status = ?, agent_id = ?, session_id = ?, started_at = ? WHERE id = ?'
    ).run('running', agentId, sessionId, now, nextTask.id);

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    // Import toSession inline to avoid circular deps with _helpers
    const sessionRef: SessionRef = {
      id: session.id, agentId: session.agent_id, projectId: session.project_id,
      workTaskId: session.work_task_id ?? undefined, shiftId: session.shift_id ?? undefined,
      provider: session.provider as AgentProvider, branch: session.branch,
      worktreePath: session.worktree_path, status: session.status, createdAt: session.created_at,
    };
    void runAgent(sessionRef, nextTask.prompt, userId, agentId);
  } catch (err) {
    console.error('[shift] Failed to advance:', err);
  }
}

// ---------------------------------------------------------------------------
// Lead task capture + auto-assignment
// ---------------------------------------------------------------------------

interface LeadTask { title: string; prompt?: string; baseBranch?: string; role?: string; priority?: number }

function findIdleAgentByRole(userId: string, role: string): AgentRowMin | null {
  return db.prepare(`
    SELECT a.id, a.provider FROM agents a
    WHERE a.user_id = ?
      AND (a.role = ? OR a.role = 'any')
      AND a.id NOT IN (SELECT agent_id FROM sessions WHERE status IN ('running', 'idle'))
    ORDER BY CASE WHEN a.role = ? THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1
  `).get(userId, role, role) as AgentRowMin | null;
}

async function autoAssignTask(
  taskId: string, agent: AgentRowMin,
  projectId: string, baseBranch: string, userId: string
): Promise<void> {
  const task    = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRowMin & { prompt: string; title: string } | undefined;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRowMin | undefined;
  if (!task || !project) return;

  const sessionId  = uuid();
  const branch     = `agent/${sessionId}`;
  const projectObj = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };
  const now        = new Date().toISOString();

  try {
    const worktreePath = await createWorktree(projectObj, sessionId, baseBranch);
    db.prepare(
      'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(sessionId, userId, agent.id, projectId, taskId, agent.provider, branch, worktreePath, 'idle', now);
    db.prepare('UPDATE tasks SET status = ?, agent_id = ?, session_id = ?, started_at = ? WHERE id = ?')
      .run('running', agent.id, sessionId, now, taskId);

    const sessionRef: SessionRef = {
      id: sessionId, agentId: agent.id, projectId,
      workTaskId: taskId, provider: agent.provider as AgentProvider,
      branch, worktreePath, status: 'idle', createdAt: now,
    };
    void runAgent(sessionRef, task.prompt, userId, agent.id);
  } catch (err) {
    console.error('[lead] Failed to auto-assign task:', err);
  }
}

async function captureTasks(session: SessionRef, userId: string): Promise<void> {
  try {
    const content = fs.readFileSync(path.join(session.worktreePath, 'TASKS.json'), 'utf-8');
    const items   = JSON.parse(content) as LeadTask[];
    if (!Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
      if (!item.title || typeof item.title !== 'string') continue;
      const taskId     = uuid();
      const baseBranch = item.baseBranch ?? 'main';
      const now        = new Date().toISOString();
      db.prepare(
        'INSERT INTO tasks (id, user_id, project_id, title, prompt, base_branch, status, priority, size, lead_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        taskId, userId, session.projectId,
        item.title.trim(),
        item.prompt?.trim() ?? '',
        baseBranch,
        'pending',
        Math.min(10, Math.max(0, Math.round(item.priority ?? 5))),
        'm', session.id, now
      );
      writeEvent(userId, 'task.created', { taskId, projectId: session.projectId, agentId: session.agentId });

      const role      = item.role ?? 'worker';
      const idleAgent = findIdleAgentByRole(userId, role);
      if (idleAgent) {
        await autoAssignTask(taskId, idleAgent, session.projectId, baseBranch, userId);
      }
    }

    // Auto-dismiss the lead session — it has no mergeable code, just planning artifacts.
    // Mark it merged and clean up the worktree so it doesn't appear in the Review column.
    db.prepare("UPDATE sessions SET status = 'merged' WHERE id = ?").run(session.id);
    if (session.workTaskId) {
      db.prepare("UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?").run(new Date().toISOString(), session.workTaskId);
    }
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.projectId) as { id: string; name: string; repo_path: string; role: string; created_at: string } | undefined;
    if (project) {
      const projectObj = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };
      void removeWorktree(projectObj, session.worktreePath);
    }
  } catch { /* no TASKS.json or invalid — that's fine */ }
}

// ---------------------------------------------------------------------------
// Spec capture (planning sessions)
// ---------------------------------------------------------------------------

function captureSpec(specId: string, worktreePath: string): void {
  const now = new Date().toISOString();
  try {
    const content = fs.readFileSync(path.join(worktreePath, 'SPEC.md'), 'utf-8');
    db.prepare('UPDATE specs SET content = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(content.trim(), 'draft', now, specId);
  } catch {
    db.prepare('UPDATE specs SET status = ?, updated_at = ? WHERE id = ?')
      .run('draft', now, specId);
  }
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

export async function runAgent(session: SessionRef, prompt: string, userId: string, agentId?: string, explicitKey?: string): Promise<void> {
  if (active.has(session.id)) return;

  const resolvedKey  = resolveApiKey(userId, session.provider, agentId, explicitKey);
  const model        = resolveModel(session.agentId);
  const personality  = resolvePersonality(session.agentId);
  const connectionId = resolveConnectionId(session.agentId);
  const knowledgeCtx = buildKnowledgeContext(userId, session.agentId);
  const mcpConfigPath = buildMcpConfig(session.agentId, session.id);

  const agentRoleRow = db.prepare('SELECT role FROM agents WHERE id = ?').get(session.agentId) as { role: string } | undefined;
  const isLead       = agentRoleRow?.role === 'lead';

  // Inject previous session journal if this task has been worked on before
  let prevJournal: string | undefined;
  if (session.workTaskId && !session.parentSessionId) {
    const prev = db.prepare(
      "SELECT journal FROM sessions WHERE work_task_id = ? AND id != ? AND journal IS NOT NULL AND status IN ('done','error','merged') ORDER BY created_at DESC LIMIT 1"
    ).get(session.workTaskId, session.id) as { journal: string } | undefined;
    prevJournal = prev?.journal;
  }

  const journalInstruction = session.parentSessionId ? '' : isLead
    ? '\n\n---\n\nYou are a **Lead Agent**. Analyze this brief and break it into concrete tasks for your team. When done, write TASKS.json in the project root:\n\n```json\n[\n  {\n    "title": "Short task title",\n    "prompt": "Detailed worker instructions",\n    "baseBranch": "main",\n    "role": "worker",\n    "priority": 5\n  }\n]\n```\n\nRoles: "worker" (writes code), "reviewer" (reviews diffs), "planner" (writes specs). Priority 1–10, higher = more urgent. Keep each task focused — completable in one session. Do NOT write code yourself.'
    : '\n\n---\n\nWhen you finish your work, write a JOURNAL.md file in the project root with a brief summary: what you completed, key decisions made, any issues encountered, and what a future session should know. Keep it to 5-10 lines.';

  const promptParts = [
    knowledgeCtx,
    personality,
    prevJournal ? `# Handoff from Previous Session\n\n${prevJournal}` : '',
    prompt + journalInstruction,
  ].filter(Boolean);
  const effectivePrompt = promptParts.join('\n\n---\n\n');

  const { cmd, args } = buildCommand(session.provider, effectivePrompt, model, mcpConfigPath ?? undefined);
  const env = resolvedKey
    ? { ...resolvedEnv(process.env as Record<string, string | undefined>), ...apiKeyEnv(session.provider, resolvedKey) }
    : resolvedEnv(process.env as Record<string, string | undefined>);

  const entry: ActiveSession = { proc: null as any, buffer: [], subs: new Set() };
  active.set(session.id, entry);

  fs.writeFileSync(sessionLogPath(session.id), '');

  let stderrAccum = '';

  const broadcast = (type: string, data: string) => {
    const msg = JSON.stringify({ type, sessionId: session.id, data });
    entry.buffer.push(msg);
    if (entry.buffer.length > MAX_BUFFER) entry.buffer.shift();
    fs.appendFileSync(sessionLogPath(session.id), msg + '\n');
    for (const ws of entry.subs) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  };

  // No API key is fine — the CLI will use machine auth (OAuth subscription).
  // Only warn; don't abort.
  if (!resolvedKey) {
    broadcast('stderr', `[pilot] No API key set — using machine auth (OAuth subscription) for ${session.provider}.`);
  }

  const bin = findBinary(cmd);
  if (!bin) {
    const tip = session.provider === 'claude'
      ? 'Install with: npm install -g @anthropic-ai/claude-code'
      : 'Install with: npm install -g @openai/codex';
    broadcast('stderr', `[pilot] Command not found: '${cmd}'\n${tip}`);
    broadcast('done', '127');
    active.delete(session.id);
    completed.set(session.id, [...entry.buffer]);
    setTimeout(() => completed.delete(session.id), COMPLETED_TTL_MS);
    updateSessionStatus(session.id, 'error');
    updateTaskStatusForSession(session.id, 'failed');
    return;
  }

  broadcast('stderr', `[pilot] Starting ${cmd} in ${session.worktreePath}`);
  writeEvent(userId, 'session.started', { sessionId: session.id, taskId: session.workTaskId, projectId: session.projectId, agentId: session.agentId });

  const proc = spawn(bin, args, { cwd: session.worktreePath, env, stdio: ['ignore', 'pipe', 'pipe'] });
  entry.proc = proc;
  updateSessionStatus(session.id, 'running');

  proc.stdout.on('data', (chunk: Buffer) => broadcast('stdout', chunk.toString()));
  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderrAccum += text;
    broadcast('stderr', text);
  });

  const finish = (code: number | null, signal: string | null) => {
    const exitCode = code ?? 1;
    broadcast('stderr', exitCode === 0
      ? '[pilot] Finished (exit 0)'
      : `[pilot] Exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`
    );
    broadcast('done', String(exitCode));

    completed.set(session.id, [...entry.buffer]);
    setTimeout(() => completed.delete(session.id), COMPLETED_TTL_MS);
    active.delete(session.id);
    updateSessionStatus(session.id, exitCode === 0 ? 'done' : 'error');
    updateTaskStatusForSession(session.id, exitCode === 0 ? 'done' : 'failed');
    writeEvent(userId, exitCode === 0 ? 'session.completed' : 'session.failed', { sessionId: session.id, taskId: session.workTaskId, projectId: session.projectId, agentId: session.agentId });
    if (mcpConfigPath) { try { fs.unlinkSync(mcpConfigPath); } catch { /* already gone */ } }
    if (session.specId) captureSpec(session.specId, session.worktreePath);
    if (session.parentSessionId) {
      captureReview(session.id, session.worktreePath);
    } else if (isLead) {
      captureJournal(session.id, session.worktreePath);
      if (exitCode === 0) void captureTasks(session, userId);
    } else {
      captureJournal(session.id, session.worktreePath);
      if (session.shiftId && exitCode === 0) {
        void advanceShift(session.shiftId, session.agentId, userId);
      }
    }
    // Detect quota/rate-limit errors and mark the connection
    if (exitCode !== 0 && connectionId && QUOTA_PATTERNS.some(p => p.test(stderrAccum))) {
      markConnectionQuotaExceeded(connectionId);
      broadcast('stderr', '[pilot] Rate limit or quota detected — connection marked as cooling down for 1 hour.');
    }
  };

  proc.on('close', (code, signal) => finish(code, signal));
  proc.on('error', (err: NodeJS.ErrnoException) => {
    broadcast('stderr', err.code === 'ENOENT'
      ? `[pilot] Failed to start '${cmd}': not found`
      : `[pilot] Process error: ${err.message}`
    );
    finish(1, null);
  });
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export function subscribeToSession(sessionId: string, ws: WebSocket): boolean {
  const entry = active.get(sessionId);
  if (entry) {
    // Replay from the persisted log for complete history (buffer is capped)
    try {
      const lines = fs.readFileSync(sessionLogPath(sessionId), 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        if (ws.readyState === WebSocket.OPEN) ws.send(line);
      }
    } catch {
      for (const msg of entry.buffer) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    }
    entry.subs.add(ws);
    return true;
  }
  const archive = completed.get(sessionId);
  if (archive) {
    for (const msg of archive) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
    return true;
  }
  // Fall back to persisted log for sessions not in memory (e.g. after server restart)
  try {
    const lines = fs.readFileSync(sessionLogPath(sessionId), 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      if (ws.readyState === WebSocket.OPEN) ws.send(line);
    }
    return lines.length > 0;
  } catch { return false; }
}

export function unsubscribeFromAllSessions(ws: WebSocket): void {
  for (const entry of active.values()) entry.subs.delete(ws);
}

export function isSessionActive(sessionId: string): boolean {
  return active.has(sessionId);
}

export function killAgent(sessionId: string): void {
  const entry = active.get(sessionId);
  if (entry) { entry.proc.kill('SIGTERM'); active.delete(sessionId); }
}

export function agentHealth(): Record<string, { available: boolean; path: string | null }> {
  const claudePath = findBinary('claude');
  const codexPath  = findBinary('codex');
  return {
    claude: { available: !!claudePath, path: claudePath },
    codex:  { available: !!codexPath,  path: codexPath  },
  };
}
