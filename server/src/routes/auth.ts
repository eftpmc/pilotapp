import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { signToken } from '../middleware/auth';

// Simple in-memory rate limiter — 10 attempts per IP per 15 minutes.
// Resets on server restart, which is fine for a self-hosted tool.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function rateLimit(req: Request, res: Response): boolean {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_ATTEMPTS) {
    res.status(429).json({ error: 'Too many attempts — try again later' });
    return false;
  }
  record.count++;
  return true;
}

// In-memory one-time pairing tokens: token → { userId, expiresAt }
const pairTokens = new Map<string, { userId: string; expiresAt: number }>();
const PAIR_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function createPairToken(userId: string): { token: string; expiresAt: string } {
  const token = uuid();
  const expiresAt = Date.now() + PAIR_TOKEN_TTL_MS;
  pairTokens.set(token, { userId, expiresAt });
  // Clean up expired tokens lazily
  for (const [t, v] of pairTokens) {
    if (v.expiresAt < Date.now()) pairTokens.delete(t);
  }
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

const router = Router();

const AuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = AuthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;

  // Check registration policy: first user always allowed; after that check DB setting then env
  if (existingCount > 0) {
    const dbSetting = db.prepare("SELECT value FROM server_settings WHERE key = 'allow_registration'").get() as
      | { value: string } | undefined;
    const allowed = dbSetting ? dbSetting.value === 'true' : process.env.ALLOW_REGISTRATION === 'true';
    if (!allowed) {
      res.status(403).json({ error: 'Registration is disabled' });
      return;
    }
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email);
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const id = uuid();
  db.prepare('INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, parsed.data.email, passwordHash, 'user', new Date().toISOString()
  );

  res.status(201).json({ token: signToken(id, 0), role: 'user' });
});

router.post('/login', async (req: Request, res: Response) => {
  if (!rateLimit(req, res)) return;
  const parsed = AuthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = db.prepare('SELECT id, password_hash, token_version, role, disabled FROM users WHERE email = ?').get(parsed.data.email) as
    | { id: string; password_hash: string; token_version: number; role: string; disabled: number } | undefined;

  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (user.disabled) {
    res.status(403).json({ error: 'Account disabled — contact your administrator' });
    return;
  }

  res.json({ token: signToken(user.id, user.token_version ?? 0), role: user.role });
});

// Exchanges a one-time QR pairing token for a long-lived device JWT
const PairSchema = z.object({
  pairToken:   z.string(),
  deviceName:  z.string().min(1).max(100),
  deviceType:  z.enum(['mobile', 'desktop', 'web']).default('mobile'),
});

router.post('/pair', async (req: Request, res: Response) => {
  const parsed = PairSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const record = pairTokens.get(parsed.data.pairToken);
  if (!record || record.expiresAt < Date.now()) {
    pairTokens.delete(parsed.data.pairToken);
    res.status(401).json({ error: 'Pairing token invalid or expired' });
    return;
  }
  pairTokens.delete(parsed.data.pairToken); // one-time use

  const user = db.prepare('SELECT id, token_version FROM users WHERE id = ?').get(record.userId) as
    | { id: string; token_version: number } | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const deviceId = uuid();
  db.prepare('INSERT INTO user_devices (id, user_id, name, device_type, created_at) VALUES (?, ?, ?, ?, ?)').run(
    deviceId, user.id, parsed.data.deviceName, parsed.data.deviceType, new Date().toISOString()
  );

  res.json({ token: signToken(user.id, user.token_version ?? 0, deviceId) });
});

export default router;
