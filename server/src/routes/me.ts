import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { authMiddleware, userId, signToken } from '../middleware/auth';
import { createPairToken } from './auth';

const router = Router();
router.use(authMiddleware);

// GET /me — current user profile
router.get('/', (req: Request, res: Response) => {
  const uid  = userId(req);
  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(uid) as
    | { id: string; email: string; name: string | null; role: string; created_at: string } | undefined;
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ id: user.id, email: user.email, name: user.name ?? '', role: user.role, createdAt: user.created_at });
});

// PATCH /me — update name, email, or password
const UpdateSchema = z.object({
  name:            z.string().max(100).optional(),
  email:           z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword:     z.string().min(8).optional(),
});

router.patch('/', async (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const uid  = userId(req);
  const user = db.prepare('SELECT id, email, password_hash, token_version FROM users WHERE id = ?').get(uid) as
    | { id: string; email: string; password_hash: string; token_version: number } | undefined;
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }

  // Password change requires current password verification
  if (parsed.data.newPassword) {
    if (!parsed.data.currentPassword) {
      res.status(400).json({ error: 'Current password required to set a new password' });
      return;
    }
    if (!(await bcrypt.compare(parsed.data.currentPassword, user.password_hash))) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
  }

  // Check email uniqueness if changing
  if (parsed.data.email && parsed.data.email !== user.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(parsed.data.email, uid);
    if (conflict) { res.status(409).json({ error: 'Email already in use' }); return; }
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (parsed.data.name !== undefined) { updates.push('name = ?'); params.push(parsed.data.name || null); }
  if (parsed.data.email)              { updates.push('email = ?'); params.push(parsed.data.email); }
  if (parsed.data.newPassword) {
    const hash = await bcrypt.hash(parsed.data.newPassword, 12);
    updates.push('password_hash = ?');
    params.push(hash);
    // Bump token_version to invalidate all existing sessions
    updates.push('token_version = token_version + 1');
  }

  if (updates.length > 0) {
    params.push(uid);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const updated = db.prepare('SELECT id, email, name, role, token_version, created_at FROM users WHERE id = ?').get(uid) as
    { id: string; email: string; name: string | null; role: string; token_version: number; created_at: string };
  res.json({
    id: updated.id, email: updated.email, name: updated.name ?? '', role: updated.role, createdAt: updated.created_at,
    // If password changed, issue a new token for this session (others are invalidated)
    ...(parsed.data.newPassword ? { token: signToken(uid, updated.token_version) } : {}),
  });
});

// GET /me/devices — list registered devices
router.get('/devices', (req: Request, res: Response) => {
  const uid     = userId(req);
  const devices = db.prepare(
    'SELECT id, name, device_type, created_at, last_seen_at FROM user_devices WHERE user_id = ? ORDER BY created_at DESC'
  ).all(uid) as { id: string; name: string; device_type: string; created_at: string; last_seen_at: string | null }[];
  res.json(devices.map(d => ({
    id: d.id, name: d.name, deviceType: d.device_type,
    createdAt: d.created_at, lastSeenAt: d.last_seen_at,
  })));
});

// DELETE /me/devices/:id — revoke a specific device
router.delete('/devices/:id', (req: Request, res: Response) => {
  const uid = userId(req);
  const { changes } = db.prepare('DELETE FROM user_devices WHERE id = ? AND user_id = ?').run(req.params.id, uid);
  if (changes === 0) { res.status(404).json({ error: 'Device not found' }); return; }
  res.status(204).end();
});

// DELETE /me/devices — revoke all sessions (bump token_version)
router.delete('/devices', (req: Request, res: Response) => {
  const uid = userId(req);
  db.prepare('DELETE FROM user_devices WHERE user_id = ?').run(uid);
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(uid);
  res.status(204).end();
});

// POST /me/pair-token — generate a one-time QR pairing token
router.post('/pair-token', (req: Request, res: Response) => {
  const uid    = userId(req);
  const result = createPairToken(uid);
  res.json(result);
});

export default router;
