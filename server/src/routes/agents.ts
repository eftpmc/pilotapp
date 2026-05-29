import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC').all(userId(req)) as Row[];
  res.json(rows.map(toAgent));
});

const CreateSchema = z.object({
  name:         z.string().min(1),
  connectionId: z.string().min(1),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const uid = userId(req);

  // Look up connection to get type (becomes provider)
  const connection = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(parsed.data.connectionId, uid) as
    | { id: string; type: string }
    | undefined;

  if (!connection) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  const agent = {
    id:            uuid(),
    user_id:       uid,
    name:          parsed.data.name,
    provider:      connection.type,
    connection_id: connection.id,
    created_at:    new Date().toISOString(),
  };

  db.prepare('INSERT INTO agents (id, user_id, name, provider, connection_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    agent.id, agent.user_id, agent.name, agent.provider, agent.connection_id, agent.created_at
  );

  res.status(201).json(toAgent(agent));
});

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  // Remove dependent records before deleting the agent
  db.prepare('DELETE FROM sessions WHERE agent_id = ?').run(req.params.id);
  db.prepare('UPDATE tasks SET agent_id = NULL, session_id = NULL WHERE agent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// ---------------------------------------------------------------------------

interface Row { id: string; user_id: string; name: string; provider: string; connection_id?: string | null; created_at: string }

function toAgent(row: Row | Record<string, unknown>) {
  return {
    id: row.id, name: row.name, provider: row.provider,
    connectionId: (row.connection_id as string | null | undefined) ?? undefined,
    createdAt: row.created_at,
  };
}

export default router;
