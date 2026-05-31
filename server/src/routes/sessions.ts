import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { createWorktree, removeWorktree, getDiff, mergeWorktree, commitWorktree } from '../services/git';
import { killAgent, runAgent } from '../services/agents';
import { writeEvent } from '../services/events';
import { authMiddleware, userId } from '../middleware/auth';
import { SessionRow, toSession } from './_helpers';

const DATA_DIR = process.env.DATA_DIR ?? './data';

const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------

interface ProjectRow { id: string; name: string; repo_path: string; role: string; created_at: string }
interface AgentRow   { id: string; provider: string }
interface TaskRow    { id: string; prompt: string; status: string; base_branch: string }

// ---------------------------------------------------------------------------
// GET /sessions
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const { projectId, agentId } = req.query;
  let sql = 'SELECT * FROM sessions WHERE user_id = ?';
  const params: unknown[] = [userId(req)];
  if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
  if (agentId)   { sql += ' AND agent_id = ?';   params.push(agentId); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params) as SessionRow[];
  res.json(rows.map(toSession));
});

// ---------------------------------------------------------------------------
// GET /sessions/:id
// ---------------------------------------------------------------------------

router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(toSession(row));
});

// ---------------------------------------------------------------------------
// POST /sessions
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  agentId:    z.string(),
  projectId:  z.string(),
  baseBranch: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid = userId(req);
  const agent   = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(parsed.data.agentId, uid) as AgentRow | undefined;
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(parsed.data.projectId, uid) as ProjectRow | undefined;

  if (!agent)   { res.status(404).json({ error: 'Agent not found' }); return; }
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const id           = uuid();
  const branch       = `agent/${id}`;
  const worktreePath = await createWorktree(
    { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at },
    id,
    parsed.data.baseBranch
  );

  db.prepare(
    'INSERT INTO sessions (id, user_id, agent_id, project_id, provider, branch, worktree_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, uid, agent.id, project.id, agent.provider, branch, worktreePath, 'idle', new Date().toISOString());

  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow;
  res.status(201).json(toSession(row));
});

// ---------------------------------------------------------------------------
// GET /sessions/:id/diff
// ---------------------------------------------------------------------------

