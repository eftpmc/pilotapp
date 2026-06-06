import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { createWorktree, removeWorktree, getDiff, mergeWorktree, commitWorktree, createWorkDir, removeWorkDir, getWorkDirDiff, copyTaskFilesToWorkDir, mergeIntoProjectWorkspace } from '../services/git';
import { taskFilesDir } from './tasks';
import { killAgent, runAgent, continueAgent } from '../services/agents';
import { writeEvent } from '../services/events';
import { markSessionMerged, markTaskDone, resetErroredSessionForRetry } from '../services/lifecycle';
import { broadcastGlobal } from '../services/broadcast';
import { authMiddleware, userId } from '../middleware/auth';
import { SessionRow, toSession } from './_helpers';

const DATA_DIR = process.env.DATA_DIR ?? './data';

function projectWorkspaceDir(projectId: string): string {
  return path.join(DATA_DIR, 'workspaces', projectId);
}


const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------

interface ProjectRow { id: string; name: string; repo_path: string; role: string; workspace_mode: string; created_at: string }
interface AgentRow   { id: string; provider: string }
interface TaskRow    { id: string; prompt: string; status: string; base_branch: string }

// ---------------------------------------------------------------------------
// GET /sessions
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const { projectId, agentId, limit: limitParam } = req.query;
  const limit = Math.min(Number(limitParam) || 200, 500);
  let sql = 'SELECT * FROM sessions WHERE user_id = ?';
  const params: unknown[] = [userId(req)];
  if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
  if (agentId)   { sql += ' AND agent_id = ?';   params.push(agentId); }
  sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
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
// GET /sessions/:id/diff
// ---------------------------------------------------------------------------

