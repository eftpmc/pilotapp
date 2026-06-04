import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import simpleGit from 'simple-git';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';
import { createWorktree } from '../services/git';
import { runAgent } from '../services/agents';

const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------

interface SpecRow {
  id: string; user_id: string; project_id: string; title: string;
  brief: string; content: string; session_id: string | null;
  status: string; created_at: string; updated_at: string;
}
interface ProjectRow { id: string; name: string; repo_path: string; role: string; created_at: string }
interface AgentRow   { id: string; name: string; provider: string; connection_id: string | null }

function toSpec(r: SpecRow | Record<string, unknown>) {
  return {
    id: r.id, projectId: r.project_id, title: r.title,
    brief: r.brief, content: r.content,
    sessionId: r.session_id ?? undefined,
    status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function planningPrompt(brief: string): string {
  return `You are writing a technical specification.

Brief: ${brief}

Read the codebase to understand the current state, then write a thorough specification to a file called SPEC.md.

Structure SPEC.md as:
# [Title matching the brief]

## Goal
What we are achieving.

## Current State
What already exists that is relevant.

## Approach
Step-by-step implementation plan.

## Acceptance Criteria
How we know the work is complete.

## Notes
Risks, edge cases, dependencies.

IMPORTANT: Write ONLY to SPEC.md. Do not modify any other files.`;
}

// ---------------------------------------------------------------------------
// GET /specs?projectId=
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const { projectId } = req.query;
  if (!projectId) { res.status(400).json({ error: 'projectId required' }); return; }
  const rows = db.prepare(
    'SELECT * FROM specs WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC'
  ).all(projectId, userId(req)) as SpecRow[];
  res.json(rows.map(toSpec));
});

// ---------------------------------------------------------------------------
// POST /specs — create, optionally trigger planning agent
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  projectId: z.string(),
  title:     z.string().min(1),
  brief:     z.string().default(''),
  agentId:   z.string().optional(),  // if provided → planning session
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid = userId(req);
  const { projectId, title, brief, agentId } = parsed.data;

  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, uid) as ProjectRow | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const now    = new Date().toISOString();
  const specId = uuid();

  let sessionId: string | null = null;
  let status = 'draft';

  if (agentId) {
    const agent = db.prepare(`
      SELECT a.*, COALESCE(c.type, a.provider) as provider
      FROM agents a
      LEFT JOIN connections c ON c.id = a.connection_id
      WHERE a.id = ? AND a.user_id = ?
    `).get(agentId, uid) as AgentRow | undefined;
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    status = 'planning';
  }

  // Insert spec first so the session FK reference resolves
  db.prepare(
    'INSERT INTO specs (id, user_id, project_id, title, brief, content, session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(specId, uid, projectId, title, brief, '', null, status, now, now);

  if (agentId) {
    const agent = db.prepare(`
      SELECT a.*, COALESCE(c.type, a.provider) as provider
      FROM agents a
      LEFT JOIN connections c ON c.id = a.connection_id
      WHERE a.id = ? AND a.user_id = ?
    `).get(agentId, uid) as AgentRow;
    try {
      const sId          = uuid();
      const worktreePath = await createWorktree(
        { id: project.id, name: project.name, repoPath: project.repo_path, role: project.role as any, createdAt: project.created_at },
        sId
      );

      db.prepare(
        'INSERT INTO sessions (id, user_id, agent_id, project_id, spec_id, provider, branch, worktree_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(sId, uid, agent.id, projectId, specId, agent.provider, `spec/${sId}`, worktreePath, 'idle', now);

      db.prepare('UPDATE specs SET session_id = ? WHERE id = ?').run(sId, specId);

      const sessionRef = { id: sId, agentId: agent.id, projectId, specId, provider: agent.provider as any, branch: `spec/${sId}`, worktreePath, status: 'idle', createdAt: now };
      void runAgent(sessionRef, planningPrompt(brief || title), uid);

      sessionId = sId;
    } catch (err: any) {
      // Clean up the spec if session creation failed
      db.prepare('DELETE FROM specs WHERE id = ?').run(specId);
      res.status(500).json({ error: err.message ?? 'Failed to start planning session' });
      return;
    }
  }

  const row = db.prepare('SELECT * FROM specs WHERE id = ?').get(specId) as SpecRow;
  res.status(201).json(toSpec(row));
});

// ---------------------------------------------------------------------------
// PATCH /specs/:id
// ---------------------------------------------------------------------------

const UpdateSchema = z.object({
  title:   z.string().min(1).optional(),
  content: z.string().optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const row = db.prepare('SELECT * FROM specs WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as SpecRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const now = new Date().toISOString();
  if (parsed.data.title   !== undefined) db.prepare('UPDATE specs SET title = ?, updated_at = ? WHERE id = ?').run(parsed.data.title, now, row.id);
  if (parsed.data.content !== undefined) db.prepare('UPDATE specs SET content = ?, updated_at = ? WHERE id = ?').run(parsed.data.content, now, row.id);

  const updated = db.prepare('SELECT * FROM specs WHERE id = ?').get(row.id) as SpecRow;
  res.json(toSpec(updated));
});

// ---------------------------------------------------------------------------
// DELETE /specs/:id
// ---------------------------------------------------------------------------

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM specs WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  // Null out spec_id on any sessions referencing this spec before deleting
  // (FK constraint: sessions.spec_id → specs.id with foreign_keys = ON)
  db.prepare('UPDATE sessions SET spec_id = NULL WHERE spec_id = ?').run(req.params.id);
  db.prepare('DELETE FROM specs WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /specs/:id/execute — create a task from this spec
// ---------------------------------------------------------------------------

router.post('/:id/execute', async (req: Request, res: Response) => {
  const uid = userId(req);
  const row = db.prepare('SELECT * FROM specs WHERE id = ? AND user_id = ?').get(req.params.id, uid) as SpecRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (!row.content.trim()) { res.status(400).json({ error: 'Spec has no content yet' }); return; }

  const project = db.prepare('SELECT repo_path FROM projects WHERE id = ? AND user_id = ?').get(row.project_id, uid) as { repo_path: string } | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  let baseBranch = 'main';
  try { baseBranch = (await simpleGit(project.repo_path).raw(['symbolic-ref', '--short', 'HEAD'])).trim(); } catch {}

  const taskId = uuid();
  const now    = new Date().toISOString();

  db.prepare(
    'INSERT INTO tasks (id, user_id, project_id, title, prompt, base_branch, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(taskId, uid, row.project_id, row.title, row.content, baseBranch, 'pending', now);

  res.status(201).json({ taskId, projectId: row.project_id });
});

export default router;
