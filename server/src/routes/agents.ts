import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { Agent } from '../types';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || './data/projects';
const AGENTS_FILE = path.join(PROJECTS_ROOT, 'agents.json');

async function readAgents(): Promise<Agent[]> {
  try {
    const raw = await fs.readFile(AGENTS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAgents(agents: Agent[]): Promise<void> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2));
}

router.get('/', async (_req: Request, res: Response) => {
  const agents = await readAgents();
  res.json(agents);
});

const CreateSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(['claude', 'codex']),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const agent: Agent = {
    id: uuid(),
    name: parsed.data.name,
    provider: parsed.data.provider,
    createdAt: new Date().toISOString(),
  };

  const agents = await readAgents();
  agents.push(agent);
  await writeAgents(agents);

  res.status(201).json(agent);
});

router.delete('/:id', async (req: Request, res: Response) => {
  const agents = await readAgents();
  const idx = agents.findIndex((a) => a.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  agents.splice(idx, 1);
  await writeAgents(agents);
  res.status(204).send();
});

export default router;
