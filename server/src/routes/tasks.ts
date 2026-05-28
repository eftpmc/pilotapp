import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { Task, Agent, Project, AgentSession } from '../types';
import { createWorktree } from '../services/git';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || './data/projects';
const TASKS_FILE = path.join(PROJECTS_ROOT, 'tasks.json');
const SESSIONS_FILE = path.join(PROJECTS_ROOT, 'sessions.json');

async function readTasks(): Promise<Task[]> {
  try {
    const raw = await fs.readFile(TASKS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeTasks(tasks: Task[]): Promise<void> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

async function readAgents(): Promise<Agent[]> {
  try {
    const raw = await fs.readFile(path.join(PROJECTS_ROOT, 'agents.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function readProjects(): Promise<Project[]> {
  try {
    const raw = await fs.readFile(path.join(PROJECTS_ROOT, 'projects.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

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

// GET /tasks?projectId=&status=
router.get('/', async (req: Request, res: Response) => {
  const { projectId, status } = req.query;
  let tasks = await readTasks();
  if (projectId) tasks = tasks.filter((t) => t.projectId === projectId);
  if (status) tasks = tasks.filter((t) => t.status === status);
  res.json(tasks);
});

// POST /tasks
const CreateSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  prompt: z.string().min(1),
  baseBranch: z.string().default('main'),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const projects = await readProjects();
  if (!projects.find((p) => p.id === parsed.data.projectId)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const task: Task = {
    id: uuid(),
    projectId: parsed.data.projectId,
    title: parsed.data.title,
    prompt: parsed.data.prompt,
    baseBranch: parsed.data.baseBranch,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const tasks = await readTasks();
  tasks.push(task);
  await writeTasks(tasks);
  res.status(201).json(task);
});

// PATCH /tasks/:id — update title/prompt/baseBranch on pending tasks
const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  baseBranch: z.string().optional(),
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const tasks = await readTasks();
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }
  if (tasks[idx].status !== 'pending') {
    res.status(400).json({ error: 'Only pending tasks can be edited' });
    return;
  }

  tasks[idx] = { ...tasks[idx], ...parsed.data };
  await writeTasks(tasks);
  res.json(tasks[idx]);
});

// DELETE /tasks/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const tasks = await readTasks();
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }
  tasks.splice(idx, 1);
  await writeTasks(tasks);
  res.status(204).send();
});

// POST /tasks/:id/assign — assign a specific agent to a specific task
const AssignSchema = z.object({ agentId: z.string() });

router.post('/:id/assign', async (req: Request, res: Response) => {
  const parsed = AssignSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [tasks, agents, projects] = await Promise.all([readTasks(), readAgents(), readProjects()]);

  const taskIdx = tasks.findIndex((t) => t.id === req.params.id);
  if (taskIdx === -1) { res.status(404).json({ error: 'Task not found' }); return; }

  const task = tasks[taskIdx];
  if (task.status !== 'pending') {
    res.status(400).json({ error: 'Task is not pending' });
    return;
  }

  const agent = agents.find((a) => a.id === parsed.data.agentId);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const project = projects.find((p) => p.id === task.projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  // Check role compatibility
  if (project.role !== 'any' && project.role !== agent.provider) {
    res.status(400).json({ error: `Project role '${project.role}' is not compatible with agent provider '${agent.provider}'` });
    return;
  }

  // Create session
  const sessionId = uuid();
  const branch = `agent/${sessionId}`;
  const worktreePath = await createWorktree(project, sessionId, task.baseBranch);

  const session: AgentSession = {
    id: sessionId,
    agentId: agent.id,
    projectId: project.id,
    workTaskId: task.id,
    provider: agent.provider,
    branch,
    worktreePath,
    status: 'idle',
    createdAt: new Date().toISOString(),
  };

  const sessions = await readSessions();
  sessions.push(session);
  await writeSessions(sessions);

  tasks[taskIdx] = {
    ...task,
    status: 'running',
    agentId: agent.id,
    sessionId: session.id,
    startedAt: new Date().toISOString(),
  };
  await writeTasks(tasks);

  res.status(201).json({ task: tasks[taskIdx], session });
});

// POST /tasks/queue/run — auto-assign idle agents to pending tasks
router.post('/queue/run', async (req: Request, res: Response) => {
  const [tasks, agents, projects, sessions] = await Promise.all([
    readTasks(), readAgents(), readProjects(), readSessions(),
  ]);

  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const busyAgentIds = new Set(
    sessions.filter((s) => s.status === 'running').map((s) => s.agentId)
  );
  const idleAgents = agents.filter((a) => !busyAgentIds.has(a.id));

  const dispatched: { task: Task; session: AgentSession }[] = [];

  for (const agent of idleAgents) {
    const next = pendingTasks.find((t) => {
      if (t.status !== 'pending') return false;
      const project = projects.find((p) => p.id === t.projectId);
      if (!project) return false;
      return project.role === 'any' || project.role === agent.provider;
    });

    if (!next) continue;

    const project = projects.find((p) => p.id === next.projectId)!;
    const sessionId = uuid();
    const branch = `agent/${sessionId}`;
    const worktreePath = await createWorktree(project, sessionId, next.baseBranch);

    const session: AgentSession = {
      id: sessionId,
      agentId: agent.id,
      projectId: project.id,
      workTaskId: next.id,
      provider: agent.provider,
      branch,
      worktreePath,
      status: 'idle',
      createdAt: new Date().toISOString(),
    };

    sessions.push(session);

    const taskIdx = tasks.findIndex((t) => t.id === next.id);
    tasks[taskIdx] = {
      ...next,
      status: 'running',
      agentId: agent.id,
      sessionId: session.id,
      startedAt: new Date().toISOString(),
    };

    dispatched.push({ task: tasks[taskIdx], session });
    // Mark consumed so next agent doesn't double-pick
    pendingTasks.splice(pendingTasks.indexOf(next), 1);
  }

  await Promise.all([writeTasks(tasks), writeSessions(sessions)]);
  res.json({ dispatched });
});

export default router;
