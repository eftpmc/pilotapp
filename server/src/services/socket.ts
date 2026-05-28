import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { runAgent, subscribeToSession, unsubscribeFromAllSessions, isSessionActive } from './agents';
import { AuthPayload, AgentSession, Task } from '../types';
import fs from 'fs/promises';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || './data/projects';

async function readSessions(): Promise<AgentSession[]> {
  try {
    const raw = await fs.readFile(path.join(PROJECTS_ROOT, 'sessions.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function readTasks(): Promise<Task[]> {
  try {
    const raw = await fs.readFile(path.join(PROJECTS_ROOT, 'tasks.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

type ClientMessage =
  | { type: 'run';       sessionId: string; prompt: string; apiKey: string }
  | { type: 'subscribe'; sessionId: string; apiKey?: string };

function send(ws: WebSocket, type: string, data: string, sessionId?: string): void {
  ws.send(JSON.stringify({ type, data, ...(sessionId ? { sessionId } : {}) }));
}

export function attachWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://localhost`);
    const token = url.searchParams.get('token');

    if (!token) { ws.close(4001, 'Missing token'); return; }
    try {
      jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.on('close', () => unsubscribeFromAllSessions(ws));

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, 'error', 'Invalid JSON');
        return;
      }

      if (msg.type === 'subscribe') {
        // Try to attach to an already-running session
        if (subscribeToSession(msg.sessionId, ws)) return;

        // Session not currently active — check if it's an idle task session we can start
        if (msg.apiKey) {
          const [sessions, tasks] = await Promise.all([readSessions(), readTasks()]);
          const session = sessions.find((s) => s.id === msg.sessionId);
          if (session?.workTaskId) {
            const task = tasks.find((t) => t.id === session.workTaskId);
            if (task && task.status !== 'done' && task.status !== 'failed') {
              runAgent(session, task.prompt, msg.apiKey);
              subscribeToSession(msg.sessionId, ws);
              return;
            }
          }
        }

        // Already finished or no task — send a terminal done so the UI settles
        const sessions = await readSessions();
        const session = sessions.find((s) => s.id === msg.sessionId);
        if (session && (session.status === 'done' || session.status === 'error')) {
          send(ws, 'done', '0', msg.sessionId);
        } else {
          send(ws, 'error', 'Session not active', msg.sessionId);
        }
        return;
      }

      if (msg.type === 'run') {
        // Direct dispatch — client provides prompt + apiKey
        if (isSessionActive(msg.sessionId)) {
          subscribeToSession(msg.sessionId, ws);
          return;
        }
        const sessions = await readSessions();
        const session = sessions.find((s) => s.id === msg.sessionId);
        if (!session) { send(ws, 'error', 'Session not found'); return; }
        runAgent(session, msg.prompt, msg.apiKey);
        subscribeToSession(msg.sessionId, ws);
      }
    });
  });
}
