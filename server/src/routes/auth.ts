import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { signToken } from '../middleware/auth';

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
