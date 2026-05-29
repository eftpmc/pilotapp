import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------

interface Row { id: string; user_id: string; name: string; type: string; api_key: string; model: string | null; created_at: string }

function toConnection(row: Row | Record<string, unknown>) {
  return {
    id: row.id, name: row.name, type: row.type,
    model: row.model ?? undefined,
    hasKey: !!(row.api_key),   // never expose the key itself
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /connections
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM connections WHERE user_id = ? ORDER BY created_at DESC').all(userId(req)) as Row[];
  res.json(rows.map(toConnection));
});

// ---------------------------------------------------------------------------
// POST /connections
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  name:   z.string().min(1),
  type:   z.enum(['claude', 'codex']),
  apiKey: z.string().optional(),   // empty = use machine auth (OAuth subscription)
  model:  z.string().optional(),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const row: Row = {
    id:         uuid(),
    user_id:    userId(req),
    name:       parsed.data.name,
    type:       parsed.data.type,
    api_key:    parsed.data.apiKey || '',
    model:      parsed.data.model ?? null,
    created_at: new Date().toISOString(),
  };

  db.prepare('INSERT INTO connections (id, user_id, name, type, api_key, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    row.id, row.user_id, row.name, row.type, row.api_key, row.model, row.created_at
  );

  res.status(201).json(toConnection(row));
});

// ---------------------------------------------------------------------------
// DELETE /connections/:id
// ---------------------------------------------------------------------------

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM connections WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  // Null out FK on agents before deleting
  db.prepare('UPDATE agents SET connection_id = NULL WHERE connection_id = ?').run(req.params.id);
  db.prepare('DELETE FROM connections WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
