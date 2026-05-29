import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { db } from '../db';
import { initRepo, cloneRepo, importLocalRepo, pushToRemote } from '../services/git';
import simpleGit from 'simple-git';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

// ---------------------------------------------------------------------------

interface Row {
  id: string; user_id: string; name: string; repo_path: string; role: string;
  remote_url: string | null; github_token: string | null; local_path: string | null;
  created_at: string;
}

function toProject(row: Row | Record<string, unknown>) {
  return {
    id:         row.id,
    name:       row.name,
    repoPath:   row.repo_path,
    role:       row.role,
    remoteUrl:  row.remote_url  ?? undefined,
    localPath:  row.local_path  ?? undefined,
    createdAt:  row.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /projects
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(userId(req)) as Row[];
  res.json(rows.map(toProject));
});

// ---------------------------------------------------------------------------
// POST /projects
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  name:           z.string().min(1),
  githubCloneUrl: z.string().url().optional(),
  githubToken:    z.string().optional(),
  localPath:      z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { name, githubCloneUrl, githubToken, localPath } = parsed.data;
  const id       = uuid();
  const repoPath = path.join(DATA_DIR, 'repos', userId(req), id);

  const row = {
    id,
    user_id:      userId(req),
    name,
    repo_path:    repoPath,
    role:         'any',
    remote_url:   githubCloneUrl ?? null,
    github_token: githubToken    ?? null,
    local_path:   localPath      ?? null,
    created_at:   new Date().toISOString(),
  };

  const projectObj = { id, name, repoPath, role: 'any' as any, createdAt: row.created_at };

  try {
    if (githubCloneUrl && githubToken) {
      await cloneRepo(projectObj, githubCloneUrl, githubToken);
    } else if (localPath) {
      await importLocalRepo(projectObj, localPath);
    } else {
      await initRepo(projectObj);
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? 'Failed to set up repository' });
    return;
  }

  db.prepare(
    'INSERT INTO projects (id, user_id, name, repo_path, role, remote_url, github_token, local_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.user_id, row.name, row.repo_path, row.role, row.remote_url, row.github_token, row.local_path, row.created_at);

  res.status(201).json(toProject(row));
});

// ---------------------------------------------------------------------------
// POST /projects/:id/push  — push main to GitHub remote
// ---------------------------------------------------------------------------

router.post('/:id/push', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (!row.remote_url || !row.github_token) {
    res.status(400).json({ error: 'No remote configured for this project' });
    return;
  }

  try {
    const projectObj = { id: row.id, name: row.name, repoPath: row.repo_path, role: row.role as any, createdAt: row.created_at };
    await pushToRemote(projectObj, row.remote_url, row.github_token);
    res.json({ pushed: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Push failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /projects/:id/files — list files from main branch
// ---------------------------------------------------------------------------

router.get('/:id/files', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT repo_path FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as { repo_path: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    const out = await simpleGit(row.repo_path).raw(['ls-tree', '-r', '--name-only', 'main']);
    res.json({ files: out.trim().split('\n').filter(Boolean) });
  } catch {
    res.json({ files: [] });
  }
});

// ---------------------------------------------------------------------------
// GET /projects/:id/file?path= — get a single file's content
// ---------------------------------------------------------------------------

router.get('/:id/file', async (req: Request, res: Response) => {
  const filePath = req.query.path as string | undefined;
  const row = db.prepare('SELECT repo_path FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as { repo_path: string } | undefined;
  if (!row || !filePath) { res.status(400).json({ error: 'Missing path' }); return; }
  try {
    const content = await simpleGit(row.repo_path).raw(['show', `main:${filePath}`]);
    res.json({ content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /projects/:id
// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  await fs.rm(row.repo_path as string, { recursive: true, force: true }).catch(() => {});
  res.status(204).send();
});

export default router;
