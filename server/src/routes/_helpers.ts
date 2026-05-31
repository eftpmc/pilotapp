import { AgentProvider } from '../types';

export interface SessionRow {
  id: string; user_id: string; agent_id: string; project_id: string;
  work_task_id: string | null; spec_id: string | null; provider: string; branch: string;
  worktree_path: string; status: string; created_at: string;
  journal: string | null; parent_session_id: string | null;
  review_verdict: string | null; shift_id: string | null;
}

export function toSession(r: SessionRow) {
  return {
    id: r.id, agentId: r.agent_id, projectId: r.project_id,
    workTaskId:      r.work_task_id       ?? undefined,
    specId:          r.spec_id            ?? undefined,
    parentSessionId: r.parent_session_id  ?? undefined,
    reviewVerdict:   r.review_verdict     ?? undefined,
    shiftId:         r.shift_id           ?? undefined,
    journal:         r.journal            ?? undefined,
    provider: r.provider as AgentProvider,
    branch: r.branch, worktreePath: r.worktree_path, status: r.status, createdAt: r.created_at,
  };
}
