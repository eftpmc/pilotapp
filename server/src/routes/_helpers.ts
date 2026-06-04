import { AgentProvider } from '../types';

export interface SessionRow {
  id: string; user_id: string; agent_id: string; project_id: string;
  work_task_id: string | null; spec_id: string | null; provider: string; branch: string;
  worktree_path: string; status: string; created_at: string;
  journal: string | null; parent_session_id: string | null;
  review_verdict: string | null; runner_session_id: string | null;
  diff_snapshot: string | null;
  input_tokens: number | null; output_tokens: number | null;
  cache_read_tokens: number | null; total_cost_usd: number | null;
}

export function toSession(r: SessionRow) {
  return {
    id: r.id, agentId: r.agent_id, projectId: r.project_id,
    workTaskId:       r.work_task_id       ?? undefined,
    specId:           r.spec_id            ?? undefined,
    parentSessionId:  r.parent_session_id  ?? undefined,
    reviewVerdict:    r.review_verdict     ?? undefined,
    journal:          r.journal            ?? undefined,
    runnerSessionId:  r.runner_session_id  ?? undefined,
    inputTokens:      r.input_tokens       ?? undefined,
    outputTokens:     r.output_tokens      ?? undefined,
    cacheReadTokens:  r.cache_read_tokens  ?? undefined,
    totalCostUsd:     r.total_cost_usd     ?? undefined,
    provider: r.provider as AgentProvider,
    branch: r.branch, worktreePath: r.worktree_path, status: r.status, createdAt: r.created_at,
  };
}
