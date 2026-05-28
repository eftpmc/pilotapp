// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentProvider = 'claude' | 'codex';
export type ProjectRole   = 'any' | 'claude' | 'codex';
export type TaskStatus    = 'pending' | 'running' | 'done' | 'failed';
export type SessionStatus = 'idle' | 'running' | 'done' | 'error';

export interface Project {
  id: string; name: string; repoPath: string; role: ProjectRole; createdAt: string;
}
export interface Agent {
  id: string; name: string; provider: AgentProvider; createdAt: string;
}
export interface Task {
  id: string; projectId: string; title: string; prompt: string;
  baseBranch: string; status: TaskStatus; agentId?: string; sessionId?: string;
  createdAt: string; startedAt?: string; completedAt?: string;
}
export interface Session {
  id: string; agentId: string; projectId: string; workTaskId?: string;
  provider: AgentProvider; branch: string; worktreePath: string;
  status: SessionStatus; createdAt: string;
}
export interface CredentialStatus { claude: boolean; codex: boolean }

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const auth = {
  login:    (email: string, password: string) =>
    req<{ token: string }>('/auth/login',    { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    req<{ token: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = {
  list:   () => req<Project[]>('/projects'),
  create: (body: { name: string; role?: ProjectRole; githubCloneUrl?: string; githubToken?: string }) =>
    req<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const agents = {
  list:   () => req<Agent[]>('/agents'),
  create: (body: { name: string; provider: AgentProvider }) =>
    req<Agent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) => req<void>(`/agents/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks = {
  list:   (params?: { projectId?: string; status?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return req<Task[]>(`/tasks${qs ? `?${qs}` : ''}`);
  },
  create: (body: { projectId: string; title: string; prompt: string; baseBranch?: string }) =>
    req<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; prompt?: string; baseBranch?: string }) =>
    req<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => req<void>(`/tasks/${id}`, { method: 'DELETE' }),
  assign: (taskId: string, agentId: string) =>
    req<{ task: Task; session: Session }>(`/tasks/${taskId}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
  runQueue: () => req<{ dispatched: { task: Task; session: Session }[] }>('/tasks/queue/run', { method: 'POST', body: '{}' }),
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const sessions = {
  list:   (params?: { projectId?: string; agentId?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return req<Session[]>(`/sessions${qs ? `?${qs}` : ''}`);
  },
  create: (body: { agentId: string; projectId: string; baseBranch?: string }) =>
    req<Session>('/sessions', { method: 'POST', body: JSON.stringify(body) }),
  diff:   (id: string) => req<{ diff: string }>(`/sessions/${id}/diff`),
  merge:  (id: string) => req<{ merged: boolean }>(`/sessions/${id}/merge`, { method: 'POST' }),
  run:    (id: string, prompt?: string) =>
    req<{ started: boolean }>(`/sessions/${id}/run`, { method: 'POST', body: JSON.stringify({ prompt }) }),
  delete: (id: string) => req<void>(`/sessions/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settings = {
  credentials:       () => req<CredentialStatus>('/settings/credentials'),
  updateCredentials: (body: { claude?: string; codex?: string }) =>
    req<CredentialStatus>('/settings/credentials', { method: 'PUT', body: JSON.stringify(body) }),
};

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export const github = {
  repos: (token: string) =>
    req<{ name: string; clone_url: string; full_name: string }[]>('/github/repos', {
      headers: { 'X-GitHub-Token': token },
    }),
};
