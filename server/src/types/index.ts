export type AgentProvider = 'claude' | 'codex';
export type ProjectRole = 'any' | 'claude' | 'codex';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Connection {
  id: string;
  name: string;
  type: 'claude' | 'codex';
  model?: string;
  createdAt: string;
}

export type WorkspaceMode = 'git' | 'workspace';

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  role: ProjectRole;
  workspaceMode?: WorkspaceMode;
  remoteUrl?: string;
  localPath?: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  provider: AgentProvider;
  connectionId?: string;
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
  specId?: string;
  provider: AgentProvider;
  branch: string;
  worktreePath: string;
  status: 'running' | 'idle' | 'done' | 'error';
  createdAt: string;
}

export interface Spec {
  id: string;
  projectId: string;
  title: string;
  brief: string;
  content: string;
  sessionId?: string;
  status: 'planning' | 'draft';
  createdAt: string;
  updatedAt: string;
}

export interface AuthPayload {
  userId: string;
  tokenVersion?: number;
  deviceId?: string;
}
