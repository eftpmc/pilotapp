import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

function credentialStatus(uid: string) {
  const rows = db.prepare('SELECT provider FROM credentials WHERE user_id = ?').all(uid) as { provider: string }[];
  const stored = new Set(rows.map((r) => r.provider));
  return {
    claude: stored.has('claude') || !!process.env.ANTHROPIC_API_KEY,
    codex:  stored.has('codex')  || !!process.env.OPENAI_API_KEY,
  };
}

export function resolveApiKey(uid: string, provider: string, agentId?: string, explicit?: string): string | null {
  if (explicit) return explicit;

  // If agentId provided, try to look up the connection's api_key via a single join
  if (agentId) {
    const row = db.prepare(
      'SELECT c.api_key FROM agents a JOIN connections c ON c.id = a.connection_id WHERE a.id = ?'
    ).get(agentId) as { api_key: string } | undefined;
    if (row?.api_key) return row.api_key;
  }

  // Fall back to env vars
  const envKey = provider === 'claude' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (envKey) return envKey;

  // Fall back to old credentials table
  const row = db.prepare('SELECT api_key FROM credentials WHERE user_id = ? AND provider = ?').get(uid, provider) as
    | { api_key: string }
    | undefined;
  return row?.api_key ?? null;
}

router.get('/credentials', (req: Request, res: Response) => {
  res.json(credentialStatus(userId(req)));
});

const UpdateSchema = z.object({
  claude: z.string().optional(),
  codex:  z.string().optional(),
});

router.put('/credentials', (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const uid = userId(req);
  const upsert = db.prepare(
    'INSERT INTO credentials (user_id, provider, api_key) VALUES (?, ?, ?) ON CONFLICT(user_id, provider) DO UPDATE SET api_key = excluded.api_key'
  );
  const del = db.prepare('DELETE FROM credentials WHERE user_id = ? AND provider = ?');

  if (parsed.data.claude !== undefined) {
    parsed.data.claude === '' ? del.run(uid, 'claude') : upsert.run(uid, 'claude', parsed.data.claude);
  }
  if (parsed.data.codex !== undefined) {
    parsed.data.codex === '' ? del.run(uid, 'codex') : upsert.run(uid, 'codex', parsed.data.codex);
  }

  res.json(credentialStatus(uid));
});

// GET /settings/characters — read character generation settings (any authenticated user)
router.get('/characters', (_req: Request, res: Response) => {
  type Row = { part: string; variant: number; excluded: number; weight: number };
  const rows = db.prepare('SELECT part, variant, excluded, weight FROM character_settings').all() as Row[];

  const exclusions: Record<string, number[]> = {};
  const weights: Record<string, Record<number, number>> = {};

  for (const r of rows) {
    if (r.excluded) {
      if (!exclusions[r.part]) exclusions[r.part] = [];
      exclusions[r.part].push(r.variant);
    }
    if (r.weight > 0) {
      if (!weights[r.part]) weights[r.part] = {};
      weights[r.part][r.variant] = r.weight;
    }
  }

  const bChance = db.prepare("SELECT value FROM server_settings WHERE key = 'character.beard_chance'").get() as { value: string } | undefined;
  res.json({ exclusions, weights, beardChance: bChance ? parseInt(bChance.value, 10) : 10 });
});

export default router;
