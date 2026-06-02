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
import { assignTaskToSession, markSessionFinished, markSessionMerged, markSessionRunning, markTaskDone } from './lifecycle';

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

interface AgentMeta { model: string | null; personality: string | null; connection_id: string | null; role: string | null }

function resolveAgentMeta(agentId: string): AgentMeta {
  return (db.prepare(`
    SELECT a.personality, a.connection_id, a.role, c.model
    FROM agents a
    LEFT JOIN connections c ON c.id = a.connection_id
    WHERE a.id = ?
  `).get(agentId) as AgentMeta | undefined) ?? { model: null, personality: null, connection_id: null, role: null };
}

function buildCommand(provider: AgentProvider, prompt: string, model?: string, mcpConfigPath?: string, resumeId?: string): { cmd: string; args: string[] } {
  if (provider === 'claude') {
    const args = ['-p', prompt, '--dangerously-skip-permissions', '--verbose', '--output-format', 'stream-json'];
    if (resumeId) args.push('--resume', resumeId);
    if (model) args.push('--model', model);
    if (mcpConfigPath) args.push('--mcp-config', mcpConfigPath);
    return { cmd: 'claude', args };
  }
  if (resumeId) {
    return { cmd: 'codex', args: ['exec', 'resume', resumeId, prompt] };
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

interface McpConfigCtx {
  userId: string;
  projectId: string;
  specId?: string;
  shiftId?: string;
  parentSessionId?: string;
}

// Resolve the command/args for the pilot internal MCP server.
// In dev (__filename ends in .ts) use ts-node with --transpile-only for fast startup.
// In prod (compiled .js) use node directly.
function pilotMcpEntry(sessionId: string, agentId: string, ctx: McpConfigCtx): Record<string, unknown> {
  const isTsDev = __filename.endsWith('.ts');
  const serverFile = isTsDev
    ? path.resolve(__dirname, '../mcp-server.ts')
    : path.resolve(__dirname, '../mcp-server.js');

  // Prefer tsx if available (faster), fall back to ts-node --transpile-only
  const tsxBin      = path.resolve(__dirname, '../../node_modules/.bin/tsx');
  const tsNodeBin   = path.resolve(__dirname, '../../node_modules/.bin/ts-node');
  const devCommand  = fs.existsSync(tsxBin) ? tsxBin : tsNodeBin;
  const command     = isTsDev ? devCommand : 'node';
  const args        = isTsDev && !fs.existsSync(tsxBin)
    ? ['--transpile-only', serverFile]
    : [serverFile];

  return {
    command,
    args,
    env: {
      PILOT_SESSION_ID:          sessionId,
      PILOT_USER_ID:             ctx.userId,
      PILOT_AGENT_ID:            agentId,
      PILOT_PROJECT_ID:          ctx.projectId,
      PILOT_INTERNAL_URL:        `http://localhost:${process.env.PORT ?? '3000'}`,
      PILOT_SPEC_ID:             ctx.specId             ?? '',
      PILOT_SHIFT_ID:            ctx.shiftId            ?? '',
      PILOT_PARENT_SESSION_ID:   ctx.parentSessionId    ?? '',
    },
  };
}

function buildMcpConfig(agentId: string, sessionId: string, ctx: McpConfigCtx, fileKey?: string): string {
  // Always include the pilot internal MCP server
  const mcpServers: Record<string, unknown> = {
    pilot: pilotMcpEntry(sessionId, agentId, ctx),
  };

  // User-configured tools: department-inherited first, then direct (direct wins on key collision)
  const deptToolRows = db.prepare(`
    SELECT t.mcp_config FROM tools t
    JOIN department_tools dt ON dt.tool_id = t.id
    JOIN agents a ON a.department_id = dt.department_id
    WHERE a.id = ?
  `).all(agentId) as { mcp_config: string }[];

  const toolRows = db.prepare(`
    SELECT t.mcp_config FROM tools t
    JOIN agent_tools agt ON agt.tool_id = t.id
    WHERE agt.agent_id = ?
  `).all(agentId) as { mcp_config: string }[];

  for (const row of [...deptToolRows, ...toolRows]) {
    try { Object.assign(mcpServers, JSON.parse(row.mcp_config)); } catch { /* skip invalid */ }
  }

  // fileKey allows a unique filename without changing PILOT_SESSION_ID (needed for turn continuations)
  const configPath = path.join(DATA_DIR, `${fileKey ?? sessionId}-mcp.json`);
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
  const existing = db.prepare('SELECT journal FROM sessions WHERE id = ?').get(sessionId) as { journal: string | null } | undefined;
  if (existing?.journal) return; // already set via MCP update_journal tool
  try {
    const content = fs.readFileSync(path.join(worktreePath, 'JOURNAL.md'), 'utf-8').trim();
    if (content) db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(content, sessionId);
  } catch { /* no journal written — that's fine */ }
}

// ---------------------------------------------------------------------------
// Review capture
// ---------------------------------------------------------------------------

function captureReview(reviewSessionId: string, worktreePath: string): void {
  const existing = db.prepare('SELECT journal FROM sessions WHERE id = ?').get(reviewSessionId) as { journal: string | null } | undefined;
  if (existing?.journal) return; // already set via MCP submit_review tool
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
    interface ShiftTaskRow {
      title: string; status: string;
      started_at: string | null; completed_at: string | null;
      journal: string | null;
    }
    const shiftTasks = db.prepare(`
      SELECT t.title, t.status, t.started_at, t.completed_at,
        (SELECT s.journal FROM sessions s
         WHERE s.work_task_id = t.id AND s.journal IS NOT NULL
         ORDER BY s.created_at DESC LIMIT 1) as journal
      FROM tasks t
      WHERE t.shift_id = ?
      ORDER BY t.started_at ASC
    `).all(shiftId) as ShiftTaskRow[];

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
      if (t.journal) lines.push(`   ${t.journal.replace(/\n/g, '\n   ')}`);
    }

    db.prepare("UPDATE shifts SET report = ? WHERE id = ?").run(lines.join('\n'), shiftId);
  } catch { /* non-critical */ }
}

