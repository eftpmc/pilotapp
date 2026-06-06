import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const AGENT_ROLES = ['worker', 'lead'] as const;
export type AgentRole = typeof AGENT_ROLES[number];

// ---------------------------------------------------------------------------

interface Row {
  id: string; user_id: string; name: string; provider: string;
  connection_id?: string | null; personality?: string | null;
  role: AgentRole; department_id?: string | null; avatar_seed?: string | null; created_at: string;
}

function toAgent(row: Row | Record<string, unknown>) {
  return {
    id:           row.id,
    name:         row.name,
    provider:     row.provider,
    role:         (row.role as AgentRole | null) ?? 'worker',
    connectionId:   (row.connection_id   as string | null | undefined) ?? undefined,
    personality:    (row.personality     as string | null | undefined) ?? undefined,
    departmentId:   (row.department_id   as string | null | undefined) ?? undefined,
    avatarSeed:     (row.avatar_seed     as string | null | undefined) ?? undefined,
    createdAt:    row.created_at,
  };
}

// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT a.*, COALESCE(c.type, a.provider) as provider
    FROM agents a
    LEFT JOIN connections c ON c.id = a.connection_id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
  `).all(userId(req)) as Row[];
  res.json(rows.map(toAgent));
});

// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  name:         z.string().min(1),
  connectionId: z.string().min(1),
  personality:  z.string().optional(),
  role:         z.enum(AGENT_ROLES).default('worker'),
  departmentId: z.string().optional(),
  avatarSeed:   z.string().optional(),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid = userId(req);
  const connection = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(parsed.data.connectionId, uid) as
    | { id: string; type: string } | undefined;
  if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  // One lead per department
  if (parsed.data.role === 'lead' && parsed.data.departmentId) {
    const existing = db.prepare(
      "SELECT id FROM agents WHERE user_id = ? AND department_id = ? AND role = 'lead' LIMIT 1"
    ).get(uid, parsed.data.departmentId);
    if (existing) {
      res.status(400).json({ error: 'This team already has a lead agent' });
      return;
    }
  }

  const agent = {
    id: uuid(), user_id: uid, name: parsed.data.name,
    provider: connection.type, connection_id: connection.id,
    personality: parsed.data.personality ?? null,
    role: parsed.data.role,
    department_id: parsed.data.departmentId ?? null,
    avatar_seed: parsed.data.avatarSeed ?? null,
    created_at: new Date().toISOString(),
  };

  db.prepare('INSERT INTO agents (id, user_id, name, provider, connection_id, personality, role, department_id, avatar_seed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    agent.id, agent.user_id, agent.name, agent.provider,
    agent.connection_id, agent.personality, agent.role, agent.department_id, agent.avatar_seed, agent.created_at
  );

  res.status(201).json(toAgent(agent));
});

// ---------------------------------------------------------------------------

const PatchSchema = z.object({
  name:         z.string().min(1).optional(),
  connectionId: z.string().min(1).optional(),
  personality:  z.string().optional(),
  role:         z.enum(AGENT_ROLES).optional(),
  departmentId: z.string().nullable().optional(),
  avatarSeed:   z.string().nullable().optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const row = db.prepare(`
    SELECT a.*, COALESCE(c.type, a.provider) as provider
    FROM agents a
    LEFT JOIN connections c ON c.id = a.connection_id
    WHERE a.id = ? AND a.user_id = ?
  `).get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const connection = parsed.data.connectionId
    ? db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(parsed.data.connectionId, userId(req)) as
      | { id: string; type: string } | undefined
    : undefined;
  if (parsed.data.connectionId && !connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  // One lead per department (check when promoting to lead or moving to a new department)
  const effectiveRole  = parsed.data.role ?? row.role;
  const effectiveDept  = parsed.data.departmentId !== undefined ? parsed.data.departmentId : row.department_id;
  if (effectiveRole === 'lead' && effectiveDept) {
    const existing = db.prepare(
      "SELECT id FROM agents WHERE user_id = ? AND department_id = ? AND role = 'lead' AND id != ? LIMIT 1"
    ).get(userId(req), effectiveDept, row.id);
    if (existing) {
      res.status(400).json({ error: 'This team already has a lead agent' });
      return;
    }
  }

  const sets: string[] = []; const vals: unknown[] = [];
  if (parsed.data.name         !== undefined) { sets.push('name = ?');          vals.push(parsed.data.name) }
  if (connection)                           { sets.push('connection_id = ?'); vals.push(connection.id); sets.push('provider = ?'); vals.push(connection.type) }
  if (parsed.data.personality  !== undefined) { sets.push('personality = ?');   vals.push(parsed.data.personality || null) }
  if (parsed.data.role         !== undefined) { sets.push('role = ?');          vals.push(parsed.data.role) }
  if (parsed.data.departmentId !== undefined) { sets.push('department_id = ?'); vals.push(parsed.data.departmentId) }
  if (parsed.data.avatarSeed   !== undefined) { sets.push('avatar_seed = ?');   vals.push(parsed.data.avatarSeed) }
  if (sets.length > 0) { vals.push(row.id); db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }

  const updated = db.prepare(`
    SELECT a.*, COALESCE(c.type, a.provider) as provider
    FROM agents a
    LEFT JOIN connections c ON c.id = a.connection_id
    WHERE a.id = ?
  `).get(row.id) as Row;
  res.json(toAgent(updated));
});

// ---------------------------------------------------------------------------

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare('DELETE FROM sessions WHERE agent_id = ?').run(req.params.id);
  db.prepare('UPDATE tasks SET agent_id = NULL WHERE agent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
