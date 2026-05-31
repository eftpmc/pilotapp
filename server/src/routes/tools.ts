import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

interface ToolRow {
  id: string; user_id: string; name: string;
  description: string; mcp_config: string; created_at: string;
}

function toTool(row: ToolRow) {
  return {
    id:          row.id,
    name:        row.name,
    description: row.description,
    mcpConfig:   JSON.parse(row.mcp_config) as Record<string, unknown>,
    createdAt:   row.created_at,
  };
}

// ---------------------------------------------------------------------------
// List all tools for user
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM tools WHERE user_id = ? ORDER BY created_at ASC').all(userId(req)) as ToolRow[];
  res.json(rows.map(toTool));
});

// ---------------------------------------------------------------------------
// Create tool
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  name:        z.string().min(1),
  description: z.string().default(''),
  mcpConfig:   z.record(z.string(), z.unknown()),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row: ToolRow = {
    id: uuid(), user_id: userId(req),
    name: parsed.data.name,
    description: parsed.data.description,
    mcp_config: JSON.stringify(parsed.data.mcpConfig),
    created_at: new Date().toISOString(),
  };
  db.prepare('INSERT INTO tools (id, user_id, name, description, mcp_config, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(row.id, row.user_id, row.name, row.description, row.mcp_config, row.created_at);
  res.status(201).json(toTool(row));
});

// ---------------------------------------------------------------------------
// Update tool
// ---------------------------------------------------------------------------

const PatchSchema = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().optional(),
  mcpConfig:   z.record(z.string(), z.unknown()).optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.prepare('SELECT * FROM tools WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as ToolRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  const sets: string[] = []; const vals: unknown[] = [];
  if (parsed.data.name        !== undefined) { sets.push('name = ?');        vals.push(parsed.data.name) }
  if (parsed.data.description !== undefined) { sets.push('description = ?'); vals.push(parsed.data.description) }
  if (parsed.data.mcpConfig   !== undefined) { sets.push('mcp_config = ?');  vals.push(JSON.stringify(parsed.data.mcpConfig)) }
  if (sets.length > 0) { vals.push(row.id); db.prepare(`UPDATE tools SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  res.json(toTool(db.prepare('SELECT * FROM tools WHERE id = ?').get(row.id) as ToolRow));
});

// ---------------------------------------------------------------------------
// Delete tool
// ---------------------------------------------------------------------------

router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM tools WHERE id = ? AND user_id = ?').get(req.params.id, userId(req));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare('DELETE FROM agent_tools WHERE tool_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tools WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Get all agent-tool assignments for this user
// ---------------------------------------------------------------------------

router.get('/assignments', (req: Request, res: Response) => {
  const uid = userId(req);
  const rows = db.prepare(`
    SELECT agt.agent_id, agt.tool_id FROM agent_tools agt
    JOIN agents a ON a.id = agt.agent_id
    WHERE a.user_id = ?
  `).all(uid) as { agent_id: string; tool_id: string }[];
  res.json(rows.map(r => ({ agentId: r.agent_id, toolId: r.tool_id })));
});

// ---------------------------------------------------------------------------
// Get tools assigned to an agent
// ---------------------------------------------------------------------------

router.get('/agent/:agentId', (req: Request, res: Response) => {
  const uid = userId(req);
  const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.agentId, uid);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  const rows = db.prepare(`
    SELECT t.* FROM tools t
    JOIN agent_tools agt ON agt.tool_id = t.id
    WHERE agt.agent_id = ?
    ORDER BY t.created_at ASC
  `).all(req.params.agentId) as ToolRow[];
  res.json(rows.map(toTool));
});

// ---------------------------------------------------------------------------
// Assign tool to agent
// ---------------------------------------------------------------------------

router.post('/agent/:agentId/:toolId', (req: Request, res: Response) => {
  const uid = userId(req);
  const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.agentId, uid);
  const tool  = db.prepare('SELECT id FROM tools WHERE id = ? AND user_id = ?').get(req.params.toolId, uid);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (!tool)  { res.status(404).json({ error: 'Tool not found' }); return; }
  db.prepare('INSERT OR IGNORE INTO agent_tools (agent_id, tool_id) VALUES (?, ?)').run(req.params.agentId, req.params.toolId);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Unassign tool from agent
// ---------------------------------------------------------------------------

router.delete('/agent/:agentId/:toolId', (req: Request, res: Response) => {
  const uid = userId(req);
  const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.agentId, uid);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  db.prepare('DELETE FROM agent_tools WHERE agent_id = ? AND tool_id = ?').run(req.params.agentId, req.params.toolId);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Department tool assignments
// ---------------------------------------------------------------------------

router.get('/dept-assignments', (req: Request, res: Response) => {
  const uid = userId(req);
  const rows = db.prepare(`
    SELECT dt.department_id, dt.tool_id FROM department_tools dt
    JOIN departments d ON d.id = dt.department_id
    WHERE d.user_id = ?
  `).all(uid) as { department_id: string; tool_id: string }[];
  res.json(rows.map(r => ({ departmentId: r.department_id, toolId: r.tool_id })));
});

router.post('/department/:deptId/:toolId', (req: Request, res: Response) => {
  const uid = userId(req);
  const dept = db.prepare('SELECT id FROM departments WHERE id = ? AND user_id = ?').get(req.params.deptId, uid);
  const tool = db.prepare('SELECT id FROM tools WHERE id = ? AND user_id = ?').get(req.params.toolId, uid);
  if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }
  if (!tool) { res.status(404).json({ error: 'Tool not found' }); return; }
  db.prepare('INSERT OR IGNORE INTO department_tools (department_id, tool_id) VALUES (?, ?)').run(req.params.deptId, req.params.toolId);
  res.status(204).send();
});

router.delete('/department/:deptId/:toolId', (req: Request, res: Response) => {
  const uid = userId(req);
  const dept = db.prepare('SELECT id FROM departments WHERE id = ? AND user_id = ?').get(req.params.deptId, uid);
  if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }
  db.prepare('DELETE FROM department_tools WHERE department_id = ? AND tool_id = ?').run(req.params.deptId, req.params.toolId);
  res.status(204).send();
});

export default router;
