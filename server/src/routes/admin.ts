import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { authMiddleware, userId, isAdmin } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Require admin role for all /admin routes
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!isAdmin(userId(req))) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
});

// GET /admin/server-info
router.get('/server-info', (req: Request, res: Response) => {
  const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
  const dbPath   = path.join(DATA_DIR, 'pilot.db');

  let dbSizeBytes = 0;
  try { dbSizeBytes = fs.statSync(dbPath).size; } catch { /* no db yet */ }

  let packageVersion = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    packageVersion = pkg.version ?? 'unknown';
  } catch { /* ignore */ }

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;

  res.json({
    version:      packageVersion,
    nodeVersion:  process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    dataDir:      DATA_DIR,
    dbSizeBytes,
    userCount,
  });
});

// GET /admin/settings
router.get('/settings', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT key, value FROM server_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json({
    allowRegistration: settings['allow_registration'] === 'true',
  });
});

// PATCH /admin/settings
const SettingsSchema = z.object({
  allowRegistration: z.boolean().optional(),
});

router.patch('/settings', (req: Request, res: Response) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const upsert = db.prepare(
    'INSERT INTO server_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  if (parsed.data.allowRegistration !== undefined) {
    upsert.run('allow_registration', parsed.data.allowRegistration ? 'true' : 'false');
  }

  const rows = db.prepare('SELECT key, value FROM server_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json({ allowRegistration: settings['allow_registration'] === 'true' });
});

// ── Users ──────────────────────────────────────────────────────────────────

type UserRow = { id: string; email: string; name: string | null; role: string; disabled: number; created_at: string };

function formatUser(u: UserRow) {
  return { id: u.id, email: u.email, name: u.name ?? '', role: u.role, disabled: !!u.disabled, createdAt: u.created_at };
}

// GET /admin/users
router.get('/users', (req: Request, res: Response) => {
  const users = db.prepare('SELECT id, email, name, role, disabled, created_at FROM users ORDER BY created_at ASC').all() as UserRow[];
  res.json(users.map(formatUser));
});

// POST /admin/users — create a user directly (bypasses registration setting)
const CreateUserSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().max(100).optional(),
  role:     z.enum(['user', 'admin']).default('user'),
});

router.post('/users', async (req: Request, res: Response) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email);
  if (existing) { res.status(409).json({ error: 'Email already registered' }); return; }

  const hash = await bcrypt.hash(parsed.data.password, 12);
  const id   = uuid();
  db.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, parsed.data.email, hash, parsed.data.name ?? null, parsed.data.role, new Date().toISOString()
  );
  const user = db.prepare('SELECT id, email, name, role, disabled, created_at FROM users WHERE id = ?').get(id) as UserRow;
  res.status(201).json(formatUser(user));
});

// PATCH /admin/users/:id
const UpdateUserSchema = z.object({
  name:     z.string().max(100).optional(),
  email:    z.string().email().optional(),
  role:     z.enum(['user', 'admin']).optional(),
  disabled: z.boolean().optional(),
});

router.patch('/users/:id', (req: Request, res: Response) => {
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id) as
    { id: string; role: string } | undefined;
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }

  // Prevent admin from demoting or disabling themselves
  if (req.params.id === userId(req) && (parsed.data.role === 'user' || parsed.data.disabled)) {
    res.status(400).json({ error: 'Cannot demote or disable your own account' });
    return;
  }

  // Prevent removing the last admin
  if (parsed.data.role === 'user' && target.role === 'admin') {
    const adminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }).c;
    if (adminCount <= 1) { res.status(400).json({ error: 'Cannot demote the last admin' }); return; }
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  if (parsed.data.name     !== undefined) { updates.push('name = ?');     params.push(parsed.data.name || null); }
  if (parsed.data.email    !== undefined) { updates.push('email = ?');    params.push(parsed.data.email); }
  if (parsed.data.role     !== undefined) { updates.push('role = ?');     params.push(parsed.data.role); }
  if (parsed.data.disabled !== undefined) { updates.push('disabled = ?'); params.push(parsed.data.disabled ? 1 : 0); }

  if (updates.length > 0) {
    params.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    // Bump token_version if disabling — kicks them out immediately
    if (parsed.data.disabled) {
      db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(req.params.id);
    }
  }

  const user = db.prepare('SELECT id, email, name, role, disabled, created_at FROM users WHERE id = ?').get(req.params.id) as UserRow;
  res.json(formatUser(user));
});

// POST /admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const chars    = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const password = Array.from({ length: 14 }, (_, i) => chars[Math.floor((Date.now() * (i + 3)) % chars.length)]).join('');
  const hash     = await bcrypt.hash(password, 12);

  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(hash, req.params.id);
  res.json({ password });
});

// DELETE /admin/users/:id
router.delete('/users/:id', (req: Request, res: Response) => {
  if (req.params.id === userId(req)) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id) as { role: string } | undefined;
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }

  if (target.role === 'admin') {
    const adminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }).c;
    if (adminCount <= 1) { res.status(400).json({ error: 'Cannot delete the last admin' }); return; }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// ── Characters ────────────────────────────────────────────────────────────

type CharSettingRow = { part: string; variant: number; excluded: number; weight: number };

// GET /admin/characters
router.get('/characters', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT part, variant, excluded, weight FROM character_settings').all() as CharSettingRow[];
  const map: Record<string, CharSettingRow[]> = {};
  for (const r of rows) {
    if (!map[r.part]) map[r.part] = [];
    map[r.part].push(r);
  }
  // Also pull beard overall chance from server_settings
  const bChanceRow = db.prepare("SELECT value FROM server_settings WHERE key = 'character.beard_chance'").get() as { value: string } | undefined;
  res.json({ settings: map, beardChance: bChanceRow ? parseInt(bChanceRow.value, 10) : 10 });
});

// PATCH /admin/characters/beard-chance  — must be before /:part/:variant wildcard
router.patch('/characters/beard-chance', (req: Request, res: Response) => {
  const { chance } = req.body;
  if (typeof chance !== 'number' || chance < 0 || chance > 100) {
    res.status(400).json({ error: 'chance must be 0–100' }); return;
  }
  db.prepare(
    "INSERT INTO server_settings (key, value) VALUES ('character.beard_chance', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(Math.round(chance)));
  res.json({ beardChance: Math.round(chance) });
});

// PATCH /admin/characters/:part/:variant
const CharVariantSchema = z.object({
  excluded: z.boolean().optional(),
  weight:   z.number().int().min(0).max(9999).optional(),
});

router.patch('/characters/:part/:variant', (req: Request, res: Response) => {
  const part    = String(req.params.part);
  const variant = parseInt(String(req.params.variant), 10);
  if (isNaN(variant)) { res.status(400).json({ error: 'Invalid variant' }); return; }

  const parsed = CharVariantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const existing = db.prepare('SELECT excluded, weight FROM character_settings WHERE part = ? AND variant = ?').get(part, variant) as { excluded: number; weight: number } | undefined;
  const excl = parsed.data.excluded !== undefined ? (parsed.data.excluded ? 1 : 0) : (existing?.excluded ?? 0);
  const wgt  = parsed.data.weight   !== undefined ? parsed.data.weight              : (existing?.weight   ?? 0);

  db.prepare(
    'INSERT INTO character_settings (part, variant, excluded, weight) VALUES (?, ?, ?, ?) ON CONFLICT(part, variant) DO UPDATE SET excluded = ?, weight = ?'
  ).run(part, variant, excl, wgt, excl, wgt);

  res.json({ part, variant, excluded: !!excl, weight: wgt });
});

export default router;
