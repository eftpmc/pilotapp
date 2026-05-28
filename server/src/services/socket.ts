import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { runAgent, subscribeToSession, unsubscribeFromAllSessions, isSessionActive, SessionRef } from './agents';
import { AuthPayload } from '../types';
import { db } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

interface SessionRow {
  id: string; user_id: string; agent_id: string; project_id: string;
  work_task_id: string | null; provider: string; branch: string;
  worktree_path: string; status: string; created_at: string;
}

interface TaskRow { id: string; prompt: string; status: string }

function toSessionRef(r: SessionRow): SessionRef {
  return {
    id: r.id, agentId: r.agent_id, projectId: r.project_id,
    workTaskId: r.work_task_id ?? undefined, provider: r.provider as any,
    branch: r.branch, worktreePath: r.worktree_path, status: r.status, createdAt: r.created_at,
  };
}

type ClientMessage =
  | { type: 'run';       sessionId: string; prompt: string }
  | { type: 'subscribe'; sessionId: string };

function send(ws: WebSocket, type: string, data: string, sessionId?: string): void {
  ws.send(JSON.stringify({ type, data, ...(sessionId ? { sessionId } : {}) }));
}

export function attachWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) { ws.close(4001, 'Missing token'); return; }

    let uid: string;
    try {
      uid = (jwt.verify(token, JWT_SECRET) as AuthPayload).userId;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.on('close', () => unsubscribeFromAllSessions(ws));

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()); }
      catch { send(ws, 'error', 'Invalid JSON'); return; }

      if (msg.type === 'subscribe') {
        if (subscribeToSession(msg.sessionId, ws)) return;

        const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(msg.sessionId, uid) as SessionRow | undefined;

        if (session?.work_task_id && session.status === 'idle') {
          const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(session.work_task_id) as TaskRow | undefined;
          if (task && task.status !== 'done' && task.status !== 'failed') {
            void runAgent(toSessionRef(session), task.prompt, uid);
            subscribeToSession(msg.sessionId, ws);
            return;
          }
        }

        if (session && (session.status === 'done' || session.status === 'error')) {
          send(ws, 'done', '0', msg.sessionId);
        } else {
          send(ws, 'error', 'Session not active', msg.sessionId);
        }
        return;
      }

      if (msg.type === 'run') {
        if (isSessionActive(msg.sessionId)) { subscribeToSession(msg.sessionId, ws); return; }
        const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(msg.sessionId, uid) as SessionRow | undefined;
        if (!session) { send(ws, 'error', 'Session not found'); return; }
        void runAgent(toSessionRef(session), msg.prompt, uid);
        subscribeToSession(msg.sessionId, ws);
      }
    });
  });
}
