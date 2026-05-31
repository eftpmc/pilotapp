import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

interface Row {
  id: string; user_id: string; scope: string; scope_id: string | null;
  title: string; content: string; created_at: string; updated_at: string;
}

function toDoc(row: Row) {
  return {
    id:        row.id,
    scope:     row.scope as 'company' | 'employee',
    scopeId:   row.scope_id ?? undefined,
    title:     row.title,
    content:   row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', (req: Request, res: Response) => {
  const { scope, scopeId } = req.query;
  let rows: Row[];
  if (scope === 'employee' && scopeId) {
    rows = db.prepare(
      'SELECT * FROM knowledge WHERE user_id = ? AND scope = ? AND scope_id = ? ORDER BY created_at ASC'
    ).all(userId(req), scope, scopeId) as Row[];
  } else if (scope === 'company') {
    rows = db.prepare(
      "SELECT * FROM knowledge WHERE user_id = ? AND scope = 'company' ORDER BY created_at ASC"
    ).all(userId(req)) as Row[];
  } else {
    rows = db.prepare(
      'SELECT * FROM knowledge WHERE user_id = ? ORDER BY created_at ASC'
    ).all(userId(req)) as Row[];
  }
  res.json(rows.map(toDoc));
});

const CreateSchema = z.object({
  scope:   z.enum(['company', 'employee']),
  scopeId: z.string().optional(),
  title:   z.string().min(1),
  content: z.string().default(''),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const now = new Date().toISOString();
  const doc = {
    id: uuid(), user_id: userId(req),
    scope: parsed.data.scope, scope_id: parsed.data.scopeId ?? null,
    title: parsed.data.title, content: parsed.data.content,
    created_at: now, updated_at: now,
  };
  db.prepare(
    'INSERT INTO knowledge (id, user_id, scope, scope_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(doc.id, doc.user_id, doc.scope, doc.scope_id, doc.title, doc.content, doc.created_at, doc.updated_at);
  res.status(201).json(toDoc(doc));
});

const PatchSchema = z.object({
  title:   z.string().min(1).optional(),
  content: z.string().optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.prepare('SELECT * FROM knowledge WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  const sets: string[] = []; const vals: unknown[] = [];
  if (parsed.data.title   !== undefined) { sets.push('title = ?');   vals.push(parsed.data.title) }
  if (parsed.data.content !== undefined) { sets.push('content = ?'); vals.push(parsed.data.content) }
  sets.push('updated_at = ?'); vals.push(new Date().toISOString());
  vals.push(row.id);
  db.prepare(`UPDATE knowledge SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(toDoc(db.prepare('SELECT * FROM knowledge WHERE id = ?').get(row.id) as Row));
});

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM knowledge WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare('DELETE FROM knowledge WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
