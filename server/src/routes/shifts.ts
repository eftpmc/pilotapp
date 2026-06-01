import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { createWorktree } from '../services/git';
import { runAgent } from '../services/agents';
import { assignTaskToSession } from '../services/lifecycle';
import { authMiddleware, userId } from '../middleware/auth';
import { SessionRow, toSession } from './_helpers';

const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShiftRow  { id: string; user_id: string; agent_id: string; status: string; created_at: string; completed_at: string | null; report: string | null }
interface AgentRow  { id: string; provider: string }
interface TaskRow   { id: string; project_id: string; prompt: string; base_branch: string; status: string }
interface ProjectRow { id: string; name: string; repo_path: string; role: string; created_at: string }

function toShift(row: ShiftRow, taskCount: number, doneCount: number) {
  return {
    id:          row.id,
    agentId:     row.agent_id,
    status:      row.status,
    taskCount,
    doneCount,
    report:      row.report ?? undefined,
    createdAt:   row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// GET /shifts
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const uid   = userId(req);
  const rows  = db.prepare('SELECT * FROM shifts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(uid) as ShiftRow[];
  const result = rows.map(s => {
    const taskCount = (db.prepare('SELECT COUNT(*) as n FROM tasks WHERE shift_id = ?').get(s.id) as { n: number }).n;
    const doneCount = (db.prepare("SELECT COUNT(*) as n FROM tasks WHERE shift_id = ? AND status IN ('done','failed')").get(s.id) as { n: number }).n;
    return toShift(s, taskCount, doneCount);
  });
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /shifts — create + start
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  agentId: z.string(),
  taskIds: z.array(z.string()).min(1),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid   = userId(req);
  const agent = db.prepare('SELECT id, provider FROM agents WHERE id = ? AND user_id = ?').get(parsed.data.agentId, uid) as AgentRow | undefined;
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  // Validate all tasks belong to this user and are pending
  const taskRows: TaskRow[] = [];
  for (const tid of parsed.data.taskIds) {
    const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(tid, uid) as TaskRow | undefined;
    if (!t)                 { res.status(404).json({ error: `Task ${tid} not found` }); return; }
    if (t.status !== 'pending') { res.status(400).json({ error: `Task ${tid} is not pending` }); return; }
    taskRows.push(t);
  }

  // Create shift
  const shiftId = uuid();
  const now     = new Date().toISOString();
  db.prepare('INSERT INTO shifts (id, user_id, agent_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(shiftId, uid, agent.id, 'running', now);

  // Tag all tasks with shift_id (preserve order by created_at)
  for (const t of taskRows) {
    db.prepare('UPDATE tasks SET shift_id = ? WHERE id = ?').run(shiftId, t.id);
  }

  // Start first task
  const first   = taskRows[0];
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(first.project_id) as ProjectRow | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found for first task' }); return; }

  const sessionId    = uuid();
  const branch       = `agent/${sessionId}`;
  const projectObj   = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };
  const worktreePath = await createWorktree(projectObj, sessionId, first.base_branch);

  db.prepare(
    'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, status, shift_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(sessionId, uid, agent.id, project.id, first.id, agent.provider, branch, worktreePath, 'idle', shiftId, now);

  assignTaskToSession(first.id, agent.id, sessionId, now);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow;
  void runAgent(toSession(session), first.prompt, uid, agent.id);

  const shiftRow = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as ShiftRow;
  res.status(201).json({
    shift:   toShift(shiftRow, taskRows.length, 0),
    session: toSession(session),
  });
});

// ---------------------------------------------------------------------------
// DELETE /shifts/:id — cancel
// ---------------------------------------------------------------------------

router.get('/:id', (req: Request, res: Response) => {
  const uid = userId(req);
  const row = db.prepare('SELECT * FROM shifts WHERE id = ? AND user_id = ?').get(req.params.id, uid) as ShiftRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  const taskCount = (db.prepare('SELECT COUNT(*) as n FROM tasks WHERE shift_id = ?').get(row.id) as { n: number }).n;
  const doneCount = (db.prepare("SELECT COUNT(*) as n FROM tasks WHERE shift_id = ? AND status IN ('done','failed')").get(row.id) as { n: number }).n;
  res.json(toShift(row, taskCount, doneCount));
});

router.delete('/:id', (req: Request, res: Response) => {
  const uid = userId(req);
  const row = db.prepare('SELECT id FROM shifts WHERE id = ? AND user_id = ?').get(req.params.id, uid);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare("UPDATE shifts SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  db.prepare("UPDATE tasks SET shift_id = NULL WHERE shift_id = ? AND status = 'pending'").run(req.params.id);
  res.status(204).send();
});

export default router;
