import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { db } from '../db';
import { createWorktree, createWorkDir, copyTaskFilesToWorkDir, seedWorkDirFromWorkspace } from '../services/git';
import { runAgent } from '../services/agents';
import { assignTaskToSession } from '../services/lifecycle';
import { authMiddleware, userId } from '../middleware/auth';
import { SessionRow, toSession } from './_helpers';

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');

function projectWorkspaceDir(projectId: string): string {
  return path.join(DATA_DIR, 'workspaces', projectId);
}

function taskFilesDir(taskId: string): string {
  return path.join(DATA_DIR, 'task-files', taskId);
}


const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = taskFilesDir((req as any).params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, file.originalname),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
});

const router = Router();
router.use(authMiddleware);

// Serialise queue dispatch — prevents double-assigning the same task if two
// requests arrive before either DB write lands.
let dispatchLock = false;

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string; user_id: string; project_id: string; title: string; prompt: string;
  base_branch: string; status: string; priority: number; size: string;
  attached_files: string;
  agent_id: string | null; session_id: string | null; lead_session_id: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
}

interface ProjectRow { id: string; user_id: string; name: string; repo_path: string; role: string; workspace_mode: string; created_at: string }
interface AgentRow   { id: string; user_id: string; name: string; provider: string; role: string; created_at: string }

function parseAttachedFiles(raw: string | null): string[] {
  try { return JSON.parse(raw ?? '[]') ?? []; } catch { return []; }
}

function toTask(r: TaskRow) {
  return {
    id: r.id, projectId: r.project_id, title: r.title, prompt: r.prompt,
    status: r.status, priority: r.priority ?? 0,
    size: (r.size ?? 'm') as 'xs' | 's' | 'm' | 'l' | 'xl',
    attachedFiles: parseAttachedFiles(r.attached_files),
    agentId:       r.agent_id        ?? undefined,
    sessionId:     r.session_id      ?? undefined,
    leadSessionId: r.lead_session_id ?? undefined,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined, completedAt: r.completed_at ?? undefined,
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
  sql += ' ORDER BY priority DESC, created_at ASC';
  const rows = db.prepare(sql).all(...params) as TaskRow[];
  res.json(rows.map(toTask));
});

// ---------------------------------------------------------------------------
// POST /tasks
// ---------------------------------------------------------------------------

const SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;

