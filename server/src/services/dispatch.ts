/**
 * Shared session-creation logic used by task assignment routes and the
 * auto-dispatch sweep inside agents.ts. Previously duplicated in three places.
 */

import { v4 as uuid } from 'uuid';
import path from 'path';
import { db } from '../db';
import { createWorktree, createWorkDir, copyTaskFilesToWorkDir, seedWorkDirFromWorkspace, removeWorktree, removeWorkDir } from './git';
import { runAgent } from './agents';
import { assignTaskToSession } from './lifecycle';
import type { AgentProvider } from '../types';

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');

function projectWorkspaceDir(projectId: string): string {
  return path.join(DATA_DIR, 'workspaces', projectId);
}

function taskFilesDir(taskId: string): string {
  return path.join(DATA_DIR, 'task-files', taskId);
}

interface ProjectMin {
  id: string;
  name: string;
  repo_path: string;
  role: string;
  workspace_mode: string;
  created_at: string;
}

interface AgentMin {
  id: string;
  provider: string;
}

export interface DispatchResult {
  sessionId: string;
}

/**
 * Create a worktree/workdir, insert a session record, mark the task running,
 * and fire `runAgent`. Returns the new session ID.
 *
 * Re-checks task status after the async worktree setup to guard against races
 * (two concurrent callers claiming the same pending task).
 */
export async function createSessionForTask(
  taskId: string,
  taskPrompt: string,
  taskBaseBranch: string,
  agent: AgentMin,
  project: ProjectMin,
  userId: string,
): Promise<DispatchResult | null> {
  const isGit = (project.workspace_mode ?? 'git') === 'git';
  const projectObj = {
    id: project.id, name: project.name, repoPath: project.repo_path,
    role: project.role as any, createdAt: project.created_at,
  };
  const sessionId     = uuid();
  const branch        = isGit ? `agent/${sessionId}` : '';
  const workspaceMode = isGit ? 'git' : 'workspace';
  const now           = new Date().toISOString();

  let worktreePath: string;
  try {
    worktreePath = isGit
      ? await createWorktree(projectObj, sessionId, taskBaseBranch)
      : await createWorkDir(sessionId);
  } catch (err) {
    console.error('[dispatch] Failed to create worktree:', err);
    return null;
  }

  // Re-check: task may have been claimed by a concurrent caller during the async setup.
  const taskStatus = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string } | undefined;
  if (taskStatus?.status !== 'pending') {
    if (isGit) void removeWorktree(projectObj, worktreePath);
    else void removeWorkDir(worktreePath);
    return null;
  }

  db.prepare(
    'INSERT INTO sessions (id, user_id, agent_id, project_id, work_task_id, provider, branch, worktree_path, workspace_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(sessionId, userId, agent.id, project.id, taskId, agent.provider, branch, worktreePath, workspaceMode, 'idle', now);

  assignTaskToSession(taskId, agent.id, now);

  if (!isGit) void seedWorkDirFromWorkspace(projectWorkspaceDir(project.id), worktreePath).catch(() => {});
  void copyTaskFilesToWorkDir(taskFilesDir(taskId), worktreePath);

  void runAgent(
    {
      id: sessionId, agentId: agent.id, projectId: project.id, workTaskId: taskId,
      provider: agent.provider as AgentProvider, branch, worktreePath, workspaceMode, status: 'idle', createdAt: now,
    },
    taskPrompt, userId, agent.id,
  );

  return { sessionId };
}