router.get('/:id/diff', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const isWorkspace = (row.workspace_mode ?? 'git') === 'workspace';

  if (isWorkspace) {
    // Prefer live file scan; fall back to captured snapshot (e.g. result text fallback)
    const diff = await getWorkDirDiff(row.worktree_path).catch(() => '');
    if (diff.trim()) { res.json({ diff }); return; }
    if (row.diff_snapshot) { res.json({ diff: row.diff_snapshot, isResultText: true }); return; }
    res.json({ diff: '' });
    return;
  }

  if (row.diff_snapshot) { res.json({ diff: row.diff_snapshot }); return; }
  if (row.status === 'merged') {
    res.json({ diff: '', unavailableReason: 'Diff artifact unavailable for this merged session.' });
    return;
  }
  const diff = await getDiff(row.worktree_path, 'main').catch(() => '');
  res.json({ diff });
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/stop
// ---------------------------------------------------------------------------

router.post('/:id/stop', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status !== 'running' && row.status !== 'waiting') { res.status(400).json({ error: 'Session is not running' }); return; }
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
  if (row.status !== 'done' && row.status !== 'error') { res.status(400).json({ error: 'Only completed sessions can be merged' }); return; }
  if (row.parent_session_id) { res.status(400).json({ error: 'Review sessions cannot be merged' }); return; }

  const isWorkspace = (row.workspace_mode ?? 'git') === 'workspace';

  if (isWorkspace) {
    const diff = await getWorkDirDiff(row.worktree_path).catch(() => '');
    db.prepare('UPDATE sessions SET diff_snapshot = ? WHERE id = ?').run(diff, row.id);
    // Merge session output into persistent project workspace so future sessions inherit it
    mergeIntoProjectWorkspace(row.worktree_path, projectWorkspaceDir(row.project_id)).catch(() => {});
    markSessionMerged(row.id);
    if (row.work_task_id) markTaskDone(row.work_task_id);
    writeEvent(uid, 'session.merged', { sessionId: row.id, taskId: row.work_task_id ?? undefined, projectId: row.project_id, agentId: row.agent_id });
    res.json({ merged: true });
    return;
  }

  const diffSnapshot = await getDiff(row.worktree_path, 'main').catch(() => '');
  const projectObj = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };
  try {
    await commitWorktree(row.worktree_path).catch(() => {});
    const finalDiff = diffSnapshot || await getDiff(row.worktree_path, 'main').catch(() => '');
    db.prepare('UPDATE sessions SET diff_snapshot = ? WHERE id = ?').run(finalDiff, row.id);
    await mergeWorktree(projectObj, row.branch, 'main');
  } catch (err: any) {
    const message = String(err?.message ?? err ?? 'Merge failed');
    const conflict = /conflict|merge failed|automatic merge failed/i.test(message);
    res.status(conflict ? 409 : 500).json({ error: message });
    return;
  }
  removeWorktree(projectObj, row.worktree_path).catch(() => {});
  markSessionMerged(row.id);
  if (row.work_task_id) markTaskDone(row.work_task_id);
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

  const reviewer = db.prepare(`
    SELECT a.id, COALESCE(c.type, a.provider) as provider
    FROM agents a
    LEFT JOIN connections c ON c.id = a.connection_id
    WHERE a.id = ? AND a.user_id = ?
  `).get(parsed.data.agentId, uid) as AgentRow2 | undefined;
  if (!reviewer) { res.status(404).json({ error: 'Agent not found' }); return; }

  const task      = row.work_task_id ? db.prepare('SELECT prompt FROM tasks WHERE id = ?').get(row.work_task_id) as { prompt: string } | undefined : undefined;
  const project   = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.project_id) as ProjectRow | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const isWorkspace = (row.workspace_mode ?? 'git') === 'workspace';
  const outputLabel = isWorkspace ? 'Output files' : 'Git diff';
  const outputBlock = isWorkspace
    ? (await getWorkDirDiff(row.worktree_path).catch(() => '(files unavailable)'))
    : (await getDiff(row.worktree_path, 'main').catch(() => '(diff unavailable)'));

  const reviewPrompt = `You are conducting a review of a colleague's work. You have access to a \`pilot\` MCP server.

Original task:
${task?.prompt ?? '(no task description)'}

${outputLabel}:
\`\`\`diff
${outputBlock.slice(0, 40000)}
\`\`\`

Review the changes carefully, then call the \`submit_review\` MCP tool with:
- \`verdict\`: "approved" or "changes_requested"
- \`comments\`: array of specific findings, issues, or suggestions

Do NOT write a REVIEW.md file — use the tool directly. If anything is unclear, call \`request_clarification\` before submitting your verdict.`;

  const reviewId     = uuid();
  const reviewBranch = isWorkspace ? '' : `review/${reviewId}`;
  const projectObj   = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };

  const worktreePath = isWorkspace
    ? await createWorkDir(reviewId)
    : await createWorktree(projectObj, reviewId, 'main', reviewBranch);
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, workspace_mode, status, parent_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(reviewId, uid, reviewer.id, project.id, row.work_task_id ?? null, reviewer.provider, reviewBranch, worktreePath, row.workspace_mode ?? 'git', 'idle', row.id, now);

  db.prepare("UPDATE sessions SET review_verdict = 'pending' WHERE id = ?").run(row.id);

  const reviewSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(reviewId) as SessionRow;
  void runAgent(toSession(reviewSession), reviewPrompt, uid, reviewer.id);

  res.status(201).json(toSession(reviewSession));
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/run
// ---------------------------------------------------------------------------

const RunSchema = z.object({ prompt: z.string().optional() });

router.post('/:id/run', async (req: Request, res: Response) => {
  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid = userId(req);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status !== 'idle' && row.status !== 'error') { res.status(400).json({ error: 'Session cannot be run in its current state' }); return; }

  // Reset errored session back to idle before re-running
  if (row.status === 'error') {
    resetErroredSessionForRetry(row.id);
  }

  let prompt = parsed.data.prompt;
  if (!prompt && row.work_task_id) {
    const task = db.prepare('SELECT prompt FROM tasks WHERE id = ?').get(row.work_task_id) as TaskRow | undefined;
    prompt = task?.prompt;
  }
  if (!prompt) { res.status(400).json({ error: 'No prompt provided and no linked task' }); return; }

  if (row.work_task_id) await copyTaskFilesToWorkDir(taskFilesDir(row.work_task_id), row.worktree_path);
  void runAgent(toSession(row), prompt, uid);
  res.json({ started: true });
});

// ---------------------------------------------------------------------------
// GET /sessions/:id/turns
// ---------------------------------------------------------------------------

