import { spawn, ChildProcess } from 'child_process';
import { AgentSession, AgentProvider } from '../types';
import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';

const SESSIONS_FILE = path.join(process.env.PROJECTS_ROOT || './data/projects', 'sessions.json');

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

const activeSessions = new Map<string, ChildProcess>();

function buildCommand(provider: AgentProvider, prompt: string): { cmd: string; args: string[] } {
  if (provider === 'claude') {
    return {
      cmd: 'claude',
      args: ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json'],
    };
  }
  return {
    cmd: 'codex',
    args: ['-q', prompt],
  };
}

export function runAgent(
  session: AgentSession,
  prompt: string,
  apiKey: string,
  ws: WebSocket
): void {
  const { cmd, args } = buildCommand(session.provider, prompt);

  const proc = spawn(cmd, args, {
    cwd: session.worktreePath,
    env: {
      ...process.env,
      ...(session.provider === 'claude' ? { ANTHROPIC_API_KEY: apiKey } : { OPENAI_API_KEY: apiKey }),
    },
  });

  activeSessions.set(session.id, proc);
  updateSessionStatus(session.id, 'running');

  const send = (type: string, data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, sessionId: session.id, data }));
    }
  };

  proc.stdout.on('data', (chunk: Buffer) => send('stdout', chunk.toString()));
  proc.stderr.on('data', (chunk: Buffer) => send('stderr', chunk.toString()));

  proc.on('close', (code) => {
    send('done', String(code));
    activeSessions.delete(session.id);
    updateSessionStatus(session.id, code === 0 ? 'done' : 'error');
  });

  proc.on('error', (err) => {
    send('error', err.message);
    activeSessions.delete(session.id);
    updateSessionStatus(session.id, 'error');
  });
}

export function killAgent(sessionId: string): void {
  const proc = activeSessions.get(sessionId);
  if (proc) {
    proc.kill('SIGTERM');
    activeSessions.delete(sessionId);
  }
}
