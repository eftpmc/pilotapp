/**
 * Tests for session API routes — request-review, merge, stop, discard.
 */

import { describe, test, expect, vi } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import app from '../app';
import { db } from '../db';
import { scaffold, seedTask, seedSession, seedAgent } from './helpers';
import { attachWebSocket } from '../services/socket';
import { mergeWorktree } from '../services/git';

describe('POST /sessions/:id/request-review', () => {
  test('creates a review session with correct parentSessionId', async () => {
    const { user, agent, project, token } = scaffold();
    const reviewer = seedAgent(user.id, { name: 'Reviewer' });
    const task = seedTask(user.id, project.id);
    const session = seedSession(user.id, agent.id, project.id, { status: 'done', workTaskId: task.id });

    const res = await request(app)
      .post(`/sessions/${session.id}/request-review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ agentId: reviewer.id });

    expect(res.status).toBe(201);
    expect(res.body.parentSessionId).toBe(session.id);
    expect(res.body.agentId).toBe(reviewer.id);
    expect(res.body.branch).toMatch(/^review\//);

    // Parent session should now be 'pending' verdict
    const parentRow = db.prepare('SELECT review_verdict FROM sessions WHERE id = ?').get(session.id) as { review_verdict: string };
    expect(parentRow.review_verdict).toBe('pending');
  });

  test('rejects review request on a running session', async () => {
    const { user, agent, project, token } = scaffold();
    const reviewer = seedAgent(user.id, { name: 'Reviewer' });
    const session = seedSession(user.id, agent.id, project.id, { status: 'running' });

    const res = await request(app)
      .post(`/sessions/${session.id}/request-review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ agentId: reviewer.id });

    expect(res.status).toBe(400);
  });

  test('rejects if session already has a non-pending verdict', async () => {
    const { user, agent, project, token } = scaffold();
    const reviewer = seedAgent(user.id, { name: 'Reviewer' });
    const session = seedSession(user.id, agent.id, project.id, { status: 'done', reviewVerdict: 'approved' });

    const res = await request(app)
      .post(`/sessions/${session.id}/request-review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ agentId: reviewer.id });

    expect(res.status).toBe(400);
  });

  test('rejects unknown reviewer agentId', async () => {
    const { user, agent, project, token } = scaffold();
    const session = seedSession(user.id, agent.id, project.id, { status: 'done' });

    const res = await request(app)
      .post(`/sessions/${session.id}/request-review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ agentId: 'non-existent-id' });

    expect(res.status).toBe(404);
  });
});

describe('POST /sessions/:id/merge', () => {
  test('sets session status to merged', async () => {
    const { user, agent, project, token } = scaffold();
    const session = seedSession(user.id, agent.id, project.id, { status: 'done' });

    const res = await request(app)
      .post(`/sessions/${session.id}/merge`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(row.status).toBe('merged');
  });

  test('returns 401 without token', async () => {
    const { user, agent, project } = scaffold();
    const session = seedSession(user.id, agent.id, project.id, { status: 'done' });

    const res = await request(app).post(`/sessions/${session.id}/merge`);
    expect(res.status).toBe(401);
  });

  test('rejects merging an errored session', async () => {
    const { user, agent, project, token } = scaffold();
    const session = seedSession(user.id, agent.id, project.id, { status: 'error' });

    const res = await request(app)
      .post(`/sessions/${session.id}/merge`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  test('rejects merging a review session', async () => {
    const { user, agent, project, token } = scaffold();
    const parent = seedSession(user.id, agent.id, project.id, { status: 'done' });
    const review = seedSession(user.id, agent.id, project.id, { status: 'done', parentSessionId: parent.id, branch: 'review/test' });

    const res = await request(app)
      .post(`/sessions/${review.id}/merge`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  test('returns conflict and keeps session unmerged when git merge conflicts', async () => {
    const { user, agent, project, token } = scaffold();
    const session = seedSession(user.id, agent.id, project.id, { status: 'done' });
    vi.mocked(mergeWorktree).mockRejectedValueOnce(new Error('CONFLICT (content): Automatic merge failed'));

    const res = await request(app)
      .post(`/sessions/${session.id}/merge`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(row.status).toBe('done');
  });
});

describe('DELETE /sessions/:id (discard)', () => {
  test('removes the session', async () => {
    const { user, agent, project, token } = scaffold();
    const session = seedSession(user.id, agent.id, project.id, { status: 'done' });

    const res = await request(app)
      .delete(`/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    const row = db.prepare('SELECT id FROM sessions WHERE id = ?').get(session.id);
    expect(row).toBeUndefined();
  });

  test('cannot discard a merged session', async () => {
    const { user, agent, project, token } = scaffold();
    const session = seedSession(user.id, agent.id, project.id, { status: 'merged' });

    const res = await request(app)
      .delete(`/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /sessions', () => {
  test('only returns sessions belonging to the authenticated user', async () => {
    const s1 = scaffold();
    const s2 = scaffold(); // different user
    seedSession(s1.user.id, s1.agent.id, s1.project.id);
    seedSession(s2.user.id, s2.agent.id, s2.project.id);

    const res = await request(app)
      .get('/sessions')
      .set('Authorization', `Bearer ${s1.token}`);

    expect(res.status).toBe(200);
    const ids = res.body.map((s: { agentId: string }) => s.agentId);
    expect(ids.every((id: string) => id === s1.agent.id)).toBe(true);
  });
});

describe('WebSocket session auth', () => {
  async function withSocketServer<T>(fn: (url: string) => Promise<T>): Promise<T> {
    const server = createServer(app);
    const wss = new WebSocketServer({ server, path: '/ws' });
    attachWebSocket(wss);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
    const url = `ws://127.0.0.1:${address.port}/ws`;

    try {
      return await fn(url);
    } finally {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  function socketMessage(url: string, token: string, payload: unknown): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${url}?token=${token}`);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Timed out waiting for WebSocket message'));
      }, 1000);

      ws.on('open', () => ws.send(JSON.stringify(payload)));
      ws.on('message', (raw) => {
        clearTimeout(timer);
        ws.close();
        resolve(JSON.parse(raw.toString()) as Record<string, unknown>);
      });
      ws.on('error', reject);
    });
  }

  test('does not replay another user session log', async () => {
    const s1 = scaffold();
    const s2 = scaffold();
    const otherSession = seedSession(s2.user.id, s2.agent.id, s2.project.id, { status: 'done' });
    fs.writeFileSync(path.join(process.env.DATA_DIR!, `${otherSession.id}.log`), JSON.stringify({ type: 'stdout', data: 'secret output' }) + '\n');

    await withSocketServer(async (url) => {
      const msg = await socketMessage(url, s1.token, { type: 'subscribe', sessionId: otherSession.id });
      expect(msg.type).toBe('error');
      expect(msg.data).toBe('Session not found');
    });
  });

  test('replays an owned persisted session log', async () => {
    const { user, agent, project, token } = scaffold();
    const session = seedSession(user.id, agent.id, project.id, { status: 'done' });
    fs.writeFileSync(path.join(process.env.DATA_DIR!, `${session.id}.log`), JSON.stringify({ type: 'stdout', data: 'owned output' }) + '\n');

    await withSocketServer(async (url) => {
      const msg = await socketMessage(url, token, { type: 'subscribe', sessionId: session.id });
      expect(msg.type).toBe('stdout');
      expect(msg.data).toBe('owned output');
    });
  });
});
