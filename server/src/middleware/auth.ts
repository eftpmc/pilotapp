import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { AuthPayload } from '../types';

export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'development') {
  console.warn('[pilot] WARNING: JWT_SECRET is not set. Using insecure default. Set JWT_SECRET in production.');
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;

    // Check token version for sign-out-all support
    if (payload.tokenVersion !== undefined) {
      const user = db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.userId) as
        | { token_version: number } | undefined;
      if (!user || user.token_version !== payload.tokenVersion) {
        res.status(401).json({ error: 'Session expired' });
        return;
      }
    }

    // Check registered device is not revoked
    if (payload.deviceId) {
      const device = db.prepare('SELECT id FROM user_devices WHERE id = ? AND user_id = ?')
        .get(payload.deviceId, payload.userId);
      if (!device) {
        res.status(401).json({ error: 'Device revoked' });
        return;
      }
      db.prepare('UPDATE user_devices SET last_seen_at = ? WHERE id = ?')
        .run(new Date().toISOString(), payload.deviceId);
    }

    (req as Request & { userId: string; deviceId?: string }).userId   = payload.userId;
    (req as Request & { userId: string; deviceId?: string }).deviceId = payload.deviceId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function signToken(userId: string, tokenVersion: number, deviceId?: string): string {
  const payload: AuthPayload = { userId, tokenVersion, ...(deviceId ? { deviceId } : {}) };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: deviceId ? '365d' : '30d' });
}

export function userId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}

export function isAdmin(uid: string): boolean {
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(uid) as { role: string } | undefined;
  return user?.role === 'admin';
}
