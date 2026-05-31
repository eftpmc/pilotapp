import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

interface Row {
  id: string; user_id: string; type: string;
  session_id: string | null; task_id: string | null;
  project_id: string | null; agent_id: string | null;
  data: string; created_at: string;
}

function toEvent(row: Row) {
  return {
    id:        row.id,
    type:      row.type,
    sessionId: row.session_id ?? undefined,
    taskId:    row.task_id    ?? undefined,
    projectId: row.project_id ?? undefined,
    agentId:   row.agent_id   ?? undefined,
    data:      JSON.parse(row.data ?? '{}'),
    createdAt: row.created_at,
  };
}

router.get('/', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const rows = db.prepare(
    'SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId(req), limit) as Row[];
  res.json(rows.map(toEvent));
});

export default router;
