import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { createWorktree } from '../services/git';
import { runAgent } from '../services/agents';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string; user_id: string; project_id: string; title: string; prompt: string;
  base_branch: string; status: string; agent_id: string | null; session_id: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
}

interface SessionRow {
  id: string; user_id: string; agent_id: string; project_id: string;
  work_task_id: string | null; provider: string; branch: string;
  worktree_path: string; status: string; created_at: string;
}

interface ProjectRow { id: string; user_id: string; name: string; repo_path: string; role: string; created_at: string }
interface AgentRow   { id: string; user_id: string; name: string; provider: string; created_at: string }

function toTask(r: TaskRow) {
  return {
    id: r.id, projectId: r.project_id, title: r.title, prompt: r.prompt,
    baseBranch: r.base_branch, status: r.status, agentId: r.agent_id ?? undefined,
    sessionId: r.session_id ?? undefined, createdAt: r.created_at,
    startedAt: r.started_at ?? undefined, completedAt: r.completed_at ?? undefined,
  };
}

function toSession(r: SessionRow) {
  return {
    id: r.id, agentId: r.agent_id, projectId: r.project_id,
    workTaskId: r.work_task_id ?? undefined, provider: r.provider as import('../types').AgentProvider,
    branch: r.branch, worktreePath: r.worktree_path, status: r.status, createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /tasks
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const { projectId, status } = req.query;
  let sql = 'SELECT * FROM tasks WHERE user_id = ?';
  const params: unknown[] = [userId(req)];
  if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
  if (status)    { sql += ' AND status = ?';     params.push(status); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params) as TaskRow[];
  res.json(rows.map(toTask));
});

// ---------------------------------------------------------------------------
// POST /tasks
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  projectId:  z.string(),
  title:      z.string().min(1),
  prompt:     z.string().min(1),
  baseBranch: z.string().default('main'),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(parsed.data.projectId, userId(req));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const task: TaskRow = {
    id: uuid(), user_id: userId(req), project_id: parsed.data.projectId,
    title: parsed.data.title, prompt: parsed.data.prompt,
    base_branch: parsed.data.baseBranch, status: 'pending',
    agent_id: null, session_id: null,
    created_at: new Date().toISOString(), started_at: null, completed_at: null,
  };

  db.prepare(
    'INSERT INTO tasks (id, user_id, project_id, title, prompt, base_branch, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(task.id, task.user_id, task.project_id, task.title, task.prompt, task.base_branch, task.status, task.created_at);

  res.status(201).json(toTask(task));
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id
// ---------------------------------------------------------------------------

const UpdateSchema = z.object({
  title:      z.string().min(1).optional(),
  prompt:     z.string().min(1).optional(),
  baseBranch: z.string().optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as TaskRow | undefined;
  if (!row)                    { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status !== 'pending') { res.status(400).json({ error: 'Only pending tasks can be edited' }); return; }

  if (parsed.data.title)      db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(parsed.data.title, row.id);
  if (parsed.data.prompt)     db.prepare('UPDATE tasks SET prompt = ? WHERE id = ?').run(parsed.data.prompt, row.id);
  if (parsed.data.baseBranch) db.prepare('UPDATE tasks SET base_branch = ? WHERE id = ?').run(parsed.data.baseBranch, row.id);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.id) as TaskRow;
  res.json(toTask(updated));
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id
// ---------------------------------------------------------------------------

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /tasks/:id/assign
// ---------------------------------------------------------------------------

const AssignSchema = z.object({ agentId: z.string() });

router.post('/:id/assign', async (req: Request, res: Response) => {
  const parsed = AssignSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid = userId(req);
  const task    = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, uid) as TaskRow | undefined;
  const agent   = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(parsed.data.agentId, uid) as AgentRow | undefined;

  if (!task)  { res.status(404).json({ error: 'Task not found' }); return; }
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (task.status !== 'pending') { res.status(400).json({ error: 'Task is not pending' }); return; }

  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(task.project_id, uid) as ProjectRow | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  if (project.role !== 'any' && project.role !== agent.provider) {
    res.status(400).json({ error: `Project role '${project.role}' incompatible with agent provider '${agent.provider}'` });
    return;
  }

  const sessionId   = uuid();
  const branch      = `agent/${sessionId}`;
  const worktreePath = await createWorktree(
    { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at },
    sessionId,
    task.base_branch
  );

  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(sessionId, uid, agent.id, project.id, task.id, agent.provider, branch, worktreePath, 'idle', now);

  db.prepare(
    'UPDATE tasks SET status = ?, agent_id = ?, session_id = ?, started_at = ? WHERE id = ?'
  ).run('running', agent.id, sessionId, now, task.id);

  const updatedTask    = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as TaskRow;
  const updatedSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow;

  void runAgent(toSession(updatedSession), task.prompt, uid);

  res.status(201).json({ task: toTask(updatedTask), session: toSession(updatedSession) });
});

// ---------------------------------------------------------------------------
// POST /tasks/queue/run
// ---------------------------------------------------------------------------

router.post('/queue/run', async (req: Request, res: Response) => {
  const uid = userId(req);

  const pendingTasks = db.prepare(
    "SELECT * FROM tasks WHERE user_id = ? AND status = 'pending' ORDER BY created_at ASC"
  ).all(uid) as TaskRow[];

  const busyAgentIds = new Set(
    (db.prepare("SELECT agent_id FROM sessions WHERE user_id = ? AND status = 'running'").all(uid) as { agent_id: string }[])
      .map((r) => r.agent_id)
  );

  const idleAgents = (db.prepare('SELECT * FROM agents WHERE user_id = ?').all(uid) as AgentRow[])
    .filter((a) => !busyAgentIds.has(a.id));

  const dispatched: { task: ReturnType<typeof toTask>; session: ReturnType<typeof toSession> }[] = [];
  const assignedTaskIds = new Set<string>();

  for (const agent of idleAgents) {
    const next = pendingTasks.find((t) => {
      if (assignedTaskIds.has(t.id)) return false;
      const proj = db.prepare('SELECT role FROM projects WHERE id = ?').get(t.project_id) as { role: string } | undefined;
      return proj && (proj.role === 'any' || proj.role === agent.provider);
    });
    if (!next) continue;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(next.project_id) as ProjectRow;
    const sessionId    = uuid();
    const branch       = `agent/${sessionId}`;
    const worktreePath = await createWorktree(
      { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at },
      sessionId,
      next.base_branch
    );

    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(sessionId, uid, agent.id, project.id, next.id, agent.provider, branch, worktreePath, 'idle', now);

    db.prepare(
      'UPDATE tasks SET status = ?, agent_id = ?, session_id = ?, started_at = ? WHERE id = ?'
    ).run('running', agent.id, sessionId, now, next.id);

    const updatedTask    = db.prepare('SELECT * FROM tasks WHERE id = ?').get(next.id) as TaskRow;
    const updatedSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow;

    void runAgent(toSession(updatedSession), next.prompt, uid);

    dispatched.push({ task: toTask(updatedTask), session: toSession(updatedSession) });
    assignedTaskIds.add(next.id);
  }

  res.json({ dispatched });
});

export default router;
