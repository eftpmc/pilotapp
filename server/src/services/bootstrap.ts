import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db';

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function ensureAdminExists(): Promise<void> {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) return;

  const email    = process.env.ADMIN_EMAIL    || 'admin@pilot.local';
  const password = process.env.ADMIN_PASSWORD || generatePassword();
  const hash     = await bcrypt.hash(password, 12);
  const id       = uuid();

  db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)")
    .run(id, email, hash, new Date().toISOString());

  console.log('\n[pilot] ✦ Admin account created');
  console.log(`[pilot]   Email:    ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`[pilot]   Password: ${password}`);
    console.log('[pilot]   Change this password after first login!\n');
  }
}
