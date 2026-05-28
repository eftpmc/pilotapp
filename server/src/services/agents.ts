import { spawn, ChildProcess } from 'child_process';
import { AgentSession, AgentProvider, Task } from '../types';
import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || './data/projects';
const SESSIONS_FILE = path.join(PROJECTS_ROOT, 'sessions.json');
const TASKS_FILE = path.join(PROJECTS_ROOT, 'tasks.json');

async function updateSessionStatus(sessionId: string, status: AgentSession['status']): Promise<void> {
  try {
    const raw = await fs.readFile(SESSIONS_FILE, 'utf-8');
    const sessions: AgentSession[] = JSON.parse(raw);
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx !== -1) {
      sessions[idx].status = status;
      await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    }
  } catch {}
}

async function updateTaskStatusForSession(sessionId: string, status: Task['status']): Promise<void> {
  try {
    const sessionsRaw = await fs.readFile(SESSIONS_FILE, 'utf-8');
    const sessions: AgentSession[] = JSON.parse(sessionsRaw);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.workTaskId) return;

    const tasksRaw = await fs.readFile(TASKS_FILE, 'utf-8');
    const tasks: Task[] = JSON.parse(tasksRaw);
    const idx = tasks.findIndex((t) => t.id === session.workTaskId);
    if (idx !== -1) {
      tasks[idx].status = status;
      tasks[idx].completedAt = new Date().toISOString();
      await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
    }
  } catch {}
}

interface ActiveSession {
  proc: ChildProcess;
  buffer: string[];      // serialized JSON messages — replayed to late subscribers
  subs: Set<WebSocket>;
}

const active = new Map<string, ActiveSession>();

function buildCommand(provider: AgentProvider, prompt: string): { cmd: string; args: string[] } {
  if (provider === 'claude') {
    return {
      cmd: 'claude',
      args: ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json'],
    };
  }
  return { cmd: 'codex', args: ['-q', prompt] };
}

function apiKeyEnv(provider: AgentProvider, apiKey: string): Record<string, string> {
  return provider === 'claude' ? { ANTHROPIC_API_KEY: apiKey } : { OPENAI_API_KEY: apiKey };
}

export function runAgent(session: AgentSession, prompt: string, apiKey: string): void {
  if (active.has(session.id)) return; // already running

  const { cmd, args } = buildCommand(session.provider, prompt);
  const proc = spawn(cmd, args, {
    cwd: session.worktreePath,
    env: { ...process.env, ...apiKeyEnv(session.provider, apiKey) },
  });

  const entry: ActiveSession = { proc, buffer: [], subs: new Set() };
  active.set(session.id, entry);
  updateSessionStatus(session.id, 'running');

  const broadcast = (type: string, data: string) => {
    const msg = JSON.stringify({ type, sessionId: session.id, data });
    entry.buffer.push(msg);
    for (const ws of entry.subs) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  };

  proc.stdout.on('data', (chunk: Buffer) => broadcast('stdout', chunk.toString()));
  proc.stderr.on('data', (chunk: Buffer) => broadcast('stderr', chunk.toString()));

  proc.on('close', (code) => {
    const status = code === 0 ? 'done' : 'error';
    broadcast('done', String(code ?? 1));
    active.delete(session.id);
    updateSessionStatus(session.id, status);
    updateTaskStatusForSession(session.id, status === 'done' ? 'done' : 'failed');
  });

  proc.on('error', (err) => {
    broadcast('error', err.message);
    active.delete(session.id);
    updateSessionStatus(session.id, 'error');
    updateTaskStatusForSession(session.id, 'failed');
  });
}

/** Replay buffered output then subscribe for live output. Returns false if session not active. */
export function subscribeToSession(sessionId: string, ws: WebSocket): boolean {
  const entry = active.get(sessionId);
  if (!entry) return false;
  for (const msg of entry.buffer) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
  entry.subs.add(ws);
  return true;
}

export function unsubscribeFromAllSessions(ws: WebSocket): void {
  for (const entry of active.values()) {
    entry.subs.delete(ws);
  }
}

export function isSessionActive(sessionId: string): boolean {
  return active.has(sessionId);
}

export function killAgent(sessionId: string): void {
  const entry = active.get(sessionId);
  if (entry) {
    entry.proc.kill('SIGTERM');
    active.delete(sessionId);
  }
}
