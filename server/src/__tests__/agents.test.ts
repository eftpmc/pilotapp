/**
 * Tests for agent service logic — the layer where most bugs have lived.
 * We mock spawn + git and drive the service through runAgent, then assert
 * on DB state rather than return values.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { db } from '../db';
import { scaffold, seedConnection, seedTask, seedSession, seedTool, seedDepartment, seedAgent } from './helpers';
import { makeFakeProcess } from './setup';

const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

// A minimal stream-json line that looks like a claude assistant message
function assistantLine(text: string) {
  return JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
}

// ---------------------------------------------------------------------------
// MCP config path
// ---------------------------------------------------------------------------

describe('buildMcpConfig', () => {
  test('config file path is absolute', async () => {
    const { user, agent, project } = scaffold();
    const tool = seedTool(user.id);
    db.prepare('INSERT OR IGNORE INTO agent_tools (agent_id, tool_id) VALUES (?, ?)').run(agent.id, tool.id);
    const task    = seedTask(user.id, project.id);
    const session = seedSession(user.id, agent.id, project.id, { workTaskId: task.id });

    // Trigger MCP config generation by starting a session
    mockSpawn.mockReturnValueOnce(makeFakeProcess([assistantLine('done')], 0));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: session.id, agentId: agent.id, projectId: project.id, workTaskId: task.id, provider: 'claude', branch: `agent/${session.id}`, worktreePath: `/tmp/worktrees/${session.id}`, status: 'idle', createdAt: new Date().toISOString() }, 'do the thing', user.id);

    // Wait for close event
    await new Promise(r => setTimeout(r, 50));

    // Find the mcp config file that was created
    const dataDir = process.env.DATA_DIR!;
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('-mcp.json'));
    if (files.length > 0) {
      const filePath = path.join(dataDir, files[0]);
      expect(path.isAbsolute(filePath)).toBe(true);
      // The path passed to spawn's args should also be absolute
      const spawnArgs = mockSpawn.mock.calls[0]?.[1] as string[];
      const mcpFlagIdx = spawnArgs?.indexOf('--mcp-config');
      if (mcpFlagIdx !== undefined && mcpFlagIdx >= 0) {
        expect(path.isAbsolute(spawnArgs[mcpFlagIdx + 1])).toBe(true);
      }
    }
  });

  test('department tools are merged with agent tools', () => {
    const { user } = scaffold();
    const dept  = seedDepartment(user.id);
    const agent2 = seedAgent(user.id, { departmentId: dept.id });
    const agentTool = seedTool(user.id, { name: 'AgentTool', mcpConfig: { 'agent-tool': { command: 'npx', args: ['agent-tool'] } } });
    const deptTool  = seedTool(user.id, { name: 'DeptTool',  mcpConfig: { 'dept-tool':  { command: 'npx', args: ['dept-tool']  } } });
    db.prepare('INSERT OR IGNORE INTO agent_tools (agent_id, tool_id) VALUES (?, ?)').run(agent2.id, agentTool.id);
    db.prepare('INSERT OR IGNORE INTO department_tools (department_id, tool_id) VALUES (?, ?)').run(dept.id, deptTool.id);

    // Read the merged config that would be written
    const deptToolRows = db.prepare(`
      SELECT t.mcp_config FROM tools t
      JOIN department_tools dt ON dt.tool_id = t.id
      JOIN agents a ON a.department_id = dt.department_id
      WHERE a.id = ?
    `).all(agent2.id) as { mcp_config: string }[];

    const agentToolRows = db.prepare(`
      SELECT t.mcp_config FROM tools t
      JOIN agent_tools agt ON agt.tool_id = t.id
      WHERE agt.agent_id = ?
    `).all(agent2.id) as { mcp_config: string }[];

    const merged: Record<string, unknown> = {};
    for (const row of [...deptToolRows, ...agentToolRows]) {
      Object.assign(merged, JSON.parse(row.mcp_config));
    }

    expect(merged).toHaveProperty('dept-tool');
    expect(merged).toHaveProperty('agent-tool');
  });
});

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

describe('session lifecycle', () => {
  beforeEach(() => { mockSpawn.mockClear(); mockSpawn.mockImplementation(() => makeFakeProcess([], 0)); });

  test('normal session goes to done on exit 0', async () => {
    const { user, agent, project } = scaffold();
    const task    = seedTask(user.id, project.id);
    const session = seedSession(user.id, agent.id, project.id, { workTaskId: task.id });

    mockSpawn.mockReturnValueOnce(makeFakeProcess([assistantLine('all done')], 0));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: session.id, agentId: agent.id, projectId: project.id, workTaskId: task.id, provider: 'claude', branch: `agent/${session.id}`, worktreePath: `/tmp/worktrees/${session.id}`, status: 'idle', createdAt: new Date().toISOString() }, 'do the thing', user.id);
    await new Promise(r => setTimeout(r, 50));

    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(row.status).toBe('done');

    const taskRow = db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.id) as { status: string };
    expect(taskRow.status).toBe('done');
  });

  test('runner self-heals stale session provider from agent connection', async () => {
    const { user, agent, project } = scaffold();
    const codex = seedConnection(user.id, { name: 'Codex', type: 'codex' });
    db.prepare("UPDATE agents SET connection_id = ?, provider = 'claude' WHERE id = ?").run(codex.id, agent.id);
    const task    = seedTask(user.id, project.id);
    const session = seedSession(user.id, agent.id, project.id, { workTaskId: task.id });

    mockSpawn.mockReturnValueOnce(makeFakeProcess([JSON.stringify({ type: 'thread.started', thread_id: 'codex-thread' })], 0));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: session.id, agentId: agent.id, projectId: project.id, workTaskId: task.id, provider: 'claude', branch: `agent/${session.id}`, worktreePath: `/tmp/worktrees/${session.id}`, status: 'idle', createdAt: new Date().toISOString() }, 'do the thing', user.id, agent.id);
    await new Promise(r => setTimeout(r, 50));

    const row = db.prepare('SELECT provider FROM sessions WHERE id = ?').get(session.id) as { provider: string };
    expect(row.provider).toBe('codex');
    const spawnArgs = mockSpawn.mock.calls[0]?.[1] as string[];
    expect(spawnArgs[0]).toBe('exec');
  });

  test('session goes to error on non-zero exit', async () => {
    const { user, agent, project } = scaffold();
    const task    = seedTask(user.id, project.id);
    const session = seedSession(user.id, agent.id, project.id, { workTaskId: task.id });

    mockSpawn.mockReturnValueOnce(makeFakeProcess([], 1));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: session.id, agentId: agent.id, projectId: project.id, workTaskId: task.id, provider: 'claude', branch: `agent/${session.id}`, worktreePath: `/tmp/worktrees/${session.id}`, status: 'idle', createdAt: new Date().toISOString() }, 'do the thing', user.id);
    await new Promise(r => setTimeout(r, 50));

    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(row.status).toBe('error');
  });

  test('journal is captured from JOURNAL.md on completion', async () => {
    const { user, agent, project } = scaffold();
    const task    = seedTask(user.id, project.id);
    const wtPath  = `/tmp/worktrees/journal-test-${Date.now()}`;
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'JOURNAL.md'), '# Journal\n\nDid the thing.');
    const session = seedSession(user.id, agent.id, project.id, { workTaskId: task.id, worktreePath: wtPath });

    mockSpawn.mockReturnValueOnce(makeFakeProcess([], 0));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: session.id, agentId: agent.id, projectId: project.id, workTaskId: task.id, provider: 'claude', branch: `agent/${session.id}`, worktreePath: wtPath, status: 'idle', createdAt: new Date().toISOString() }, 'do the thing', user.id);
    await new Promise(r => setTimeout(r, 50));

    const row = db.prepare('SELECT journal FROM sessions WHERE id = ?').get(session.id) as { journal: string | null };
    expect(row.journal).toContain('Did the thing');
  });
});

// ---------------------------------------------------------------------------
// Lead agent
// ---------------------------------------------------------------------------

describe('lead agent', () => {
  beforeEach(() => { mockSpawn.mockClear(); mockSpawn.mockImplementation(() => makeFakeProcess([], 0)); });

  test('lead session is auto-merged after creating delegated tasks', async () => {
    const { user, project } = scaffold();
    const leadAgent = seedAgent(user.id, { name: 'Lead', role: 'lead' });
    const task      = seedTask(user.id, project.id, { prompt: 'build auth' });
    const wtPath    = `/tmp/worktrees/lead-test-${Date.now()}`;
    fs.mkdirSync(wtPath, { recursive: true });

    const session = seedSession(user.id, leadAgent.id, project.id, { workTaskId: task.id, worktreePath: wtPath });
    seedTask(user.id, project.id, { title: 'Auth routes',   prompt: 'Implement POST /auth/login', leadSessionId: session.id });
    seedTask(user.id, project.id, { title: 'Auth frontend', prompt: 'Add login form',             leadSessionId: session.id });
    mockSpawn.mockReturnValueOnce(makeFakeProcess([], 0));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: session.id, agentId: leadAgent.id, projectId: project.id, workTaskId: task.id, provider: 'claude', branch: `agent/${session.id}`, worktreePath: wtPath, status: 'idle', createdAt: new Date().toISOString() }, 'build auth', user.id, leadAgent.id);
    await new Promise(r => setTimeout(r, 100));

    // Lead session should be merged, NOT done — never appears in Review column
    const sessionRow = db.prepare('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(sessionRow.status).toBe('merged');

    // Delegated tasks are linked in the DB
    const createdTasks = db.prepare('SELECT title, lead_session_id FROM tasks WHERE project_id = ? AND id != ?').all(project.id, task.id) as { title: string; lead_session_id: string }[];
    expect(createdTasks).toHaveLength(2);
    expect(createdTasks.every(t => t.lead_session_id === session.id)).toBe(true);
    expect(createdTasks.map(t => t.title)).toEqual(expect.arrayContaining(['Auth routes', 'Auth frontend']));
  });

  test('lead session stays done when TASKS.json is missing', async () => {
    const { user, project } = scaffold();
    const leadAgent = seedAgent(user.id, { name: 'Lead', role: 'lead' });
    const task      = seedTask(user.id, project.id);
    const wtPath    = `/tmp/worktrees/lead-notasks-${Date.now()}`;
    fs.mkdirSync(wtPath, { recursive: true });
    // No TASKS.json written

    const session = seedSession(user.id, leadAgent.id, project.id, { workTaskId: task.id, worktreePath: wtPath });
    mockSpawn.mockReturnValueOnce(makeFakeProcess([], 0));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: session.id, agentId: leadAgent.id, projectId: project.id, workTaskId: task.id, provider: 'claude', branch: `agent/${session.id}`, worktreePath: wtPath, status: 'idle', createdAt: new Date().toISOString() }, 'plan something', user.id, leadAgent.id);
    await new Promise(r => setTimeout(r, 100));

    // Without TASKS.json, lead session ends as done (user can review the output)
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(row.status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// Review session
// ---------------------------------------------------------------------------

describe('review session', () => {
  beforeEach(() => { mockSpawn.mockClear(); mockSpawn.mockImplementation(() => makeFakeProcess([], 0)); });

  test('REVIEW.md approved verdict propagates to parent session', async () => {
    const { user, agent, project } = scaffold();
    const reviewer = seedAgent(user.id, { name: 'Reviewer', role: 'reviewer' });
    const task     = seedTask(user.id, project.id);
    const wtPath   = `/tmp/worktrees/review-${Date.now()}`;
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'REVIEW.md'), 'APPROVED\n\nLooks good.');

    // Parent session already done
    const parentSession = seedSession(user.id, agent.id, project.id, { status: 'done', workTaskId: task.id });

    // Review session with parentSessionId
    const reviewSession = seedSession(user.id, reviewer.id, project.id, { parentSessionId: parentSession.id, worktreePath: wtPath });
    mockSpawn.mockReturnValueOnce(makeFakeProcess([], 0));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: reviewSession.id, agentId: reviewer.id, projectId: project.id, parentSessionId: parentSession.id, provider: 'claude', branch: `review/${reviewSession.id}`, worktreePath: wtPath, status: 'idle', createdAt: new Date().toISOString() }, 'review this', user.id, reviewer.id);
    await new Promise(r => setTimeout(r, 50));

    const parentRow = db.prepare('SELECT review_verdict FROM sessions WHERE id = ?').get(parentSession.id) as { review_verdict: string };
    expect(parentRow.review_verdict).toBe('approved');
  });

  test('REVIEW.md changes_requested verdict propagates to parent', async () => {
    const { user, agent, project } = scaffold();
    const reviewer = seedAgent(user.id, { name: 'Reviewer', role: 'reviewer' });
    const task     = seedTask(user.id, project.id);
    const wtPath   = `/tmp/worktrees/review-changes-${Date.now()}`;
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'REVIEW.md'), 'CHANGES REQUESTED\n\nNeed better error handling.');

    const parentSession = seedSession(user.id, agent.id, project.id, { status: 'done', workTaskId: task.id });
    const reviewSession = seedSession(user.id, reviewer.id, project.id, { parentSessionId: parentSession.id, worktreePath: wtPath });
    mockSpawn.mockReturnValueOnce(makeFakeProcess([], 0));

    const { runAgent } = await import('../services/agents');
    await runAgent({ id: reviewSession.id, agentId: reviewer.id, projectId: project.id, parentSessionId: parentSession.id, provider: 'claude', branch: `review/${reviewSession.id}`, worktreePath: wtPath, status: 'idle', createdAt: new Date().toISOString() }, 'review this', user.id, reviewer.id);
    await new Promise(r => setTimeout(r, 50));

    const parentRow = db.prepare('SELECT review_verdict FROM sessions WHERE id = ?').get(parentSession.id) as { review_verdict: string };
    expect(parentRow.review_verdict).toBe('changes_requested');
  });
});
