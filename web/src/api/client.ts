// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentProvider  = 'claude' | 'codex';
export type ProjectRole    = 'any' | 'claude' | 'codex';
export type TaskStatus     = 'pending' | 'running' | 'done' | 'failed';
export type SessionStatus  = 'idle' | 'running' | 'done' | 'error' | 'merged';
export type AgentRole      = 'any' | 'worker' | 'reviewer' | 'planner' | 'lead';
export type TaskSize       = 'xs' | 's' | 'm' | 'l' | 'xl';
export type KnowledgeScope = 'company' | 'department' | 'agent';

export interface Connection {
  id: string; name: string; type: AgentProvider; model?: string;
  hasKey: boolean; quotaStatus: 'ok' | 'exceeded';
  createdAt: string;
}
export interface Project {
  id: string; name: string; repoPath: string; role: ProjectRole;
  remoteUrl?: string; localPath?: string; createdAt: string;
}
export interface Agent {
  id: string; name: string; provider: AgentProvider;
  role: AgentRole; connectionId?: string; personality?: string;
  departmentId?: string; createdAt: string;
}
export interface Task {
  id: string; projectId: string; title: string; prompt: string;
  baseBranch: string; status: TaskStatus; priority: number;
  size: TaskSize; agentId?: string; sessionId?: string; shiftId?: string;
  leadSessionId?: string;
  createdAt: string; startedAt?: string; completedAt?: string;
}
export interface Session {
  id: string; agentId: string; projectId: string; workTaskId?: string; specId?: string;
  parentSessionId?: string; reviewVerdict?: string; shiftId?: string; journal?: string;
  runnerSessionId?: string;
  provider: AgentProvider; branch: string; worktreePath: string;
  status: SessionStatus; createdAt: string;
}

export interface Turn {
  id: string; sessionId: string; turnNumber: number; prompt: string;
  status: 'running' | 'done' | 'error';
  createdAt: string; completedAt?: string;
}

export interface Shift {
  id: string; agentId: string; status: string;
  taskCount: number; doneCount: number; report?: string;
  createdAt: string; completedAt?: string;
}
export type SpecStatus = 'planning' | 'draft'
export interface Spec {
  id: string; projectId: string; title: string; brief: string;
  content: string; sessionId?: string; status: SpecStatus;
  createdAt: string; updatedAt: string;
}
export interface CredentialStatus { claude: boolean; codex: boolean }

export interface KnowledgeDoc {
  id: string; scope: KnowledgeScope; scopeId?: string;
  title: string; content: string;
  createdAt: string; updatedAt: string;
}

export interface Department {
  id: string; name: string; color: string; createdAt: string;
}

export interface CompanyEvent {
  id: string; type: string;
  sessionId?: string; taskId?: string; projectId?: string; agentId?: string;
  data: { agentName?: string; taskTitle?: string; projectName?: string };
  createdAt: string;
}

