/**
 * Internal-only routes called by the MCP stdio server over loopback.
 * No auth middleware — validated by X-Pilot-Internal header + loopback origin.
 * Mounted at /internal in app.ts.
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { broadcastGlobal } from '../services/broadcast';
import { writeEvent } from '../services/events';
import { markSessionWaiting, markSessionRunning, assignTaskToSession } from '../services/lifecycle';
import { continueAgent, broadcastToSession } from '../services/agents';

const execAsync = promisify(exec);

const router = Router();

// Reject requests not from loopback and missing the sentinel header
router.use((req: Request, res: Response, next) => {
  const addr = req.socket.remoteAddress ?? '';
  const isLoopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!isLoopback || !req.headers['x-pilot-internal']) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Helper: look up a session row, verify it exists
// ---------------------------------------------------------------------------

interface SessionMin {
  id: string; user_id: string; agent_id: string; project_id: string;
  work_task_id: string | null; spec_id: string | null;
  parent_session_id: string | null;
  runner_session_id: string | null; status: string; journal: string | null;
  provider: string; branch: string; worktree_path: string; created_at: string;
}

function param(p: string | string[]): string { return Array.isArray(p) ? p[0] : p; }

function getSession(id: string): SessionMin | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionMin | undefined;
}

// ---------------------------------------------------------------------------
// POST /internal/tasks
// Create a task (called by lead agent via MCP create_task tool)
// ---------------------------------------------------------------------------

router.post('/tasks', async (req: Request, res: Response) => {
  const { sessionId, title, prompt, baseBranch = 'main', role = 'worker', priority = 5, dependsOn = [] } = req.body as {
    sessionId: string; title: string; prompt: string;
    baseBranch?: string; role?: string; priority?: number; dependsOn?: string[];
  };

  if (!sessionId || !title) {
    res.status(400).json({ error: 'sessionId and title are required' }); return;
  }

  const session = getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  // parentTaskId = the task this session is working on (the lead task)
  const parentTaskId = session.work_task_id ?? null;

  const taskId = uuid();
  const now    = new Date().toISOString();

  const dependsOnJson = dependsOn.length > 0 ? JSON.stringify(dependsOn) : null;
  db.prepare(`
    INSERT INTO tasks (id, user_id, project_id, title, prompt, base_branch, status, priority, size, parent_task_id, depends_on, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 'm', ?, ?, ?)
  `).run(taskId, session.user_id, session.project_id, title.trim(), (prompt ?? '').trim(), baseBranch, Math.min(10, Math.max(0, Math.round(priority))), parentTaskId, dependsOnJson, now);

  writeEvent(session.user_id, 'task.created', { taskId, projectId: session.project_id, agentId: session.agent_id });

  // Auto-assign to idle agent of requested role if possible (skip if dependencies not met)
  const depsBlocked = dependsOn.length > 0 && (() => {
    const placeholders = dependsOn.map(() => '?').join(',');
    const blocking = db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE id IN (${placeholders}) AND status NOT IN ('done','failed')`
    ).get(...dependsOn) as { count: number };
    return blocking.count > 0;
  })();

  if (!depsBlocked) {
    const idleAgent = db.prepare(`
      SELECT a.id, COALESCE(c.type, a.provider) as provider FROM agents a
      LEFT JOIN connections c ON c.id = a.connection_id
      WHERE a.user_id = ?
        AND a.role = 'worker'
        AND a.id NOT IN (SELECT agent_id FROM sessions WHERE status IN ('running', 'idle', 'waiting'))
      ORDER BY a.created_at ASC
      LIMIT 1
    `).get(session.user_id) as { id: string; provider: string } | undefined;

    if (idleAgent) {
      const { createWorktree } = await import('../services/git');
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.project_id) as
        { id: string; name: string; repo_path: string; role: string; created_at: string } | undefined;

      if (project) {
        const newSessionId  = uuid();
        const branch        = `agent/${newSessionId}`;
        const projectObj    = { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at };

        try {
          const worktreePath = await createWorktree(projectObj, newSessionId, baseBranch);

          // Atomically claim the task — bail if another worker already took it
          const claimed = db.prepare(
            "UPDATE tasks SET status = 'running', agent_id = ?, started_at = ? WHERE id = ? AND status = 'pending'"
          ).run(idleAgent.id, now, taskId);

          if (claimed.changes === 0) {
            // Task already claimed by a concurrent auto-assign; clean up the worktree we just made
            const { removeWorktree } = await import('../services/git');
            removeWorktree(projectObj, worktreePath).catch(() => {});
          } else {
            db.prepare(`
              INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?)
            `).run(newSessionId, session.user_id, idleAgent.id, session.project_id, taskId, idleAgent.provider, branch, worktreePath, now);

            const { runAgent } = await import('../services/agents');
            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as { prompt: string } | undefined;
            if (task) {
              const newSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(newSessionId) as any;
              void runAgent(
                { id: newSession.id, agentId: newSession.agent_id, projectId: newSession.project_id,
                  workTaskId: newSession.work_task_id, provider: newSession.provider, branch: newSession.branch,
                  worktreePath: newSession.worktree_path, status: newSession.status, createdAt: newSession.created_at },
                task.prompt, session.user_id, idleAgent.id
              );
            }
          }
        } catch (err) {
          console.error('[internal] Failed to auto-assign:', err);
        }
      }
    }
  }

  const task = db.prepare('SELECT id, title, status FROM tasks WHERE id = ?').get(taskId);
  res.status(201).json(task);
});

// ---------------------------------------------------------------------------
// GET /internal/sessions/:id
// ---------------------------------------------------------------------------

router.get('/sessions/:id', (req: Request, res: Response) => {
  const session = getSession(param(req.params.id));
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({
    id:              session.id,
    status:          session.status,
    journal:         session.journal,
    agentId:         session.agent_id,
    projectId:       session.project_id,
    workTaskId:      session.work_task_id,
    parentSessionId: session.parent_session_id,
  });
});

// ---------------------------------------------------------------------------
// PATCH /internal/sessions/:id/journal
// ---------------------------------------------------------------------------

router.patch('/sessions/:id/journal', (req: Request, res: Response) => {
  const { content } = req.body as { content: string };
  if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
  db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(content, param(req.params.id));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PATCH /internal/sessions/:id/journal/append
// ---------------------------------------------------------------------------

router.patch('/sessions/:id/journal/append', (req: Request, res: Response) => {
  const { content } = req.body as { content: string };
  if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
  const id = param(req.params.id);
  const row = db.prepare('SELECT journal FROM sessions WHERE id = ?').get(id) as { journal: string | null } | undefined;
  if (!row) { res.status(404).json({ error: 'Session not found' }); return; }
  const updated = row.journal ? `${row.journal}\n\n${content}` : content;
  db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(updated, id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /internal/tasks/:id
// ---------------------------------------------------------------------------

router.get('/tasks/:id', (req: Request, res: Response) => {
  const taskId = param(req.params.id);
  const task = db.prepare('SELECT id, title, status, prompt, started_at, completed_at FROM tasks WHERE id = ?').get(taskId) as
    { id: string; title: string; status: string; prompt: string; started_at: string | null; completed_at: string | null } | undefined;
  if (!task) { res.status(404).json({ error: 'Not found' }); return; }

  const session = db.prepare(
    "SELECT id, status, journal FROM sessions WHERE work_task_id = ? AND status IN ('done','error','merged') ORDER BY created_at DESC LIMIT 1"
  ).get(taskId) as { id: string; status: string; journal: string | null } | undefined;

  res.json({
    id:          task.id,
    title:       task.title,
    status:      task.status,
    startedAt:   task.started_at,
    completedAt: task.completed_at,
    session:     session ? { id: session.id, status: session.status, journal: session.journal } : null,
  });
});

// ---------------------------------------------------------------------------
// GET /internal/agents
// ---------------------------------------------------------------------------

router.get('/agents', (req: Request, res: Response) => {
  // Derive user_id from the calling session (passed via PILOT_SESSION_ID env in MCP server)
  // The MCP server always sends its session ID in tool calls — resolve user from that.
  // We accept it as a query param for simplicity since this is loopback-only.
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) { res.status(400).json({ error: 'sessionId query param required' }); return; }
  const session = getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  interface AgentStatusRow {
    id: string; name: string; role: string; provider: string;
    current_status: string | null;
  }
  const agents = db.prepare(`
    SELECT a.id, a.name, a.role, a.provider,
      (SELECT s.status FROM sessions s
       WHERE s.agent_id = a.id AND s.status IN ('running', 'idle', 'waiting')
       LIMIT 1) as current_status
    FROM agents a
    WHERE a.user_id = ?
    ORDER BY a.name ASC
  `).all(session.user_id) as AgentStatusRow[];

  res.json(agents.map(a => ({
    id:            a.id,
    name:          a.name,
    role:          a.role,
    provider:      a.provider,
    available:     a.current_status === null,
    currentStatus: a.current_status ?? 'available',
  })));
});

// ---------------------------------------------------------------------------
// GET /internal/tasks?sessionId=&status=
// List tasks in the calling session's project.
// ---------------------------------------------------------------------------

router.get('/tasks', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  const statusFilter = req.query.status as string | undefined; // comma-separated, e.g. "pending,running"
  if (!sessionId) { res.status(400).json({ error: 'sessionId query param required' }); return; }

  const session = getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const allowedStatuses = ['pending', 'running', 'done', 'failed'];
  const statuses = statusFilter
    ? statusFilter.split(',').map(s => s.trim()).filter(s => allowedStatuses.includes(s))
    : allowedStatuses;

  const placeholders = statuses.map(() => '?').join(',');
  interface TaskRow { id: string; title: string; status: string; priority: number; base_branch: string; created_at: string; parent_task_id: string | null }
  const tasks = db.prepare(`
    SELECT id, title, status, priority, base_branch, created_at, parent_task_id
    FROM tasks
    WHERE project_id = ? AND status IN (${placeholders})
    ORDER BY priority DESC, created_at ASC
    LIMIT 50
  `).all(session.project_id, ...statuses) as TaskRow[];

  res.json(tasks.map(t => ({
    id:            t.id,
    title:         t.title,
    status:        t.status,
    priority:      t.priority,
    baseBranch:    t.base_branch,
    createdAt:     t.created_at,
    isSubtask:     !!t.parent_task_id,
  })));
});

// ---------------------------------------------------------------------------
// PATCH /internal/specs/:id
// ---------------------------------------------------------------------------

router.patch('/specs/:id', (req: Request, res: Response) => {
  const { content } = req.body as { content: string };
  if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
  const now = new Date().toISOString();
  db.prepare("UPDATE specs SET content = ?, status = 'draft', updated_at = ? WHERE id = ?").run(content, now, param(req.params.id));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /internal/sessions/:id/review
// ---------------------------------------------------------------------------

router.post('/sessions/:id/review', (req: Request, res: Response) => {
  const { verdict, comments = [] } = req.body as { verdict: string; comments?: string[] };
  if (!verdict) { res.status(400).json({ error: 'verdict required' }); return; }

  const session = getSession(param(req.params.id));
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }

  const journalContent = `VERDICT: ${verdict.toUpperCase()}\n\n${comments.join('\n')}`.trim();
  db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(journalContent, session.id);

  const normalized = verdict === 'approved' ? 'approved' : 'changes_requested';
  if (session.parent_session_id) {
    db.prepare('UPDATE sessions SET review_verdict = ? WHERE id = ?').run(normalized, session.parent_session_id);
  }

  writeEvent(session.user_id, 'session.review_completed', {
    sessionId: session.parent_session_id ?? session.id,
    agentId:   session.agent_id,
    projectId: session.project_id,
    extra:     { verdict: normalized, reviewSessionId: session.id },
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /internal/clarifications
// Creates a clarification, broadcasts it, then long-polls until user responds.
// ---------------------------------------------------------------------------

// Active long-polls — cleared on process exit
const activePollCleanup = new Map<string, { interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> }>();

router.post('/clarifications', async (req: Request, res: Response) => {
  const { sessionId, question, options } = req.body as {
    sessionId: string; question: string; options?: string[] | null;
  };
  if (!sessionId || !question) { res.status(400).json({ error: 'sessionId and question required' }); return; }

  const session = getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const id  = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO clarifications (id, session_id, user_id, question, options, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, session.user_id, question, options ? JSON.stringify(options) : null, now);

  markSessionWaiting(sessionId);

  broadcastGlobal('global-event', {
    eventType:       'session.clarification_requested',
    sessionId,
    clarificationId: id,
  });

  // Also push directly onto the session stream so the SessionPage sees it inline
  broadcastToSession(sessionId, 'clarification', JSON.stringify({
    id, question, options: options ?? null,
  }));

  // Long-poll: check DB every 500ms, resolve when user responds, timeout after 10 min
  try {
    const response = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval);
        activePollCleanup.delete(id);
        reject(new Error('timeout'));
      }, 10 * 60 * 1000);

      const interval = setInterval(() => {
        const row = db.prepare('SELECT response, responded_at FROM clarifications WHERE id = ?').get(id) as
          { response: string | null; responded_at: string | null } | undefined;
        if (row?.responded_at) {
          clearInterval(interval);
          clearTimeout(timeout);
          activePollCleanup.delete(id);
          resolve(row.response ?? '');
        }
      }, 500);

      activePollCleanup.set(id, { interval, timeout });
    });

    markSessionRunning(sessionId);
    res.json({ response });
  } catch {
    // Timeout — resume session so agent can continue
    markSessionRunning(sessionId);
    res.status(504).json({ error: 'Clarification timed out — no response from user after 10 minutes' });
  }
});


// ---------------------------------------------------------------------------
// POST /internal/sessions/:id/skip-task
// ---------------------------------------------------------------------------

router.post('/sessions/:id/skip-task', (req: Request, res: Response) => {
  const { reason } = req.body as { reason: string };
  const session = getSession(param(req.params.id));
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }

  const journal = `SKIPPED\n\nReason: ${reason}`;
  db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(journal, session.id);

  if (session.work_task_id) {
    db.prepare("UPDATE tasks SET status = 'failed', completed_at = ? WHERE id = ? AND status = 'running'")
      .run(new Date().toISOString(), session.work_task_id);
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /internal/sessions/:id/complete-task
// ---------------------------------------------------------------------------

router.post('/sessions/:id/complete-task', (req: Request, res: Response) => {
  const { summary } = req.body as { summary: string };
  const session = getSession(param(req.params.id));
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }

  db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(summary, session.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /internal/sessions/:id/quota
// ---------------------------------------------------------------------------

router.get('/sessions/:id/quota', (req: Request, res: Response) => {
  const row = db.prepare(`
    SELECT c.quota_status, c.quota_reset_at
    FROM sessions s
    JOIN agents a ON a.id = s.agent_id
    JOIN connections c ON c.id = a.connection_id
    WHERE s.id = ?
  `).get(param(req.params.id)) as { quota_status: string; quota_reset_at: string | null } | undefined;

  if (!row) { res.json({ quotaStatus: 'ok', quotaResetAt: null }); return; }
  res.json({ quotaStatus: row.quota_status, quotaResetAt: row.quota_reset_at });
});

// ---------------------------------------------------------------------------
// POST /internal/sessions/:id/send-to-agent
// Queue a follow-up turn for another session.
// ---------------------------------------------------------------------------

router.post('/sessions/:id/send-to-agent', async (req: Request, res: Response) => {
  const { targetSessionId, message } = req.body as { targetSessionId: string; message: string };
  if (!targetSessionId || !message) { res.status(400).json({ error: 'targetSessionId and message required' }); return; }

  const source = getSession(param(req.params.id));
  const target = getSession(targetSessionId);
  if (!source || !target) { res.status(404).json({ error: 'Session not found' }); return; }
  if (target.user_id !== source.user_id) { res.status(403).json({ error: 'Forbidden' }); return; }
  if (!['done', 'error'].includes(target.status)) {
    res.status(409).json({ error: `Target session is ${target.status} — can only send to done or error sessions` }); return;
  }
  if (!target.runner_session_id) {
    res.status(400).json({ error: 'Target session has no runner session ID — cannot continue' }); return;
  }

  interface CountRow { count: number }
  const { count } = db.prepare('SELECT COUNT(*) as count FROM turns WHERE session_id = ?').get(targetSessionId) as CountRow;
  const turnNumber = count + 1;
  const turnId     = uuid();
  const now        = new Date().toISOString();

  db.prepare('INSERT INTO turns (id, session_id, turn_number, prompt, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(turnId, targetSessionId, turnNumber, message, 'running', now);

  void continueAgent(
    {
      id: target.id, agentId: target.agent_id, projectId: target.project_id,
      workTaskId: target.work_task_id ?? undefined, provider: target.provider as any,
      branch: target.branch, worktreePath: target.worktree_path,
      status: target.status, createdAt: target.created_at,
    },
    turnId, turnNumber, message, target.user_id
  );

  res.status(201).json({ turnId, turnNumber });
});

// ---------------------------------------------------------------------------
// POST /internal/sessions/:id/signal-lead
// Worker signals its lead mid-task. Queues a turn on the lead's done session.
// ---------------------------------------------------------------------------

router.post('/sessions/:id/signal-lead', async (req: Request, res: Response) => {
  const { message } = req.body as { message: string };
  if (!message) { res.status(400).json({ error: 'message required' }); return; }

  const session = getSession(param(req.params.id));
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  // Walk up: session → subtask → parent_task_id → lead's most recent session
  if (!session.work_task_id) {
    res.json({ ok: true, note: 'no task associated — signal ignored' }); return;
  }
  const task = db.prepare('SELECT parent_task_id, title FROM tasks WHERE id = ?').get(session.work_task_id) as
    { parent_task_id: string | null; title: string } | undefined;
  if (!task?.parent_task_id) {
    res.json({ ok: true, note: 'task has no parent — signal ignored' }); return;
  }

  const lead = db.prepare(
    "SELECT * FROM sessions WHERE work_task_id = ? AND parent_session_id IS NULL ORDER BY created_at DESC LIMIT 1"
  ).get(task.parent_task_id) as ReturnType<typeof getSession>;
  if (!lead) { res.json({ ok: true, note: 'lead session not found — signal ignored' }); return; }
  if (!['done', 'error'].includes(lead.status)) {
    // Lead is still running — append to journal instead of queuing a turn
    const note = `[signal from worker on "${task.title}"]: ${message}`;
    const row  = db.prepare('SELECT journal FROM sessions WHERE id = ?').get(lead.id) as { journal: string | null } | undefined;
    const updated = row?.journal ? `${row.journal}\n\n${note}` : note;
    db.prepare('UPDATE sessions SET journal = ? WHERE id = ?').run(updated, lead.id);
    res.json({ ok: true, queued: false, note: 'lead is running — appended to journal' }); return;
  }
  if (!lead.runner_session_id) {
    res.json({ ok: true, note: 'lead has no runner session ID — cannot queue turn' }); return;
  }

  const agentRow = db.prepare(`
    SELECT a.id, COALESCE(c.type, a.provider) as provider
    FROM agents a
    LEFT JOIN connections c ON c.id = a.connection_id
    WHERE a.id = ?
  `).get(lead.agent_id) as { id: string; provider: string } | undefined;
  if (!agentRow) { res.json({ ok: true, note: 'lead agent not found' }); return; }

  interface CountRow { count: number }
  const { count } = db.prepare('SELECT COUNT(*) as count FROM turns WHERE session_id = ?').get(lead.id) as CountRow;
  const turnNumber = count + 1;
  const turnId     = uuid();
  const now        = new Date().toISOString();
  const turnPrompt = `[Mid-task signal from worker on subtask "${task.title}"]\n\n${message}\n\nYou can respond by queuing a \`send_to_agent\` turn, or note this in your synthesis when all tasks complete.`;

  db.prepare('INSERT INTO turns (id, session_id, turn_number, prompt, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(turnId, lead.id, turnNumber, turnPrompt, 'running', now);

  void continueAgent(
    {
      id: lead.id, agentId: lead.agent_id, projectId: lead.project_id,
      workTaskId: lead.work_task_id ?? undefined, provider: lead.provider as any,
      branch: lead.branch, worktreePath: lead.worktree_path,
      status: lead.status, createdAt: lead.created_at,
    },
    turnId, turnNumber, turnPrompt, lead.user_id,
  );

  res.status(201).json({ ok: true, queued: true, turnId });
});

// ---------------------------------------------------------------------------
// POST /internal/knowledge
// Agent creates or updates a knowledge doc scoped to itself.
// ---------------------------------------------------------------------------

router.post('/knowledge', (req: Request, res: Response) => {
  const { sessionId, title, content } = req.body as { sessionId: string; title: string; content: string };
  if (!sessionId || !title || content === undefined) {
    res.status(400).json({ error: 'sessionId, title, and content are required' }); return;
  }
  const session = getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const now = new Date().toISOString();
  // Upsert by (user_id, scope='agent', scope_id=agent_id, title)
  const existing = db.prepare(
    "SELECT id FROM knowledge WHERE user_id = ? AND scope = 'agent' AND scope_id = ? AND title = ?"
  ).get(session.user_id, session.agent_id, title) as { id: string } | undefined;

  if (existing) {
    db.prepare("UPDATE knowledge SET content = ?, updated_at = ? WHERE id = ?").run(content, now, existing.id);
    res.json({ id: existing.id });
  } else {
    const id = uuid();
    db.prepare(
      "INSERT INTO knowledge (id, user_id, scope, scope_id, title, content, created_at, updated_at) VALUES (?, ?, 'agent', ?, ?, ?, ?, ?)"
    ).run(id, session.user_id, session.agent_id, title, content, now, now);
    res.status(201).json({ id });
  }
});

// ---------------------------------------------------------------------------
// POST /internal/sessions/:id/run-checks
// Run lint / test / typecheck scripts in the session's worktree.
// ---------------------------------------------------------------------------

const CHECK_SCRIPTS = ['test', 'lint', 'typecheck', 'type-check', 'check', 'validate'];

router.post('/sessions/:id/run-checks', async (req: Request, res: Response) => {
  const { command, timeoutSeconds = 120 } = req.body as { command?: string; timeoutSeconds?: number };

  const session = getSession(param(req.params.id));
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }

  // Detect available scripts from package.json
  let available: string[] = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(session.worktree_path, 'package.json'), 'utf-8'));
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    available = CHECK_SCRIPTS.filter(s => s in scripts);
  } catch { /* no package.json or unreadable */ }

  const toRun = command ? [command] : available;
  if (toRun.length === 0) {
    res.json({ passed: true, results: [], note: 'No check scripts found in package.json' });
    return;
  }

  const results: { name: string; passed: boolean; output: string }[] = [];
  let allPassed = true;

  for (const script of toRun) {
    try {
      const { stdout, stderr } = await execAsync(`npm run ${script}`, {
        cwd: session.worktree_path,
        timeout: timeoutSeconds * 1000,
        env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
      });
      const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
      // Keep the tail — failures show up at the end
      results.push({ name: script, passed: true, output: combined.slice(-3000) });
    } catch (err: unknown) {
      allPassed = false;
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const combined = [(e.stdout ?? ''), (e.stderr ?? '')].filter(Boolean).join('\n').trim()
        || (e.message ?? 'unknown error');
      results.push({ name: script, passed: false, output: combined.slice(-3000) });
    }
  }

  res.json({ passed: allPassed, results });
});

export default router;
