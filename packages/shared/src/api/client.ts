// ---------------------------------------------------------------------------
// Base URL configuration (for use in Electron / non-web contexts)
// ---------------------------------------------------------------------------

let _baseUrl = ''
export function setBaseUrl(url: string) { _baseUrl = url.replace(/\/$/, '') }
export function getBaseUrl(): string { return _baseUrl }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentProvider  = 'claude' | 'codex';
export type ProjectRole    = 'any' | 'claude' | 'codex';
export type TaskStatus     = 'pending' | 'running' | 'done' | 'failed';
export type SessionStatus  = 'idle' | 'running' | 'waiting' | 'done' | 'error' | 'merged';
export type AgentRole      = 'worker' | 'lead';
export type TaskSize       = 'xs' | 's' | 'm' | 'l' | 'xl';
export type KnowledgeScope = 'company' | 'department' | 'agent';

export interface Connection {
  id: string; name: string; type: AgentProvider; model?: string;
  hasKey: boolean; quotaStatus: 'ok' | 'exceeded';
  createdAt: string;
}
export type WorkspaceMode = 'git' | 'workspace';

export interface Project {
  id: string; name: string; repoPath: string; role: ProjectRole;
  workspaceMode: WorkspaceMode;
  remoteUrl?: string; localPath?: string; createdAt: string;
}
export interface Agent {
  id: string; name: string; provider: AgentProvider;
  role: AgentRole; connectionId?: string; personality?: string;
  departmentId?: string; avatarSeed?: string; createdAt: string;
}
export interface Task {
  id: string; projectId: string; title: string; prompt: string;
  status: TaskStatus; priority: number;
  size: TaskSize; attachedFiles: string[]; agentId?: string;
  parentTaskId?: string; dependsOn?: string[];
  createdAt: string; startedAt?: string; completedAt?: string;
}
export interface Session {
  id: string; agentId: string; projectId: string; workTaskId?: string; specId?: string;
  parentSessionId?: string; reviewVerdict?: string; journal?: string;
  runnerSessionId?: string;
  inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; totalCostUsd?: number;
  provider: AgentProvider; workspaceMode: WorkspaceMode; workDir: string;
  /** @deprecated internal — use workDir */
  branch?: string;
  status: SessionStatus; createdAt: string;
}

export interface Turn {
  id: string; sessionId: string; turnNumber: number; prompt: string;
  status: 'running' | 'done' | 'error';
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
  data: { employeeName?: string; taskTitle?: string; projectName?: string };
  createdAt: string;
}

export interface Tool {
  id: string; name: string; description: string;
  mcpConfig: Record<string, unknown>;
  createdAt: string;
}

export interface UserProfile {
  id: string; email: string; name: string; role: 'admin' | 'user'; createdAt: string;
  token?: string;
}

export interface UserDevice {
  id: string; name: string; deviceType: 'mobile' | 'desktop' | 'web';
  createdAt: string; lastSeenAt: string | null;
}

export interface ServerInfo {
  version: string; nodeVersion: string; uptimeSeconds: number;
  dataDir: string; dbSizeBytes: number; userCount: number;
}

export interface ServerSettings {
  allowRegistration: boolean;
}

export interface AdminUser {
  id: string; email: string; name: string; role: 'admin' | 'user';
  disabled: boolean; createdAt: string;
}

export interface CharVariantSetting {
  variant: number;
  excluded: boolean;
  weight: number;
}

export interface AdminCharacterSettings {
  settings: Record<string, CharVariantSetting[]>;
  beardChance: number;
}