export interface Tool {
  id: string; name: string; description: string;
  mcpConfig: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export const departments = {
  list:   () => req<Department[]>('/departments'),
  create: (body: { name: string; color?: string }) =>
    req<Department>('/departments', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; color?: string }) =>
    req<Department>(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => req<void>(`/departments/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const events = {
  list: (limit = 50) => req<CompanyEvent[]>(`/events?limit=${limit}`),
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const tools = {
  list:             () => req<Tool[]>('/tools'),
  assignments:      () => req<{ agentId: string; toolId: string }[]>('/tools/assignments'),
  deptAssignments:  () => req<{ departmentId: string; toolId: string }[]>('/tools/dept-assignments'),
  create:           (body: { name: string; description?: string; mcpConfig: Record<string, unknown> }) =>
    req<Tool>('/tools', { method: 'POST', body: JSON.stringify(body) }),
  update:           (id: string, body: { name?: string; description?: string; mcpConfig?: Record<string, unknown> }) =>
    req<Tool>(`/tools/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete:           (id: string) => req<void>(`/tools/${id}`, { method: 'DELETE' }),
  assign:           (toolId: string, agentId: string) => req<void>(`/tools/agent/${agentId}/${toolId}`, { method: 'POST' }),
  unassign:         (toolId: string, agentId: string) => req<void>(`/tools/agent/${agentId}/${toolId}`, { method: 'DELETE' }),
  assignDept:       (toolId: string, deptId: string) => req<void>(`/tools/department/${deptId}/${toolId}`, { method: 'POST' }),
  unassignDept:     (toolId: string, deptId: string) => req<void>(`/tools/department/${deptId}/${toolId}`, { method: 'DELETE' }),
};

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

async function authReq<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const auth = {
  login:    (email: string, password: string) =>
    authReq<{ token: string }>('/auth/login',    { email, password }),
  register: (email: string, password: string) =>
    authReq<{ token: string }>('/auth/register', { email, password }),
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = {
  list:   () => req<Project[]>('/projects'),
  create: (body: { name: string; githubCloneUrl?: string; githubToken?: string; localPath?: string }) =>
    req<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; remoteUrl?: string; githubToken?: string }) =>
    req<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  push:   (id: string) => req<{ pushed: boolean }>(`/projects/${id}/push`, { method: 'POST' }),
  files:  (id: string) => req<{ files: string[] }>(`/projects/${id}/files`),
  file:   (id: string, path: string) => req<{ content: string }>(`/projects/${id}/file?path=${encodeURIComponent(path)}`),
  delete: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Connections (API keys / reasoning providers)
// ---------------------------------------------------------------------------

export const connections = {
  list:       () => req<Connection[]>('/brains'),
  create:     (body: { name: string; type: AgentProvider; apiKey?: string; model?: string }) =>
    req<Connection>('/brains', { method: 'POST', body: JSON.stringify(body) }),
  update:     (id: string, body: { name?: string; apiKey?: string; model?: string }) =>
    req<Connection>(`/brains/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  clearQuota: (id: string) => req<Connection>(`/brains/${id}/clear-quota`, { method: 'POST' }),
  delete:     (id: string) => req<void>(`/brains/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const agents = {
  list:   () => req<Agent[]>('/employees'),
  create: (body: { name: string; connectionId: string; personality?: string; role?: AgentRole; departmentId?: string }) =>
    req<Agent>('/employees', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; personality?: string; role?: AgentRole; departmentId?: string | null }) =>
    req<Agent>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => req<void>(`/employees/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks = {
  list:   (params?: { projectId?: string; status?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return req<Task[]>(`/tasks${qs ? `?${qs}` : ''}`);
  },
  create: (body: { projectId: string; title: string; prompt: string; baseBranch?: string; size?: TaskSize }) =>
    req<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; prompt?: string; baseBranch?: string; priority?: number; size?: TaskSize }) =>
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
  get:    (id: string) => req<Session>(`/sessions/${id}`),
  create: (body: { agentId: string; projectId: string; baseBranch?: string }) =>
    req<Session>('/sessions', { method: 'POST', body: JSON.stringify(body) }),
  diff:          (id: string) => req<{ diff: string }>(`/sessions/${id}/diff`),
  merge:         (id: string) => req<{ merged: boolean }>(`/sessions/${id}/merge`, { method: 'POST' }),
  stop:          (id: string) => req<{ stopped: boolean }>(`/sessions/${id}/stop`, { method: 'POST' }),
  run:           (id: string, prompt?: string) =>
    req<{ started: boolean }>(`/sessions/${id}/run`, { method: 'POST', body: JSON.stringify({ prompt }) }),
  requestReview: (id: string, agentId: string) =>
    req<Session>(`/sessions/${id}/request-review`, { method: 'POST', body: JSON.stringify({ agentId }) }),
  delete:        (id: string) => req<void>(`/sessions/${id}`, { method: 'DELETE' }),
  turns:         (id: string) => req<Turn[]>(`/sessions/${id}/turns`),
  addTurn:       (id: string, prompt: string) =>
    req<Turn>(`/sessions/${id}/turns`, { method: 'POST', body: JSON.stringify({ prompt }) }),
};

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export const shifts = {
  list:   () => req<Shift[]>('/shifts'),
  get:    (id: string) => req<Shift>(`/shifts/${id}`),
  create: (body: { agentId: string; taskIds: string[] }) =>
    req<{ shift: Shift; session: Session }>('/shifts', { method: 'POST', body: JSON.stringify(body) }),
  cancel: (id: string) => req<void>(`/shifts/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

export const specs = {
  list:    (projectId: string) => req<Spec[]>(`/specs?projectId=${projectId}`),
  create:  (body: { projectId: string; title: string; brief?: string; agentId?: string }) =>
    req<Spec>('/specs', { method: 'POST', body: JSON.stringify(body) }),
  update:  (id: string, body: { title?: string; content?: string }) =>
    req<Spec>(`/specs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete:  (id: string) => req<void>(`/specs/${id}`, { method: 'DELETE' }),
  execute: (id: string) => req<{ taskId: string; projectId: string }>(`/specs/${id}/execute`, { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export const knowledge = {
  list:   (params?: { scope?: KnowledgeScope; scopeId?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return req<KnowledgeDoc[]>(`/knowledge${qs ? `?${qs}` : ''}`);
  },
  create: (body: { scope: KnowledgeScope; scopeId?: string; title: string; content?: string }) =>
    req<KnowledgeDoc>('/knowledge', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; content?: string }) =>
    req<KnowledgeDoc>(`/knowledge/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => req<void>(`/knowledge/${id}`, { method: 'DELETE' }),
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
