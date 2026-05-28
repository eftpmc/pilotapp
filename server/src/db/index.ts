import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || './data';
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'pilot.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    repo_path   TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'any',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    provider    TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    prompt       TEXT NOT NULL,
    base_branch  TEXT NOT NULL DEFAULT 'main',
    status       TEXT NOT NULL DEFAULT 'pending',
    agent_id     TEXT REFERENCES agents(id),
    session_id   TEXT,
    created_at   TEXT NOT NULL,
    started_at   TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id      TEXT NOT NULL REFERENCES agents(id),
    project_id    TEXT NOT NULL REFERENCES projects(id),
    work_task_id  TEXT REFERENCES tasks(id),
    provider      TEXT NOT NULL,
    branch        TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'idle',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credentials (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider  TEXT NOT NULL,
    api_key   TEXT NOT NULL,
    PRIMARY KEY (user_id, provider)
  );
`);
