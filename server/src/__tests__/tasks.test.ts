/**
 * Tests for task routes — CRUD, priority, assign.
 */

import { describe, test, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import { db } from '../db';
import { scaffold, seedSession, seedTask } from './helpers';

describe('GET /tasks', () => {
  test('returns pending tasks sorted by priority desc then createdAt asc', async () => {
    const { user, project, token } = scaffold();
    seedTask(user.id, project.id, { title: 'Low',    priority: 1 });
    seedTask(user.id, project.id, { title: 'High',   priority: 9 });
    seedTask(user.id, project.id, { title: 'Medium', priority: 5 });

    const res = await request(app)
      .get('/tasks?status=pending')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const titles = res.body.map((t: { title: string }) => t.title);
    expect(titles).toEqual(['High', 'Medium', 'Low']);
  });

  test('only returns tasks for the authenticated user', async () => {
    const s1 = scaffold();
    const s2 = scaffold();
    seedTask(s1.user.id, s1.project.id, { title: 'User1 Task' });
    seedTask(s2.user.id, s2.project.id, { title: 'User2 Task' });

    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${s1.token}`);
    expect(res.status).toBe(200);
    expect(res.body.every((t: { title: string }) => t.title === 'User1 Task')).toBe(true);
  });
});

describe('POST /tasks', () => {
  test('creates a task with correct defaults', async () => {
    const { project, token } = scaffold();

    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: project.id, title: 'New feature', prompt: 'build it' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.priority).toBe(0);
    expect(res.body.size).toBe('m');
    expect(res.body.title).toBe('New feature');
  });

  test('rejects missing title', async () => {
    const { project, token } = scaffold();
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: project.id, prompt: 'no title' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /tasks/:id', () => {
  test('updates priority', async () => {
    const { user, project, token } = scaffold();
    const task = seedTask(user.id, project.id);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 7 });

    expect(res.status).toBe(200);
    expect(res.body.priority).toBe(7);
  });
});

describe('DELETE /tasks/:id', () => {
  test('removes a pending task', async () => {
    const { user, project, token } = scaffold();
    const task = seedTask(user.id, project.id);

    const res = await request(app)
      .delete(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    const row = db.prepare('SELECT id FROM tasks WHERE id = ?').get(task.id);
    expect(row).toBeUndefined();
  });
});

describe('POST /tasks/:id/assign', () => {
  test('creates a session for the assigned agent', async () => {
    const { user, agent, project, token } = scaffold();
    const task = seedTask(user.id, project.id);

    const res = await request(app)
      .post(`/tasks/${task.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ agentId: agent.id });

    expect(res.status).toBe(201);
    expect(res.body.session.agentId).toBe(agent.id);
    expect(res.body.task.status).toBe('running');

    const sessionRow = db.prepare('SELECT work_task_id FROM sessions WHERE id = ?').get(res.body.session.id) as { work_task_id: string };
    expect(sessionRow.work_task_id).toBe(task.id);
  });

  test('rejects assigning to a non-pending task', async () => {
    const { user, agent, project, token } = scaffold();
    const task = seedTask(user.id, project.id, { status: 'running' });

    const res = await request(app)
      .post(`/tasks/${task.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ agentId: agent.id });

    expect(res.status).toBe(400);
  });
});

describe('POST /tasks/queue/run', () => {
  test('does not dispatch to an agent with an idle session', async () => {
    const { user, agent, project, token } = scaffold();
    seedSession(user.id, agent.id, project.id, { status: 'idle' });
    seedTask(user.id, project.id);

    const res = await request(app)
      .post('/tasks/queue/run')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.dispatched).toEqual([]);
  });
});
