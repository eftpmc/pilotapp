import { afterAll, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// Must be set before any server module is imported.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilotapp-test-'));
process.env.DATA_DIR    = tmpDir;
process.env.JWT_SECRET  = 'test-secret';
process.env.NODE_ENV    = 'test';

// ---------------------------------------------------------------------------
// Default fake subprocess — completes with exit 0, no output
// ---------------------------------------------------------------------------

export function makeFakeProcess(stdoutLines: string[] = [], exitCode = 0) {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  });
  setImmediate(() => {
    for (const line of stdoutLines) proc.stdout.emit('data', Buffer.from(line + '\n'));
    proc.stderr.emit('data', Buffer.from('[pilot] Finished\n'));
    proc.emit('close', exitCode, null);
  });
  return proc;
}

// ---------------------------------------------------------------------------
// Mock child_process — no real CLI subprocesses
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  spawn:    vi.fn().mockImplementation(() => makeFakeProcess([], 0)),
  execSync: vi.fn(() => '/usr/bin/claude'),
}));

// ---------------------------------------------------------------------------
// Mock git service — no real git operations
// ---------------------------------------------------------------------------

vi.mock('../services/git', () => ({
  initRepo:        vi.fn().mockResolvedValue(undefined),
  cloneRepo:       vi.fn().mockResolvedValue(undefined),
  importLocalRepo: vi.fn().mockResolvedValue(undefined),
  pushToRemote:    vi.fn().mockResolvedValue(undefined),
  createWorktree:  vi.fn().mockImplementation(
    async (_project: unknown, sessionId: string) => {
      const wt = path.join(tmpDir, 'worktrees', sessionId);
      fs.mkdirSync(wt, { recursive: true });
      return wt;
    }
  ),
  removeWorktree:  vi.fn().mockResolvedValue(undefined),
  getDiff:         vi.fn().mockResolvedValue('diff --git a/index.ts b/index.ts\n+export {}'),
  mergeWorktree:   vi.fn().mockResolvedValue(undefined),
  commitWorktree:  vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Clean all table rows between each test
// ---------------------------------------------------------------------------

afterEach(async () => {
  const { db } = await import('../db');
  // Disable FK constraints so we can delete in any order
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DELETE FROM department_tools;
    DELETE FROM agent_tools;
    DELETE FROM events;
    DELETE FROM sessions;
    DELETE FROM tasks;
    DELETE FROM shifts;
    DELETE FROM knowledge;
    DELETE FROM specs;
    DELETE FROM tools;
    DELETE FROM agents;
    DELETE FROM departments;
    DELETE FROM projects;
    DELETE FROM connections;
    DELETE FROM credentials;
    DELETE FROM users;
  `);
  db.pragma('foreign_keys = ON');
});

// ---------------------------------------------------------------------------
// Clean up temp dir after the full suite
// ---------------------------------------------------------------------------

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
});
