export type AgentProvider = 'claude' | 'codex';
export type ProjectRole = 'any' | 'claude' | 'codex';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  role: ProjectRole;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  provider: AgentProvider;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  baseBranch: string;
  status: TaskStatus;
  agentId?: string;
  sessionId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentSession {
  id: string;
  agentId: string;
  projectId: string;
  workTaskId?: string;
  provider: AgentProvider;
  branch: string;
  worktreePath: string;
  status: 'running' | 'idle' | 'done' | 'error';
  createdAt: string;
}

export interface AuthPayload {
  userId: string;
}
