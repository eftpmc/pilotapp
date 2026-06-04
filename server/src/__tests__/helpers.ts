import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';

const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// ---------------------------------------------------------------------------
// Seed helpers — insert rows directly into the test DB
// ---------------------------------------------------------------------------

export function seedUser(overrides: { email?: string } = {}) {
  const id    = uuid();
  const email = overrides.email ?? `user-${id.slice(0, 8)}@test.com`;
  const hash  = bcrypt.hashSync('password', 1);
  const now   = new Date().toISOString();
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(id, email, hash, now);
  return { id, email };
}

export function seedConnection(userId: string, overrides: Partial<{ name: string; type: string; apiKey: string }> = {}) {
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO connections (id, user_id, name, type, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, overrides.name ?? 'Claude', overrides.type ?? 'claude', overrides.apiKey ?? 'sk-test', now);
  return { id };
}

export function seedAgent(userId: string, overrides: Partial<{ name: string; provider: string; role: string; departmentId: string; connectionId: string; personality: string }> = {}) {
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO agents (id, user_id, name, provider, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, overrides.name ?? 'Atlas', overrides.provider ?? 'claude', overrides.role ?? 'worker', now);
  if (overrides.departmentId) db.prepare('UPDATE agents SET department_id = ? WHERE id = ?').run(overrides.departmentId, id);
  if (overrides.connectionId) db.prepare('UPDATE agents SET connection_id = ? WHERE id = ?').run(overrides.connectionId, id);
  if (overrides.personality)  db.prepare('UPDATE agents SET personality = ? WHERE id = ?').run(overrides.personality, id);
  return { id };
}

export function seedProject(userId: string, overrides: Partial<{ name: string; repoPath: string }> = {}) {
  const id       = uuid();
  const now      = new Date().toISOString();
  const repoPath = overrides.repoPath ?? `/tmp/test-repo-${id}`;
  db.prepare('INSERT INTO projects (id, user_id, name, repo_path, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, overrides.name ?? 'Test Project', repoPath, 'any', now);
  return { id, repoPath };
}

export function seedTask(userId: string, projectId: string, overrides: Partial<{ title: string; prompt: string; status: string; priority: number; agentId: string; sessionId: string; leadSessionId: string }> = {}) {
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO tasks (id, user_id, project_id, title, prompt, base_branch, status, priority, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, projectId, overrides.title ?? 'Test Task', overrides.prompt ?? 'do the thing', 'main', overrides.status ?? 'pending', overrides.priority ?? 0, 'm', now);
  if (overrides.agentId)        db.prepare('UPDATE tasks SET agent_id = ? WHERE id = ?').run(overrides.agentId, id);
  if (overrides.sessionId)      db.prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run(overrides.sessionId, id);
  if (overrides.leadSessionId)  db.prepare('UPDATE tasks SET lead_session_id = ? WHERE id = ?').run(overrides.leadSessionId, id);
  return { id };
}

export function seedSession(userId: string, agentId: string, projectId: string, overrides: Partial<{ status: string; workTaskId: string; parentSessionId: string; reviewVerdict: string; branch: string; worktreePath: string }> = {}) {
  const id           = uuid();
  const now          = new Date().toISOString();
  const branch       = overrides.branch       ?? `agent/${id}`;
  const worktreePath = overrides.worktreePath ?? `/tmp/worktrees/${id}`;
  db.prepare('INSERT INTO sessions (id, user_id, agent_id, project_id, provider, branch, worktree_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, agentId, projectId, 'claude', branch, worktreePath, overrides.status ?? 'idle', now);
  if (overrides.workTaskId)      db.prepare('UPDATE sessions SET work_task_id = ? WHERE id = ?').run(overrides.workTaskId, id);
  if (overrides.parentSessionId) db.prepare('UPDATE sessions SET parent_session_id = ? WHERE id = ?').run(overrides.parentSessionId, id);
  if (overrides.reviewVerdict)   db.prepare('UPDATE sessions SET review_verdict = ? WHERE id = ?').run(overrides.reviewVerdict, id);
  return { id, branch, worktreePath };
}

export function seedTool(userId: string, overrides: Partial<{ name: string; mcpConfig: Record<string, unknown> }> = {}) {
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO tools (id, user_id, name, description, mcp_config, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, overrides.name ?? 'Fetch', '', JSON.stringify(overrides.mcpConfig ?? { fetch: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] } }), now);
  return { id };
}

export function seedDepartment(userId: string, overrides: Partial<{ name: string; color: string }> = {}) {
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO departments (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, overrides.name ?? 'Engineering', '#6366f1', now);
  return { id };
}

// ---------------------------------------------------------------------------
// Auth token helper
// ---------------------------------------------------------------------------

export function authToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

// ---------------------------------------------------------------------------
// Full user+agent+project scaffold (the most common test setup)
// ---------------------------------------------------------------------------

export function scaffold() {
  const user    = seedUser();
  const conn    = seedConnection(user.id);
  const agent   = seedAgent(user.id, { connectionId: conn.id });
  const project = seedProject(user.id);
  const token   = authToken(user.id);
  return { user, conn, agent, project, token };
}