export interface CharacterSettings {
  exclusions: Record<string, number[]>;
  weights: Record<string, Record<number, number>>;
  beardChance: number;
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
  const res = await fetch(`${_baseUrl}${path}`, {
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
  const res = await fetch(`${_baseUrl}${path}`, {
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
    authReq<{ token: string; role: string }>('/auth/login',    { email, password }),
  register: (email: string, password: string) =>
    authReq<{ token: string; role: string }>('/auth/register', { email, password }),
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = {
  list:   () => req<Project[]>('/projects'),
  create: (body: { name: string; githubCloneUrl?: string; githubToken?: string; localPath?: string; initGit?: boolean }) =>
    req<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; remoteUrl?: string; githubToken?: string }) =>
    req<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  push:   (id: string) => req<{ pushed: boolean }>(`/projects/${id}/push`, { method: 'POST' }),
  files:  (id: string) => req<{ files: string[] }>(`/projects/${id}/files`),
  file:   (id: string, p: string) => req<{ content: string }>(`/projects/${id}/file?path=${encodeURIComponent(p)}`),
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
  list:   () => req<Agent[]>('/agents'),
  create: (body: { name: string; connectionId: string; personality?: string; role?: AgentRole; departmentId?: string; avatarSeed?: string }) =>
    req<Agent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; connectionId?: string; personality?: string; role?: AgentRole; departmentId?: string | null; avatarSeed?: string | null }) =>
    req<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => req<void>(`/agents/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks = {
  get:    (id: string) => req<Task>(`/tasks/${id}`),
  list:   (params?: { projectId?: string; status?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return req<Task[]>(`/tasks${qs ? `?${qs}` : ''}`);
  },
  create: (body: { projectId: string; title: string; prompt: string; size?: TaskSize }) =>
    req<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; prompt?: string; priority?: number; size?: TaskSize }) =>
    req<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  uploadFiles: (id: string, files: File[]) => {
    const token = localStorage.getItem('token');
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    return fetch(`${_baseUrl}/tasks/${id}/files`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(r => r.json() as Promise<{ files: string[] }>);
  },
  removeFile: (id: string, filename: string) => req<{ files: string[] }>(`/tasks/${id}/files/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
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
  diff:          (id: string) => req<{ diff: string; unavailableReason?: string }>(`/sessions/${id}/diff`),
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
// Me (current user)
// ---------------------------------------------------------------------------

export const me = {
  profile:       () => req<UserProfile>('/me'),
  update:        (body: { name?: string; email?: string; currentPassword?: string; newPassword?: string }) =>
    req<UserProfile>('/me', { method: 'PATCH', body: JSON.stringify(body) }),
  devices:       () => req<UserDevice[]>('/me/devices'),
  revokeDevice:  (id: string) => req<void>(`/me/devices/${id}`, { method: 'DELETE' }),
  revokeAll:     () => req<void>('/me/devices', { method: 'DELETE' }),
  pairToken:     () => req<{ token: string; expiresAt: string }>('/me/pair-token', { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const admin = {
  serverInfo:     () => req<ServerInfo>('/admin/server-info'),
  settings:       () => req<ServerSettings>('/admin/settings'),
  updateSettings: (body: Partial<ServerSettings>) =>
    req<ServerSettings>('/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  users:          () => req<AdminUser[]>('/admin/users'),
  createUser:     (body: { email: string; password: string; name?: string; role?: 'user' | 'admin' }) =>
    req<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser:     (id: string, body: { name?: string; email?: string; role?: 'user' | 'admin'; disabled?: boolean }) =>
    req<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetPassword:  (id: string) =>
    req<{ password: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }),
  deleteUser:     (id: string) => req<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  characters:     () => req<AdminCharacterSettings>('/admin/characters'),
  updateVariant:  (part: string, variant: number, body: { excluded?: boolean; weight?: number }) =>
    req<CharVariantSetting>(`/admin/characters/${part}/${variant}`, { method: 'PATCH', body: JSON.stringify(body) }),
  updateBeardChance: (chance: number) =>
    req<{ beardChance: number }>('/admin/characters/beard-chance', { method: 'PATCH', body: JSON.stringify({ chance }) }),
};

export const characters = {
  settings: () => req<CharacterSettings>('/settings/characters'),
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
