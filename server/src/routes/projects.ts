import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { Project } from '../types';
import { initRepo, cloneRepo } from '../services/git';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || './data/projects';
const PROJECTS_FILE = path.join(PROJECTS_ROOT, 'projects.json');

async function readProjects(): Promise<Project[]> {
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeProjects(projects: Project[]): Promise<void> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

router.get('/', async (_req: Request, res: Response) => {
  const projects = await readProjects();
  res.json(projects);
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
  const repoPath = path.join(PROJECTS_ROOT, id, 'repo.git');
  const project: Project = {
    id,
    name: parsed.data.name,
    role: parsed.data.role,
    repoPath,
    createdAt: new Date().toISOString(),
  };

  if (parsed.data.githubCloneUrl && parsed.data.githubToken) {
    await cloneRepo(project, parsed.data.githubCloneUrl, parsed.data.githubToken);
  } else {
    await initRepo(project);
  }

  const projects = await readProjects();
  projects.push(project);
  await writeProjects(projects);

  res.status(201).json(project);
});

router.delete('/:id', async (req: Request, res: Response) => {
  const projects = await readProjects();
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const [removed] = projects.splice(idx, 1);
  await fs.rm(path.join(PROJECTS_ROOT, removed.id), { recursive: true, force: true });
  await writeProjects(projects);
  res.status(204).send();
});

export default router;
