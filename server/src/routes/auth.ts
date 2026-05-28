import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { signToken } from '../middleware/auth';

const router = Router();
const DATA_ROOT = process.env.PROJECTS_ROOT || './data/projects';
const USERS_FILE = path.join(DATA_ROOT, '../users.json');

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
}

async function readUsers(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

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

  const users = await readUsers();
  if (users.find((u) => u.email === parsed.data.email)) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user: StoredUser = {
    id: crypto.randomUUID(),
    email: parsed.data.email,
    passwordHash,
  };

  users.push(user);
  await writeUsers(users);

  res.status(201).json({ token: signToken(user.id) });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = AuthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const users = await readUsers();
  const user = users.find((u) => u.email === parsed.data.email);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json({ token: signToken(user.id) });
});

export default router;
