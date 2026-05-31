import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------

interface Row {
  id: string; user_id: string; name: string; type: string; api_key: string;
  model: string | null; quota_status: string; quota_reset_at: string | null; created_at: string;
}

function toConnection(row: Row | Record<string, unknown>) {
  const quotaStatus  = (row.quota_status  as string | null) ?? 'ok';
  const quotaResetAt = (row.quota_reset_at as string | null) ?? null;
  // Auto-clear expired quota
  const quotaActive = quotaStatus === 'exceeded' && quotaResetAt
    ? new Date(quotaResetAt) > new Date()
    : false;
  return {
    id:          row.id,
    name:        row.name,
    type:        row.type,
    model:       (row.model as string | null) ?? undefined,
    hasKey:      !!(row.api_key),
    quotaStatus: quotaActive ? 'exceeded' : 'ok',
    createdAt:   row.created_at,
  };
}

// Auto-clear expired quota on read
export function isConnectionAvailable(connId: string): boolean {
  const row = db.prepare('SELECT quota_status, quota_reset_at FROM connections WHERE id = ?').get(connId) as
    | { quota_status: string; quota_reset_at: string | null } | undefined;
  if (!row || row.quota_status !== 'exceeded') return true;
  if (row.quota_reset_at && new Date(row.quota_reset_at) <= new Date()) {
    db.prepare("UPDATE connections SET quota_status = 'ok', quota_reset_at = NULL WHERE id = ?").run(connId);
    return true;
  }
  return false;
}

export function markConnectionQuotaExceeded(connId: string): void {
  const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare("UPDATE connections SET quota_status = 'exceeded', quota_reset_at = ? WHERE id = ?").run(resetAt, connId);
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
    id:            uuid(),
    user_id:       userId(req),
    name:          parsed.data.name,
    type:          parsed.data.type,
    api_key:       parsed.data.apiKey || '',
    model:         parsed.data.model ?? null,
    quota_status:  'ok',
    quota_reset_at: null,
    created_at:    new Date().toISOString(),
  };

  db.prepare('INSERT INTO connections (id, user_id, name, type, api_key, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    row.id, row.user_id, row.name, row.type, row.api_key, row.model, row.created_at
  );

  res.status(201).json(toConnection(row));
});

// ---------------------------------------------------------------------------
// PATCH /connections/:id
// ---------------------------------------------------------------------------

const PatchSchema = z.object({
  name:   z.string().min(1).optional(),
  apiKey: z.string().optional(),
  model:  z.string().optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const row = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (parsed.data.name   !== undefined) { sets.push('name = ?');    vals.push(parsed.data.name) }
  if (parsed.data.model  !== undefined) { sets.push('model = ?');   vals.push(parsed.data.model || null) }
  if (parsed.data.apiKey !== undefined) { sets.push('api_key = ?'); vals.push(parsed.data.apiKey) }
  if (sets.length > 0) { vals.push(row.id); db.prepare(`UPDATE connections SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }

  const updated = db.prepare('SELECT * FROM connections WHERE id = ?').get(row.id) as Row;
  res.json(toConnection(updated));
});

// ---------------------------------------------------------------------------
// POST /connections/:id/clear-quota
// ---------------------------------------------------------------------------

router.post('/:id/clear-quota', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM connections WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare("UPDATE connections SET quota_status = 'ok', quota_reset_at = NULL WHERE id = ?").run(req.params.id);
  const updated = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id) as Row;
  res.json(toConnection(updated));
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
