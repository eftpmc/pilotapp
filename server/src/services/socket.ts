import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { runAgent, subscribeToSession, unsubscribeFromAllSessions, isSessionActive } from './agents';
import { AuthPayload } from '../types';
import { JWT_SECRET } from '../middleware/auth';
import { db } from '../db';
import { SessionRow, toSession } from '../routes/_helpers';

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

        if (session && (session.status === 'done' || session.status === 'error')) {
          send(ws, 'done', session.status === 'error' ? '1' : '0', msg.sessionId);
        } else {
          send(ws, 'error', 'Session not active', msg.sessionId);
        }
        return;
      }

      if (msg.type === 'run') {
        if (isSessionActive(msg.sessionId)) { subscribeToSession(msg.sessionId, ws); return; }
        const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(msg.sessionId, uid) as SessionRow | undefined;
        if (!session) { send(ws, 'error', 'Session not found'); return; }
        void runAgent(toSession(session), msg.prompt, uid);
        subscribeToSession(msg.sessionId, ws);
      }
    });
  });
}
