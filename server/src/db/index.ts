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

  CREATE TABLE IF NOT EXISTS connections (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL,
    api_key    TEXT NOT NULL,
    created_at TEXT NOT NULL
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

  CREATE TABLE IF NOT EXISTS specs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    brief       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    session_id  TEXT,
    status      TEXT NOT NULL DEFAULT 'draft',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credentials (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider  TEXT NOT NULL,
    api_key   TEXT NOT NULL,
    PRIMARY KEY (user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS knowledge (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope      TEXT NOT NULL,
    scope_id   TEXT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS departments (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id     TEXT NOT NULL REFERENCES agents(id),
    status       TEXT NOT NULL DEFAULT 'running',
    created_at   TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    session_id TEXT,
    task_id    TEXT,
    project_id TEXT,
    agent_id   TEXT,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tools (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    mcp_config  TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_tools (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_id  TEXT NOT NULL REFERENCES tools(id)  ON DELETE CASCADE,
    PRIMARY KEY (agent_id, tool_id)
  );
`);

// Indexes — safe to re-run
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_user_id       ON tasks (user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_project_id    ON tasks (project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks (status);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions (project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status     ON sessions (status);
  CREATE INDEX IF NOT EXISTS idx_specs_project_id    ON specs (project_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_user_id   ON knowledge (user_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_scope     ON knowledge (scope, scope_id);
  CREATE INDEX IF NOT EXISTS idx_events_user_id      ON events (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_departments_user_id ON departments (user_id);
  CREATE INDEX IF NOT EXISTS idx_tools_user_id       ON tools (user_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tools_agent   ON agent_tools (agent_id);
`);

// Migrations — safe to re-run, each ALTER is wrapped in try/catch
try { db.exec('ALTER TABLE agents ADD COLUMN connection_id TEXT REFERENCES connections(id)'); } catch {}
try { db.exec('ALTER TABLE connections ADD COLUMN model TEXT'); } catch {}
try { db.exec('ALTER TABLE projects ADD COLUMN remote_url TEXT'); } catch {}
try { db.exec('ALTER TABLE projects ADD COLUMN github_token TEXT'); } catch {}
try { db.exec('ALTER TABLE projects ADD COLUMN local_path TEXT'); } catch {}
try { db.exec('ALTER TABLE sessions ADD COLUMN spec_id TEXT REFERENCES specs(id)'); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE agents ADD COLUMN personality TEXT'); } catch {}
try { db.exec("ALTER TABLE connections ADD COLUMN quota_status TEXT NOT NULL DEFAULT 'ok'"); } catch {}
try { db.exec('ALTER TABLE connections ADD COLUMN quota_reset_at TEXT'); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN role TEXT NOT NULL DEFAULT 'any'"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN size TEXT NOT NULL DEFAULT 'm'"); } catch {}
try { db.exec('ALTER TABLE agents ADD COLUMN department_id TEXT REFERENCES departments(id)'); } catch {}
try { db.exec('ALTER TABLE sessions ADD COLUMN journal TEXT'); } catch {}
try { db.exec('ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id)'); } catch {}
try { db.exec('ALTER TABLE sessions ADD COLUMN review_verdict TEXT'); } catch {}
try { db.exec('ALTER TABLE sessions ADD COLUMN shift_id TEXT REFERENCES shifts(id)'); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN shift_id TEXT REFERENCES shifts(id)'); } catch {}
try { db.exec('ALTER TABLE shifts ADD COLUMN report TEXT'); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN lead_session_id TEXT REFERENCES sessions(id)'); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS department_tools (
    department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    tool_id       TEXT NOT NULL REFERENCES tools(id)       ON DELETE CASCADE,
    PRIMARY KEY (department_id, tool_id)
  );
  CREATE INDEX IF NOT EXISTS idx_dept_tools_dept ON department_tools (department_id);
`);