const CreateSchema = z.object({
  projectId: z.string(),
  title:     z.string().min(1),
  prompt:    z.string().min(1),
  size:      z.enum(SIZES).default('m'),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(parsed.data.projectId, userId(req));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const task: TaskRow = {
    id: uuid(), user_id: userId(req), project_id: parsed.data.projectId,
    title: parsed.data.title, prompt: parsed.data.prompt,
    base_branch: 'main', status: 'pending', priority: 0,
    size: parsed.data.size, attached_files: '[]',
    agent_id: null, session_id: null, lead_session_id: null,
    created_at: new Date().toISOString(), started_at: null, completed_at: null,
  };

  db.prepare(
    'INSERT INTO tasks (id, user_id, project_id, title, prompt, base_branch, status, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(task.id, task.user_id, task.project_id, task.title, task.prompt, task.base_branch, task.status, task.size, task.created_at);

  res.status(201).json(toTask(task));
});

// ---------------------------------------------------------------------------
// POST /tasks/queue/run  — must be before /:id to avoid matching "queue"
// ---------------------------------------------------------------------------

router.post('/queue/run', async (req: Request, res: Response) => {
  if (dispatchLock) { res.json({ dispatched: [] }); return; }
  dispatchLock = true;
  const uid = userId(req);

  const dispatched: { task: ReturnType<typeof toTask>; session: ReturnType<typeof toSession> }[] = [];

  try {
    const pendingTasks = db.prepare(
      "SELECT * FROM tasks WHERE user_id = ? AND status = 'pending' ORDER BY priority DESC, created_at ASC"
    ).all(uid) as TaskRow[];

    const busyAgentIds = new Set(
      (db.prepare("SELECT agent_id FROM sessions WHERE user_id = ? AND status IN ('idle', 'running')").all(uid) as { agent_id: string }[])
        .map((r) => r.agent_id)
    );

    const idleAgents = (db.prepare(`
      SELECT a.*, COALESCE(c.type, a.provider) as provider
      FROM agents a
      LEFT JOIN connections c ON c.id = a.connection_id
      WHERE a.user_id = ?
    `).all(uid) as AgentRow[])
      .filter((a) => !busyAgentIds.has(a.id));

    const assignedTaskIds = new Set<string>();

    for (const agent of idleAgents) {
      const next = pendingTasks.find(t => !assignedTaskIds.has(t.id));
      if (!next) continue;

      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(next.project_id) as ProjectRow;
      const sessionId     = uuid();
      const isGit         = (project.workspace_mode ?? 'git') === 'git';
      const branch        = isGit ? `agent/${sessionId}` : '';
      const workspaceMode = isGit ? 'git' : 'workspace';
      const worktreePath  = isGit
        ? await createWorktree({ id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at }, sessionId, next.base_branch)
        : await createWorkDir(sessionId);

      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, workspace_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(sessionId, uid, agent.id, project.id, next.id, agent.provider, branch, worktreePath, workspaceMode, 'idle', now);

      assignTaskToSession(next.id, agent.id, sessionId, now);
      if (!isGit) await seedWorkDirFromWorkspace(projectWorkspaceDir(project.id), worktreePath).catch(() => {});
      await copyTaskFilesToWorkDir(taskFilesDir(next.id), worktreePath);

      const updatedTask    = db.prepare('SELECT * FROM tasks WHERE id = ?').get(next.id) as TaskRow;
      const updatedSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow;

      void runAgent(toSession(updatedSession), next.prompt, uid, agent.id);

      dispatched.push({ task: toTask(updatedTask), session: toSession(updatedSession) });
      assignedTaskIds.add(next.id);
    }
  } finally {
    dispatchLock = false;
  }

  res.json({ dispatched });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id
// ---------------------------------------------------------------------------

const UpdateSchema = z.object({
  title:    z.string().min(1).optional(),
  prompt:   z.string().min(1).optional(),
  priority: z.number().int().min(0).optional(),
  size:     z.enum(SIZES).optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as TaskRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status !== 'pending') { res.status(400).json({ error: 'Only pending tasks can be edited' }); return; }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (parsed.data.title    !== undefined) { sets.push('title = ?');    vals.push(parsed.data.title) }
  if (parsed.data.prompt   !== undefined) { sets.push('prompt = ?');   vals.push(parsed.data.prompt) }
  if (parsed.data.priority !== undefined) { sets.push('priority = ?'); vals.push(parsed.data.priority) }
  if (parsed.data.size     !== undefined) { sets.push('size = ?');     vals.push(parsed.data.size) }
  if (sets.length > 0) { vals.push(row.id); db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.id) as TaskRow;
  res.json(toTask(updated));
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id
// ---------------------------------------------------------------------------

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id, status FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Pick<TaskRow, 'id' | 'status'> | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status === 'running') { res.status(400).json({ error: 'Cannot delete a running task — stop the session first' }); return; }
  db.prepare('UPDATE sessions SET work_task_id = NULL WHERE work_task_id = ?').run(req.params.id);
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

  const uid     = userId(req);
  const task    = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, uid) as TaskRow | undefined;
  const agent   = db.prepare(`
    SELECT a.*, COALESCE(c.type, a.provider) as provider
    FROM agents a
    LEFT JOIN connections c ON c.id = a.connection_id
    WHERE a.id = ? AND a.user_id = ?
  `).get(parsed.data.agentId, uid) as AgentRow | undefined;

  if (!task)  { res.status(404).json({ error: 'Task not found' }); return; }
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (task.status !== 'pending') { res.status(400).json({ error: 'Task is not pending' }); return; }

  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(task.project_id, uid) as ProjectRow | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const sessionId     = uuid();
  const isGit2        = (project.workspace_mode ?? 'git') === 'git';
  const branch        = isGit2 ? `agent/${sessionId}` : '';
  const workspaceMode = isGit2 ? 'git' : 'workspace';
  const worktreePath  = isGit2
    ? await createWorktree({ id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at }, sessionId, task.base_branch)
    : await createWorkDir(sessionId);

  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, workspace_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(sessionId, uid, agent.id, project.id, task.id, agent.provider, branch, worktreePath, workspaceMode, 'idle', now);

  assignTaskToSession(task.id, agent.id, sessionId, now);

  const updatedTask    = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as TaskRow;
  const updatedSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow;

  if (!isGit2) await seedWorkDirFromWorkspace(projectWorkspaceDir(project.id), worktreePath).catch(() => {});
  await copyTaskFilesToWorkDir(taskFilesDir(task.id), worktreePath);
  void runAgent(toSession(updatedSession), task.prompt, uid, agent.id);

  res.status(201).json({ task: toTask(updatedTask), session: toSession(updatedSession) });
});

// ---------------------------------------------------------------------------
// GET /tasks/:id/files
// ---------------------------------------------------------------------------

router.get('/:id/files', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id, attached_files FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Pick<TaskRow, 'id' | 'attached_files'> | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  const files = parseAttachedFiles(row.attached_files);
  res.json({ files });
});

// ---------------------------------------------------------------------------
// POST /tasks/:id/files
// ---------------------------------------------------------------------------

router.post('/:id/files', (req: Request, res: Response, next) => {
  const row = db.prepare('SELECT id, status, attached_files FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Pick<TaskRow, 'id' | 'status' | 'attached_files'> | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  upload.array('files')(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    const uploaded = ((req as any).files as Express.Multer.File[] ?? []).map(f => f.originalname);
    if (uploaded.length === 0) { res.status(400).json({ error: 'No files uploaded' }); return; }

    const existing = parseAttachedFiles(row.attached_files);
    const merged   = Array.from(new Set([...existing, ...uploaded]));
    db.prepare('UPDATE tasks SET attached_files = ? WHERE id = ?').run(JSON.stringify(merged), row.id);
    res.json({ files: merged });
  });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id/files/:filename
// ---------------------------------------------------------------------------

router.delete('/:id/files/:filename', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id, attached_files FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Pick<TaskRow, 'id' | 'attached_files'> | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const filename = req.params.filename;
  const files    = parseAttachedFiles(row.attached_files).filter(f => f !== filename);
  db.prepare('UPDATE tasks SET attached_files = ? WHERE id = ?').run(JSON.stringify(files), row.id);

  const filePath = path.join(taskFilesDir(row.id), String(filename));
  fs.unlink(filePath, () => {}); // best-effort delete
  res.json({ files });
});

export { taskFilesDir };
export default router;
