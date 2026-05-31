import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

interface Row { id: string; user_id: string; name: string; color: string; created_at: string }

function toDept(row: Row) {
  return { id: row.id, name: row.name, color: row.color, createdAt: row.created_at };
}

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM departments WHERE user_id = ? ORDER BY created_at ASC').all(userId(req)) as Row[];
  res.json(rows.map(toDept));
});

const CreateSchema = z.object({
  name:  z.string().min(1),
  color: z.string().default('#6366f1'),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = { id: uuid(), user_id: userId(req), name: parsed.data.name, color: parsed.data.color, created_at: new Date().toISOString() };
  db.prepare('INSERT INTO departments (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)').run(row.id, row.user_id, row.name, row.color, row.created_at);
  res.status(201).json(toDept(row));
});

const PatchSchema = z.object({
  name:  z.string().min(1).optional(),
  color: z.string().optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.prepare('SELECT * FROM departments WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  const sets: string[] = []; const vals: unknown[] = [];
  if (parsed.data.name  !== undefined) { sets.push('name = ?');  vals.push(parsed.data.name) }
  if (parsed.data.color !== undefined) { sets.push('color = ?'); vals.push(parsed.data.color) }
  if (sets.length > 0) { vals.push(row.id); db.prepare(`UPDATE departments SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  res.json(toDept(db.prepare('SELECT * FROM departments WHERE id = ?').get(row.id) as Row));
});

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM departments WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare('UPDATE agents SET department_id = NULL WHERE department_id = ?').run(req.params.id);
  db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
