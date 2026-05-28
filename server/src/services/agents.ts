import { spawn, execSync } from 'child_process';
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

function buildCommand(provider: AgentProvider, prompt: string): { cmd: string; args: string[] } {
  if (provider === 'claude') {
    return { cmd: 'claude', args: ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json'] };
  }
  return { cmd: 'codex', args: ['--approval-policy', 'auto', '-q', prompt] };
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
// Core runner
// ---------------------------------------------------------------------------

export async function runAgent(session: SessionRef, prompt: string, userId: string, explicitKey?: string): Promise<void> {
  if (active.has(session.id)) return;

  const resolvedKey = resolveApiKey(userId, session.provider, explicitKey);

  const { cmd, args } = buildCommand(session.provider, prompt);
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

  if (!resolvedKey) {
    broadcast('stderr', `[pilot] No API key configured for provider '${session.provider}'. Set one in Settings.`);
    broadcast('done', '1');
    active.delete(session.id);
    completed.set(session.id, [...entry.buffer]);
    setTimeout(() => completed.delete(session.id), COMPLETED_TTL_MS);
    updateSessionStatus(session.id, 'error');
    updateTaskStatusForSession(session.id, 'failed');
    return;
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

  const proc = spawn(bin, args, { cwd: session.worktreePath, env });
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
