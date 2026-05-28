import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { AgentSession, Agent, Project, Task } from '../types';
import { createWorktree, removeWorktree, getDiff, mergeWorktree } from '../services/git';
import { killAgent, runAgent } from '../services/agents';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || './data/projects';
const SESSIONS_FILE = path.join(PROJECTS_ROOT, 'sessions.json');
const TASKS_FILE = path.join(PROJECTS_ROOT, 'tasks.json');

async function readSessions(): Promise<AgentSession[]> {
  try {
    const raw = await fs.readFile(SESSIONS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeSessions(sessions: AgentSession[]): Promise<void> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

async function readProjects(): Promise<Project[]> {
  try {
    const raw = await fs.readFile(path.join(PROJECTS_ROOT, 'projects.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function readAgents(): Promise<Agent[]> {
  try {
    const raw = await fs.readFile(path.join(PROJECTS_ROOT, 'agents.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function readTasks(): Promise<Task[]> {
  try {
    const raw = await fs.readFile(TASKS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeTasks(tasks: Task[]): Promise<void> {
  await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

router.get('/', async (req: Request, res: Response) => {
  const { projectId, agentId } = req.query;
  const sessions = await readSessions();
  let filtered = sessions;
  if (projectId) filtered = filtered.filter((s) => s.projectId === projectId);
  if (agentId) filtered = filtered.filter((s) => s.agentId === agentId);
  res.json(filtered);
});

const CreateSchema = z.object({
  agentId: z.string(),
  projectId: z.string(),
  baseBranch: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [agents, projects] = await Promise.all([readAgents(), readProjects()]);

  const agent = agents.find((a) => a.id === parsed.data.agentId);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const project = projects.find((p) => p.id === parsed.data.projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const id = uuid();
  const branch = `agent/${id}`;
  const worktreePath = await createWorktree(project, id, parsed.data.baseBranch);

  const session: AgentSession = {
    id,
    agentId: agent.id,
    projectId: project.id,
    provider: agent.provider,
    branch,
    worktreePath,
    status: 'idle',
    createdAt: new Date().toISOString(),
  };

  const sessions = await readSessions();
  sessions.push(session);
  await writeSessions(sessions);
  res.status(201).json(session);
});

router.get('/:id/diff', async (req: Request, res: Response) => {
  const sessions = await readSessions();
  const session = sessions.find((s) => s.id === req.params.id);
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }
  const diff = await getDiff(session.worktreePath);
  res.json({ diff });
});

router.post('/:id/merge', async (req: Request, res: Response) => {
  const sessions = await readSessions();
  const session = sessions.find((s) => s.id === req.params.id);
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }

  const projects = await readProjects();
  const project = projects.find((p) => p.id === session.projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  await mergeWorktree(project, session.branch);
  res.json({ merged: true });
});

// Manually start an idle session (used for sessions created before auto-start)
const RunSchema = z.object({ apiKey: z.string(), prompt: z.string().optional() });

router.post('/:id/run', async (req: Request, res: Response) => {
  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const sessions = await readSessions();
  const session = sessions.find((s) => s.id === req.params.id);
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }
  if (session.status !== 'idle') { res.status(400).json({ error: 'Session is not idle' }); return; }

  // Resolve prompt: explicit > linked task > error
  let prompt = parsed.data.prompt;
  if (!prompt && session.workTaskId) {
    const tasks = await readTasks();
    prompt = tasks.find((t) => t.id === session.workTaskId)?.prompt;
  }
  if (!prompt) { res.status(400).json({ error: 'No prompt provided and no linked task' }); return; }

  runAgent(session, prompt, parsed.data.apiKey);
  res.json({ started: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const sessions = await readSessions();
  const idx = sessions.findIndex((s) => s.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }

  const [session] = sessions.splice(idx, 1);
  killAgent(session.id);

  // Reset linked task back to pending so it can be re-assigned
  if (session.workTaskId) {
    const tasks = await readTasks();
    const taskIdx = tasks.findIndex((t) => t.id === session.workTaskId);
    if (taskIdx !== -1 && (tasks[taskIdx].status === 'running')) {
      tasks[taskIdx] = {
        ...tasks[taskIdx],
        status: 'pending',
        agentId: undefined,
        sessionId: undefined,
        startedAt: undefined,
      };
      await writeTasks(tasks);
    }
  }

  const projects = await readProjects();
  const project = projects.find((p) => p.id === session.projectId);
  if (project) await removeWorktree(project, session.worktreePath).catch(() => {});

  await writeSessions(sessions);
  res.status(204).send();
});

export default router;
