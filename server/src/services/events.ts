import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { broadcastGlobal } from './broadcast';

interface EventCtx {
  sessionId?: string;
  taskId?:    string;
  projectId?: string;
  agentId?:   string;
  extra?:     Record<string, unknown>;
}

export function writeEvent(userId: string, type: string, ctx: EventCtx = {}): void {
  try {
    const agent   = ctx.agentId   ? (db.prepare('SELECT name FROM agents WHERE id = ?').get(ctx.agentId)   as { name: string }  | undefined) : undefined;
    const project = ctx.projectId ? (db.prepare('SELECT name FROM projects WHERE id = ?').get(ctx.projectId) as { name: string } | undefined) : undefined;
    const task    = ctx.taskId    ? (db.prepare('SELECT title FROM tasks WHERE id = ?').get(ctx.taskId)     as { title: string } | undefined) : undefined;

    db.prepare(
      'INSERT INTO events (id, user_id, type, session_id, task_id, project_id, agent_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      uuid(), userId, type,
      ctx.sessionId ?? null,
      ctx.taskId    ?? null,
      ctx.projectId ?? null,
      ctx.agentId   ?? null,
      JSON.stringify({
        employeeName: agent?.name,
        taskTitle:    task?.title,
        projectName:  project?.name,
        ...ctx.extra,
      }),
      new Date().toISOString()
    );
    broadcastGlobal('global-event', { eventType: type });
  } catch { /* non-critical — never break the main flow */ }
}
