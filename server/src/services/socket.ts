import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { runAgent } from './agents';
import { AuthPayload, AgentSession } from '../types';
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

interface RunMessage {
  type: 'run';
  sessionId: string;
  prompt: string;
  apiKey: string;
}

export function attachWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://localhost`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.on('message', async (raw) => {
      let msg: RunMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', data: 'Invalid JSON' }));
        return;
      }

      if (msg.type === 'run') {
        const sessions = await readSessions();
        const session = sessions.find((s) => s.id === msg.sessionId);
        if (!session) {
          ws.send(JSON.stringify({ type: 'error', data: 'Session not found' }));
          return;
        }
        runAgent(session, msg.prompt, msg.apiKey, ws);
      }
    });
  });
}
