import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { AgentProvider } from '../types';
import WebSocket from 'ws';
import { db } from '../db';
import { resolveApiKey } from '../routes/settings';

const COMPLETED_TTL_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Session shape expected by this service
// ---------------------------------------------------------------------------

export interface SessionRef {
  id: string;
  agentId: string;
  projectId: string;
  workTaskId?: string;
  specId?: string;
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

const EXTRA_PATHS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  `${process.env.HOME}/.nvm/versions/node/*/bin`,
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

function buildCommand(provider: AgentProvider, prompt: string, model?: string): { cmd: string; args: string[] } {
  if (provider === 'claude') {
    const args = ['-p', prompt, '--dangerously-skip-permissions', '--verbose', '--output-format', 'stream-json'];
    if (model) args.push('--model', model);
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

  const resolvedKey = resolveApiKey(userId, session.provider, agentId, explicitKey);
  const model = resolveModel(session.agentId);

  const { cmd, args } = buildCommand(session.provider, prompt, model);
  const env = resolvedKey
    ? { ...resolvedEnv(process.env as Record<string, string | undefined>), ...apiKeyEnv(session.provider, resolvedKey) }
    : resolvedEnv(process.env as Record<string, string | undefined>);

  const entry: ActiveSession = { proc: null as any, buffer: [], subs: new Set() };
  active.set(session.id, entry);

  const broadcast = (type: string, data: string) => {
    const msg = JSON.stringify({ type, sessionId: session.id, data });
    entry.buffer.push(msg);
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

  const proc = spawn(bin, args, { cwd: session.worktreePath, env, stdio: ['ignore', 'pipe', 'pipe'] });
  entry.proc = proc;
  updateSessionStatus(session.id, 'running');

  proc.stdout.on('data', (chunk: Buffer) => broadcast('stdout', chunk.toString()));
  proc.stderr.on('data', (chunk: Buffer) => broadcast('stderr', chunk.toString()));

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
    if (session.specId) captureSpec(session.specId, session.worktreePath);
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
    for (const msg of entry.buffer) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
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
  return false;
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
  return {
    claude: { available: !!findBinary('claude'), path: findBinary('claude') },
    codex:  { available: !!findBinary('codex'),  path: findBinary('codex') },
  };
}
