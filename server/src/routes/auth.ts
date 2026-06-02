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

  // Allow registration only for the first user, or when explicitly enabled via env
  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (existingCount > 0 && process.env.ALLOW_REGISTRATION !== 'true') {
    res.status(403).json({ error: 'Registration is disabled' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email);
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const id = uuid();
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id, parsed.data.email, passwordHash, new Date().toISOString()
  );

  res.status(201).json({ token: signToken(id) });
});

router.post('/login', async (req: Request, res: Response) => {
  if (!rateLimit(req, res)) return;
  const parsed = AuthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(parsed.data.email) as
    | { id: string; password_hash: string }
    | undefined;

  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json({ token: signToken(user.id) });
});

export default router;