router.get('/:id/diff', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  const task = row.work_task_id
    ? db.prepare('SELECT base_branch FROM tasks WHERE id = ?').get(row.work_task_id) as { base_branch: string } | undefined
    : undefined;
  const diff = await getDiff(row.worktree_path, task?.base_branch ?? 'main');
  res.json({ diff });
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/stop
// ---------------------------------------------------------------------------

router.post('/:id/stop', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status !== 'running') { res.status(400).json({ error: 'Session is not running' }); return; }
  killAgent(row.id);
  res.json({ stopped: true });
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/merge
// ---------------------------------------------------------------------------

router.post('/:id/merge', async (req: Request, res: Response) => {
  const uid = userId(req);
  const row     = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid) as SessionRow | undefined;
  const project = row ? db.prepare('SELECT * FROM projects WHERE id = ?').get(row.project_id) as ProjectRow | undefined : undefined;
  if (!row || !project) { res.status(404).json({ error: 'Not found' }); return; }

  const task = row.work_task_id
    ? db.prepare('SELECT base_branch FROM tasks WHERE id = ?').get(row.work_task_id) as { base_branch: string } | undefined
    : undefined;
  const targetBranch = task?.base_branch ?? 'main';

  const projectObj = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };
  await commitWorktree(row.worktree_path).catch(() => {});
  await mergeWorktree(projectObj, row.branch, targetBranch);
  removeWorktree(projectObj, row.worktree_path).catch(() => {});
  db.prepare("UPDATE sessions SET status = 'merged' WHERE id = ?").run(row.id);
  writeEvent(uid, 'session.merged', { sessionId: row.id, taskId: row.work_task_id ?? undefined, projectId: row.project_id, agentId: row.agent_id });
  res.json({ merged: true });
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/request-review
// ---------------------------------------------------------------------------

interface AgentRow2 { id: string; provider: string }

const RequestReviewSchema = z.object({ agentId: z.string() });

router.post('/:id/request-review', async (req: Request, res: Response) => {
  const uid = userId(req);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status !== 'done') { res.status(400).json({ error: 'Session must be done to request review' }); return; }
  if (row.review_verdict && row.review_verdict !== 'pending') { res.status(400).json({ error: 'Already reviewed' }); return; }

  const parsed = RequestReviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const reviewer = db.prepare('SELECT id, provider FROM agents WHERE id = ? AND user_id = ?').get(parsed.data.agentId, uid) as AgentRow2 | undefined;
  if (!reviewer) { res.status(404).json({ error: 'Agent not found' }); return; }

  const task    = row.work_task_id ? db.prepare('SELECT base_branch, prompt FROM tasks WHERE id = ?').get(row.work_task_id) as { base_branch: string; prompt: string } | undefined : undefined;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.project_id) as ProjectRow | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const baseBranch = task?.base_branch ?? 'main';
  const diff = await getDiff(row.worktree_path, baseBranch).catch(() => '(diff unavailable)');

  const reviewPrompt = `You are conducting a code review for a colleague's work.

Original task:
${task?.prompt ?? '(no task description)'}

Git diff:
\`\`\`diff
${diff.slice(0, 40000)}
\`\`\`

Review the changes carefully. After your review, write a REVIEW.md file in the project root:
- First line must be exactly: VERDICT: APPROVED  or  VERDICT: CHANGES_REQUESTED
- Followed by your detailed review notes, specific issues, and suggestions.`;

  const reviewId     = uuid();
  const reviewBranch = `review/${reviewId}`;
  const projectObj   = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };

  const worktreePath = await createWorktree(projectObj, reviewId, baseBranch);
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, status, parent_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(reviewId, uid, reviewer.id, project.id, row.work_task_id ?? null, reviewer.provider, reviewBranch, worktreePath, 'idle', row.id, now);

  db.prepare("UPDATE sessions SET review_verdict = 'pending' WHERE id = ?").run(row.id);

  const reviewSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(reviewId) as SessionRow;
  void runAgent(toSession(reviewSession), reviewPrompt, uid, reviewer.id);

  res.status(201).json(toSession(reviewSession));
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/run
// ---------------------------------------------------------------------------

const RunSchema = z.object({ prompt: z.string().optional() });

router.post('/:id/run', (req: Request, res: Response) => {
  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid = userId(req);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status !== 'idle' && row.status !== 'error') { res.status(400).json({ error: 'Session cannot be run in its current state' }); return; }

  // Reset errored session back to idle before re-running
  if (row.status === 'error') {
    db.prepare("UPDATE sessions SET status = 'idle' WHERE id = ?").run(row.id);
    if (row.work_task_id) {
      db.prepare("UPDATE tasks SET status = 'running', completed_at = NULL WHERE id = ?").run(row.work_task_id);
    }
  }

  let prompt = parsed.data.prompt;
  if (!prompt && row.work_task_id) {
    const task = db.prepare('SELECT prompt FROM tasks WHERE id = ?').get(row.work_task_id) as TaskRow | undefined;
    prompt = task?.prompt;
  }
  if (!prompt) { res.status(400).json({ error: 'No prompt provided and no linked task' }); return; }

  void runAgent(toSession(row), prompt, uid);
  res.json({ started: true });
});

// ---------------------------------------------------------------------------
// DELETE /sessions/:id
// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response) => {
  const uid = userId(req);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status === 'merged') { res.status(400).json({ error: 'Cannot discard a merged session' }); return; }

  killAgent(row.id);

  if (row.work_task_id) {
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(row.work_task_id) as TaskRow | undefined;
    if (task?.status === 'running' || task?.status === 'failed') {
      db.prepare(
        "UPDATE tasks SET status = 'pending', agent_id = NULL, session_id = NULL, started_at = NULL, completed_at = NULL WHERE id = ?"
      ).run(row.work_task_id);
    }
  }

  // Delete log file and session record first so discard always succeeds even if worktree cleanup fails
  fs.unlink(path.join(DATA_DIR, `${row.id}.log`), () => {});
  db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.project_id) as ProjectRow | undefined;
  if (project) {
    removeWorktree(
      { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at },
      row.worktree_path
    ).catch(() => {});
  }

  res.status(204).send();
});

export default router;
