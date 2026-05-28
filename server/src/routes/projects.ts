import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { db } from '../db';
import { initRepo, cloneRepo } from '../services/git';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const DATA_DIR = process.env.DATA_DIR || './data';

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(userId(req)) as Row[];
  res.json(rows.map(toProject));
});

const CreateSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['any', 'claude', 'codex']).default('any'),
  githubCloneUrl: z.string().url().optional(),
  githubToken: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const id = uuid();
  const repoPath = path.join(DATA_DIR, 'repos', userId(req), id);
  const project = {
    id,
    user_id: userId(req),
    name: parsed.data.name,
    role: parsed.data.role,
    repo_path: repoPath,
    created_at: new Date().toISOString(),
  };

  const projectObj = { id: project.id as string, name: project.name as string, repoPath: project.repo_path as string, role: project.role as any, createdAt: project.created_at as string };
  if (parsed.data.githubCloneUrl && parsed.data.githubToken) {
    await cloneRepo(projectObj, parsed.data.githubCloneUrl, parsed.data.githubToken);
  } else {
    await initRepo(projectObj);
  }

  db.prepare(
    'INSERT INTO projects (id, user_id, name, repo_path, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(project.id, project.user_id, project.name, project.repo_path, project.role, project.created_at);

  res.status(201).json(toProject(project));
});

router.delete('/:id', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  await fs.rm(path.join(DATA_DIR, 'repos', userId(req), String(req.params.id)), { recursive: true, force: true });
  res.status(204).send();
});

// ---------------------------------------------------------------------------

interface Row { id: string; user_id: string; name: string; repo_path: string; role: string; created_at: string }

function toProject(row: Row | Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    role: row.role,
    createdAt: row.created_at,
  };
}

export default router;
