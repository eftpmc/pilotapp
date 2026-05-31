/**
 * Tests for session API routes — request-review, merge, stop, discard.
 */

import { describe, test, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import { db } from '../db';
import { scaffold, seedTask, seedSession, seedAgent } from './helpers';

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
