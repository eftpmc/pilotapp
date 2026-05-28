import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as Request & { userId: string }).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ userId } satisfies AuthPayload, JWT_SECRET, { expiresIn: '30d' });
}

export function userId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}
