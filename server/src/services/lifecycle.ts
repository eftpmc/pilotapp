import { db } from '../db';

export type SessionStatus = 'idle' | 'running' | 'waiting' | 'done' | 'error' | 'merged';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export function setSessionStatus(sessionId: string, status: SessionStatus): void {
  db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, sessionId);
}

export function markSessionRunning(sessionId: string): void {
  setSessionStatus(sessionId, 'running');
}

export function markSessionFinished(sessionId: string, exitCode: number): void {
  const status = exitCode === 0 ? 'done' : 'error';
  setSessionStatus(sessionId, status);
  setLinkedTaskFinished(sessionId, exitCode);
}

export function markSessionWaiting(sessionId: string): void {
  setSessionStatus(sessionId, 'waiting');
}

export function markSessionMerged(sessionId: string): void {
  setSessionStatus(sessionId, 'merged');
}

export function assignTaskToSession(taskId: string, agentId: string, startedAt = new Date().toISOString()): void {
  db.prepare('UPDATE tasks SET status = ?, agent_id = ?, started_at = ? WHERE id = ?')
    .run('running', agentId, startedAt, taskId);
}

export function setLinkedTaskFinished(sessionId: string, exitCode: number, completedAt = new Date().toISOString()): void {
  const session = db.prepare('SELECT work_task_id FROM sessions WHERE id = ?').get(sessionId) as
    | { work_task_id: string | null }
    | undefined;
  if (!session?.work_task_id) return;

  // Don't overwrite if already explicitly set (e.g. via skip_task MCP tool)
  db.prepare("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND status = 'running'").run(
    exitCode === 0 ? 'done' : 'failed',
    completedAt,
    session.work_task_id
  );
}

export function markTaskDone(taskId: string, completedAt = new Date().toISOString()): void {
  db.prepare("UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?").run(completedAt, taskId);
}

export function resetErroredSessionForRetry(sessionId: string): void {
  setSessionStatus(sessionId, 'idle');
  db.prepare(`
    UPDATE tasks
    SET status = 'running', completed_at = NULL
    WHERE id = (SELECT work_task_id FROM sessions WHERE id = ?)
  `).run(sessionId);
}

export function resetTaskAfterSessionDiscard(taskId: string): void {
  db.prepare(
    "UPDATE tasks SET status = 'pending', agent_id = NULL, started_at = NULL, completed_at = NULL WHERE id = ?"
  ).run(taskId);
}

export function failInterruptedWork(): void {
  db.prepare("UPDATE sessions SET status = 'error' WHERE status IN ('running', 'idle', 'waiting')").run();
  // Reset interrupted running tasks back to pending so they are auto-assigned on next boot.
  // Skip-task / complete-task set completed_at before exiting, so those are already 'done'/'failed'.
  db.prepare(`
    UPDATE tasks SET status = 'pending', agent_id = NULL, started_at = NULL, completed_at = NULL
    WHERE status = 'running'
  `).run();
}