router.get('/:id/turns', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  interface TurnRow { id: string; session_id: string; turn_number: number; prompt: string; status: string; created_at: string; completed_at: string | null }
  const turns = db.prepare('SELECT * FROM turns WHERE session_id = ? ORDER BY turn_number ASC').all(row.id) as TurnRow[];
  res.json(turns.map(t => ({
    id: t.id, sessionId: t.session_id, turnNumber: t.turn_number,
    prompt: t.prompt, status: t.status, createdAt: t.created_at,
    completedAt: t.completed_at ?? undefined,
  })));
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/turns
// ---------------------------------------------------------------------------

const AddTurnSchema = z.object({ prompt: z.string().min(1) });

router.post('/:id/turns', (req: Request, res: Response) => {
  const parsed = AddTurnSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid = userId(req);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status !== 'done' && row.status !== 'error') {
    res.status(400).json({ error: 'Session must be done or error to add a turn' }); return;
  }
  if (!row.runner_session_id) {
    res.status(400).json({ error: 'Session has no runner session ID — cannot continue' }); return;
  }

  interface CountRow { count: number }
  const { count } = db.prepare('SELECT COUNT(*) as count FROM turns WHERE session_id = ?').get(row.id) as CountRow;
  const turnNumber = count + 1;
  const turnId     = uuid();
  const now        = new Date().toISOString();

  db.prepare('INSERT INTO turns (id, session_id, turn_number, prompt, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(turnId, row.id, turnNumber, parsed.data.prompt, 'running', now);

  const sessionRef = toSession(row);
  void continueAgent(sessionRef as any, turnId, turnNumber, parsed.data.prompt, uid);

  res.status(201).json({ turnId, turnNumber, prompt: parsed.data.prompt, status: 'running', createdAt: now });
});

// ---------------------------------------------------------------------------
// GET /sessions/:id/clarifications
// ---------------------------------------------------------------------------

router.get('/:id/clarifications', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  interface ClarificationRow { id: string; session_id: string; question: string; options: string | null; response: string | null; created_at: string; responded_at: string | null }
  const rows = db.prepare('SELECT * FROM clarifications WHERE session_id = ? ORDER BY created_at ASC').all(row.id) as ClarificationRow[];
  res.json(rows.map(r => ({
    id: r.id, sessionId: r.session_id, question: r.question,
    options:     r.options     ? JSON.parse(r.options) : undefined,
    response:    r.response    ?? undefined,
    createdAt:   r.created_at,
    respondedAt: r.responded_at ?? undefined,
  })));
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/clarifications/:clarificationId/respond
// ---------------------------------------------------------------------------

const RespondSchema = z.object({ response: z.string().min(1) });

router.post('/:id/clarifications/:clarificationId/respond', (req: Request, res: Response) => {
  const parsed = RespondSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const clarId  = req.params.clarificationId;
  const clarRow = db.prepare('SELECT id FROM clarifications WHERE id = ? AND session_id = ?').get(clarId, row.id);
  if (!clarRow) { res.status(404).json({ error: 'Clarification not found' }); return; }

  db.prepare('UPDATE clarifications SET response = ?, responded_at = ? WHERE id = ?')
    .run(parsed.data.response, new Date().toISOString(), clarId);

  broadcastGlobal('global-event', {
    eventType:       'session.clarification_responded',
    sessionId:       row.id,
    clarificationId: clarId,
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /sessions/:id
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response) => {
  const uid = userId(req);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.status === 'merged') { res.status(400).json({ error: 'Cannot discard a merged session' }); return; }

  killAgent(row.id);

  if (row.work_task_id) {
    const task = db.prepare('SELECT id, parent_task_id FROM tasks WHERE id = ?').get(row.work_task_id) as (Pick<TaskRow, 'id'> & { parent_task_id: string | null }) | undefined;
    if (task) {
      const isOrphan = task.parent_task_id &&
        !db.prepare('SELECT id FROM tasks WHERE id = ?').get(task.parent_task_id);
      if (isOrphan) {
        // Subtask whose parent was deleted — clean up the orphan entirely
        db.prepare('UPDATE sessions SET work_task_id = NULL WHERE work_task_id = ?').run(task.id);
        db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
      } else {
        // Null the FK so the task record is no longer tied to this session,
        // but leave the task in its current status (don't re-queue it).
        db.prepare('UPDATE sessions SET work_task_id = NULL WHERE id = ?').run(row.id);
      }
    }
  }

  // Delete log file and session record first so discard always succeeds even if worktree cleanup fails
  fs.unlink(path.join(DATA_DIR, `${row.id}.log`), () => {});
  db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);

  if ((row.workspace_mode ?? 'git') === 'workspace') {
    removeWorkDir(row.worktree_path).catch(() => {});
  } else {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.project_id) as ProjectRow | undefined;
    if (project) {
      removeWorktree(
        { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at },
        row.worktree_path
      ).catch(() => {});
    }
  }

  res.status(204).send();
});

export default router;
