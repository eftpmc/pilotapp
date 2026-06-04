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

// Migration tracking — each migration runs exactly once, failure throws so
// the server doesn't start with a partially-applied schema.
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

function migrate(id: string, sql: string): void {
  if (db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(id)) return;
  try {
    db.exec(sql);
  } catch (err: any) {
    // Column/table already exists from the old try/catch migration approach — mark as applied.
    if (/duplicate column|already exists/i.test(String(err?.message))) {
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id, new Date().toISOString());
      return;
    }
    console.error(`[db] Migration '${id}' failed:`, err);
    throw err;
  }
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id, new Date().toISOString());
}

migrate('001_agents_connection_id',        'ALTER TABLE agents ADD COLUMN connection_id TEXT REFERENCES connections(id)');
migrate('002_connections_model',           'ALTER TABLE connections ADD COLUMN model TEXT');
migrate('003_projects_remote_url',         'ALTER TABLE projects ADD COLUMN remote_url TEXT');
migrate('004_projects_github_token',       'ALTER TABLE projects ADD COLUMN github_token TEXT');
migrate('005_projects_local_path',         'ALTER TABLE projects ADD COLUMN local_path TEXT');
migrate('006_sessions_spec_id',            'ALTER TABLE sessions ADD COLUMN spec_id TEXT REFERENCES specs(id)');
migrate('007_tasks_priority',              'ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0');
migrate('008_agents_personality',          'ALTER TABLE agents ADD COLUMN personality TEXT');
migrate('009_connections_quota_status',    "ALTER TABLE connections ADD COLUMN quota_status TEXT NOT NULL DEFAULT 'ok'");
migrate('010_connections_quota_reset_at',  'ALTER TABLE connections ADD COLUMN quota_reset_at TEXT');
migrate('011_agents_role',                 "ALTER TABLE agents ADD COLUMN role TEXT NOT NULL DEFAULT 'any'");
migrate('012_tasks_size',                  "ALTER TABLE tasks ADD COLUMN size TEXT NOT NULL DEFAULT 'm'");
migrate('013_agents_department_id',        'ALTER TABLE agents ADD COLUMN department_id TEXT REFERENCES departments(id)');
migrate('014_sessions_journal',            'ALTER TABLE sessions ADD COLUMN journal TEXT');
migrate('015_sessions_parent_session_id',  'ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id)');
migrate('016_sessions_review_verdict',     'ALTER TABLE sessions ADD COLUMN review_verdict TEXT');
migrate('017_sessions_shift_id',           'ALTER TABLE sessions ADD COLUMN shift_id TEXT REFERENCES shifts(id)');
migrate('018_tasks_shift_id',              'ALTER TABLE tasks ADD COLUMN shift_id TEXT REFERENCES shifts(id)');
migrate('019_shifts_report',               'ALTER TABLE shifts ADD COLUMN report TEXT');
migrate('020_tasks_lead_session_id',       'ALTER TABLE tasks ADD COLUMN lead_session_id TEXT REFERENCES sessions(id)');
migrate('021_department_tools', `
  CREATE TABLE IF NOT EXISTS department_tools (
    department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    tool_id       TEXT NOT NULL REFERENCES tools(id)       ON DELETE CASCADE,
    PRIMARY KEY (department_id, tool_id)
  );
  CREATE INDEX IF NOT EXISTS idx_dept_tools_dept ON department_tools (department_id);
`);
migrate('022_sessions_runner_session_id', 'ALTER TABLE sessions ADD COLUMN runner_session_id TEXT');
migrate('023_turns', `
  CREATE TABLE IF NOT EXISTS turns (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    turn_number  INTEGER NOT NULL,
    prompt       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'running',
    created_at   TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns (session_id);
`);
migrate('024_clarifications', `
  CREATE TABLE IF NOT EXISTS clarifications (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question     TEXT NOT NULL,
    options      TEXT,
    response     TEXT,
    created_at   TEXT NOT NULL,
    responded_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_clarifications_session_id ON clarifications (session_id);
`);
migrate('025_tasks_depends_on',    'ALTER TABLE tasks ADD COLUMN depends_on TEXT');
migrate('027_agents_avatar_seed',  'ALTER TABLE agents ADD COLUMN avatar_seed TEXT');
migrate('028_agents_role_simplify', "UPDATE agents SET role = 'worker' WHERE role IN ('any', 'planner', 'reviewer')");
migrate('029_users_name',          'ALTER TABLE users ADD COLUMN name TEXT');
migrate('030_users_role',          "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
migrate('031_users_token_version', 'ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
migrate('032_user_devices', `
  CREATE TABLE IF NOT EXISTS user_devices (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL DEFAULT 'Unknown device',
    device_type  TEXT NOT NULL DEFAULT 'web',
    created_at   TEXT NOT NULL,
    last_seen_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices (user_id);
`);
migrate('033_server_settings', `
  CREATE TABLE IF NOT EXISTS server_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO server_settings (key, value) VALUES ('allow_registration', 'false');
`);
migrate('034_reset_user_roles',  "UPDATE users SET role = 'user'");
migrate('035_users_disabled',    'ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
migrate('026_sessions_tokens', `
  ALTER TABLE sessions ADD COLUMN input_tokens INTEGER;
  ALTER TABLE sessions ADD COLUMN output_tokens INTEGER;
  ALTER TABLE sessions ADD COLUMN cache_read_tokens INTEGER;
  ALTER TABLE sessions ADD COLUMN total_cost_usd REAL;
`);