export async function advanceShift(shiftId: string, agentId: string, userId: string): Promise<void> {
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
    assignTaskToSession(nextTask.id, agentId, sessionId, now);

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
// Lead task capture — MCP create_task is the only supported path
// ---------------------------------------------------------------------------

async function captureTasks(session: SessionRef): Promise<void> {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE lead_session_id = ?').get(session.id) as { count: number };
  if (count === 0) return; // lead created no tasks — leave session in done/error for inspection

  markSessionMerged(session.id);
  if (session.workTaskId) markTaskDone(session.workTaskId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.projectId) as
    { id: string; name: string; repo_path: string; role: string; created_at: string } | undefined;
  if (project) {
    void removeWorktree(
      { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at },
      session.worktreePath,
    );
  }
}

// ---------------------------------------------------------------------------
// Spec capture (planning sessions)
// ---------------------------------------------------------------------------

function captureSpec(specId: string, worktreePath: string): void {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT content FROM specs WHERE id = ?').get(specId) as { content: string } | undefined;
  if (existing?.content) {
    // Already set via MCP update_spec tool — just mark as draft
    db.prepare('UPDATE specs SET status = ?, updated_at = ? WHERE id = ?').run('draft', now, specId);
    return;
  }
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
  const meta         = resolveAgentMeta(session.agentId);
  const model        = meta.model ?? undefined;
  const personality  = meta.personality ?? undefined;
  const connectionId = meta.connection_id ?? undefined;
  const isLead       = meta.role === 'lead';
  const knowledgeCtx  = buildKnowledgeContext(userId, session.agentId);
  const mcpConfigPath = buildMcpConfig(session.agentId, session.id, {
    userId,
    projectId:       session.projectId,
    specId:          session.specId,
    shiftId:         session.shiftId,
    parentSessionId: session.parentSessionId,
  });

  // Inject previous session journals if this task has been worked on before (up to 4, newest-first)
  let prevJournal: string | undefined;
  if (session.workTaskId && !session.parentSessionId) {
    const prevRows = db.prepare(
      "SELECT journal FROM sessions WHERE work_task_id = ? AND id != ? AND journal IS NOT NULL AND status IN ('done','error','merged') ORDER BY created_at DESC LIMIT 4"
    ).all(session.workTaskId, session.id) as { journal: string }[];
    if (prevRows.length > 0) prevJournal = prevRows.map(r => r.journal).join('\n\n---\n\n');
  }

  const journalInstruction = session.parentSessionId ? '' : isLead
    ? `\n\n---\n\nYou are a **Lead Agent**. Your only job is to coordinate — you must NOT write code or implement features yourself.\n\nYou have a \`pilot\` MCP server connected. These tools are available right now as direct MCP calls — do NOT search for them with ToolSearch or any other tool discovery mechanism:\n\n- \`list_agents\` — see available agents, their roles, and current status\n- \`create_task\` — create a subtask (title, prompt, baseBranch, role, priority)\n- \`get_task_status\` — check whether a subtask completed and read its journal\n- \`request_clarification\` — ask the user if the brief is ambiguous\n- \`append_journal\` — record your plan and decisions\n- \`skip_task\` — use this if the MCP tools are not responding\n\nRoles: "worker" (writes code), "reviewer" (reviews diffs), "planner" (writes specs)\n\n**Required first step**: Call \`list_agents\` immediately. If it fails or returns an error, call \`skip_task\` with reason "MCP connectivity failure" and stop — do NOT proceed without MCP tools.\n\nRules:\n- Never write, edit, or implement code\n- Keep each task focused — completable in one session\n- Use \`get_task_status\` to check subtask outcomes before creating dependent tasks`
    : `\n\n---\n\nYou have access to a \`pilot\` MCP server. Use these tools as you work:\n\n- \`append_journal\` — append progress notes at any point; call this often so partial work survives a crash\n- \`update_journal\` — replace the full journal; use this for your final summary when done\n- \`request_clarification\` — if you hit genuine ambiguity where guessing would waste significant effort, ask the user. They will respond in real time.\n- \`skip_task\` — if the task is blocked by something outside your control (missing dependency, broken environment), call this with a reason instead of failing silently.\n- \`get_quota_status\` — check if your API connection has rate limits before starting expensive operations.`;

  const promptParts = [
    knowledgeCtx,
    personality,
    prevJournal ? `# Handoff from Previous Session\n\n${prevJournal}` : '',
    prompt + journalInstruction,
  ].filter(Boolean);
  const effectivePrompt = promptParts.join('\n\n---\n\n');

  const { cmd, args } = buildCommand(session.provider, effectivePrompt, model, mcpConfigPath);
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
    markSessionFinished(session.id, 1);
    return;
  }

  broadcast('stderr', `[pilot] Starting ${cmd} in ${session.worktreePath}`);
  writeEvent(userId, 'session.started', { sessionId: session.id, taskId: session.workTaskId, projectId: session.projectId, agentId: session.agentId });

  const proc = spawn(bin, args, { cwd: session.worktreePath, env, stdio: ['ignore', 'pipe', 'pipe'] });
  entry.proc = proc;
  markSessionRunning(session.id);

  // Capture the runner's session ID from the first parseable JSON line so we
  // can resume the session in subsequent turns.
  let runnerSidCaptured = false;
  let stdoutLineBuf     = '';

  proc.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    broadcast('stdout', text);
    if (runnerSidCaptured) return;
    stdoutLineBuf += text;
    const lines = stdoutLineBuf.split('\n');
    stdoutLineBuf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line.trim());
        const sid = obj.session_id ?? obj.sessionId;
        if (sid && typeof sid === 'string' && sid.length > 4) {
          db.prepare('UPDATE sessions SET runner_session_id = ? WHERE id = ?').run(sid, session.id);
          runnerSidCaptured = true;
          break;
        }
      } catch { /* not JSON — skip */ }
    }
  });
  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderrAccum = (stderrAccum + text).slice(-8192);
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
    markSessionFinished(session.id, exitCode);
    writeEvent(userId, exitCode === 0 ? 'session.completed' : 'session.failed', { sessionId: session.id, taskId: session.workTaskId, projectId: session.projectId, agentId: session.agentId });
    if (mcpConfigPath) { try { fs.unlinkSync(mcpConfigPath); } catch { /* already gone */ } }
    if (session.specId) captureSpec(session.specId, session.worktreePath);
    if (session.parentSessionId) {
      captureReview(session.id, session.worktreePath);
    } else if (isLead) {
      captureJournal(session.id, session.worktreePath);
      void captureTasks(session); // always run — count > 0 branch dismisses even on non-zero exit
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
// Turn continuation — resumes an existing runner session with a new prompt
// ---------------------------------------------------------------------------

export async function continueAgent(
  session: SessionRef,
  turnId: string,
  turnNumber: number,
  prompt: string,
  userId: string,
  agentId?: string,
  explicitKey?: string,
): Promise<void> {
  if (active.has(session.id)) return;

  const runnerRow = db.prepare('SELECT runner_session_id FROM sessions WHERE id = ?').get(session.id) as { runner_session_id: string | null } | undefined;
  const runnerSessionId = runnerRow?.runner_session_id ?? undefined;

  if (!runnerSessionId) {
    // Broadcast an informative error into the session log so the UI shows it
    const errEntry: ActiveSession = { proc: null as any, buffer: [], subs: new Set() };
    active.set(session.id, errEntry);
    const broadcastErr = (type: string, data: string) => {
      const msg = JSON.stringify({ type, sessionId: session.id, data });
      errEntry.buffer.push(msg);
      fs.appendFileSync(sessionLogPath(session.id), msg + '\n');
      for (const ws of errEntry.subs) { if (ws.readyState === WebSocket.OPEN) ws.send(msg); }
    };
    broadcastErr('turn_start', JSON.stringify({ turnId, turnNumber, prompt }));
    broadcastErr('stderr', '[pilot] Cannot continue: no runner session ID captured from the original run.');
    broadcastErr('turn_done', JSON.stringify({ turnId, exitCode: '1' }));
    active.delete(session.id);
    db.prepare("UPDATE turns SET status = 'error', completed_at = ? WHERE id = ?").run(new Date().toISOString(), turnId);
    db.prepare("UPDATE sessions SET status = 'error' WHERE id = ?").run(session.id);
    return;
  }

  const resolvedKey   = resolveApiKey(userId, session.provider, agentId, explicitKey);
  const meta          = resolveAgentMeta(session.agentId);
  const model         = meta.model ?? undefined;
  const connectionId  = meta.connection_id ?? undefined;
  const mcpConfigPath = buildMcpConfig(
    session.agentId, session.id,
    { userId, projectId: session.projectId, shiftId: session.shiftId, parentSessionId: session.parentSessionId },
    `${session.id}-t${turnNumber}`,
  );

  // Re-inject knowledge + personality so turns reflect any updates since the original session
  const personality  = meta.personality ?? undefined;
  const knowledgeCtx = buildKnowledgeContext(userId, session.agentId);
  const turnParts    = [knowledgeCtx, personality, prompt].filter(Boolean);
  const effectivePrompt = turnParts.join('\n\n---\n\n');

  const { cmd, args } = buildCommand(session.provider, effectivePrompt, model, mcpConfigPath, runnerSessionId);
  const env = resolvedKey
    ? { ...resolvedEnv(process.env as Record<string, string | undefined>), ...apiKeyEnv(session.provider, resolvedKey) }
    : resolvedEnv(process.env as Record<string, string | undefined>);

  const entry: ActiveSession = { proc: null as any, buffer: [], subs: new Set() };
  active.set(session.id, entry);

  // Append to existing log (do NOT wipe — preserve prior turn output)
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

  broadcast('turn_start', JSON.stringify({ turnId, turnNumber, prompt })); // shows original prompt, not expanded

  if (!resolvedKey) {
    broadcast('stderr', `[pilot] No API key set — using machine auth for ${session.provider}.`);
  }

  const bin = findBinary(cmd);
  if (!bin) {
    broadcast('stderr', `[pilot] Command not found: '${cmd}'`);
    broadcast('turn_done', JSON.stringify({ turnId, exitCode: '127' }));
    active.delete(session.id);
    db.prepare("UPDATE turns SET status = 'error', completed_at = ? WHERE id = ?").run(new Date().toISOString(), turnId);
    db.prepare("UPDATE sessions SET status = 'error' WHERE id = ?").run(session.id);
    if (mcpConfigPath) { try { fs.unlinkSync(mcpConfigPath); } catch { /* gone */ } }
    return;
  }

  broadcast('stderr', `[pilot] Continuing ${cmd} (turn ${turnNumber})`);
  db.prepare("UPDATE sessions SET status = 'running' WHERE id = ?").run(session.id);

  let runnerSidCaptured = !!runnerSessionId; // already have one, update if new one emitted
  let stdoutLineBuf     = '';

  const proc = spawn(bin, args, { cwd: session.worktreePath, env, stdio: ['ignore', 'pipe', 'pipe'] });
  entry.proc = proc;

  proc.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    broadcast('stdout', text);
    if (runnerSidCaptured) return;
    stdoutLineBuf += text;
    const lines = stdoutLineBuf.split('\n');
    stdoutLineBuf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line.trim());
        const sid = obj.session_id ?? obj.sessionId;
        if (sid && typeof sid === 'string' && sid.length > 4) {
          db.prepare('UPDATE sessions SET runner_session_id = ? WHERE id = ?').run(sid, session.id);
          runnerSidCaptured = true;
          break;
        }
      } catch { /* skip */ }
    }
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderrAccum = (stderrAccum + text).slice(-8192);
    broadcast('stderr', text);
  });

  const finish = (code: number | null, _signal: string | null) => {
    const exitCode = code ?? 1;
    const now      = new Date().toISOString();
    broadcast('stderr', exitCode === 0 ? '[pilot] Turn finished (exit 0)' : `[pilot] Turn exited with code ${exitCode}`);
    broadcast('turn_done', JSON.stringify({ turnId, exitCode: String(exitCode) }));

    completed.set(session.id, [...entry.buffer]);
    setTimeout(() => completed.delete(session.id), COMPLETED_TTL_MS);
    active.delete(session.id);

    const sessionStatus = exitCode === 0 ? 'done' : 'error';
    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(sessionStatus, session.id);
    db.prepare('UPDATE turns SET status = ?, completed_at = ? WHERE id = ?').run(sessionStatus, now, turnId);

    if (mcpConfigPath) { try { fs.unlinkSync(mcpConfigPath); } catch { /* gone */ } }
    captureJournal(session.id, session.worktreePath);
    writeEvent(userId, exitCode === 0 ? 'session.completed' : 'session.failed', {
      sessionId: session.id, taskId: session.workTaskId, projectId: session.projectId, agentId: session.agentId,
    });
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

export function broadcastToSession(sessionId: string, type: string, data: string): void {
  const entry = active.get(sessionId);
  if (!entry) return;
  const msg = JSON.stringify({ type, sessionId, data });
  entry.buffer.push(msg);
  if (entry.buffer.length > MAX_BUFFER) entry.buffer.shift();
  fs.appendFileSync(sessionLogPath(sessionId), msg + '\n');
  for (const ws of entry.subs) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

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
  if (entry) entry.proc.kill('SIGTERM');
  // Don't remove from active here — finish() handles cleanup when the process closes
}

export function agentHealth(): Record<string, { available: boolean; path: string | null }> {
  const claudePath = findBinary('claude');
  const codexPath  = findBinary('codex');
  return {
    claude: { available: !!claudePath, path: claudePath },
    codex:  { available: !!codexPath,  path: codexPath  },
  };
}
