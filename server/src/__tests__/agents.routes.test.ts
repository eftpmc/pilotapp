/**
 * Tests for agent routes.
 */

import { describe, expect, test } from 'vitest';
import request from 'supertest';
import app from '../app';
import { db } from '../db';
import { scaffold, seedAgent, seedConnection } from './helpers';

describe('PATCH /employees/:id', () => {
  test('updates an agent connection and provider together', async () => {
    const { user, agent, token } = scaffold();
    const codex = seedConnection(user.id, { name: 'Codex', type: 'codex' });

    const res = await request(app)
      .patch(`/employees/${agent.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ connectionId: codex.id });

    expect(res.status).toBe(200);
    expect(res.body.connectionId).toBe(codex.id);
    expect(res.body.provider).toBe('codex');

    const row = db.prepare('SELECT connection_id, provider FROM agents WHERE id = ?').get(agent.id) as
      | { connection_id: string; provider: string }
      | undefined;
    expect(row?.connection_id).toBe(codex.id);
    expect(row?.provider).toBe('codex');
  });

  test('rejects moving a lead agent to a non-Claude connection', async () => {
    const { user, token } = scaffold();
    const claude = seedConnection(user.id, { name: 'Claude', type: 'claude' });
    const codex = seedConnection(user.id, { name: 'Codex', type: 'codex' });
    const lead = seedAgent(user.id, { name: 'Lead', role: 'lead', connectionId: claude.id });

    const res = await request(app)
      .patch(`/employees/${lead.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ connectionId: codex.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Lead agents must use a Claude connection/i);
  });
});
