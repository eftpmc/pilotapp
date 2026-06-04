import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { z } from 'zod';
import { db } from '../db';
import { initRepo, cloneRepo, importLocalRepo, pushToRemote, listFilesRecursive } from '../services/git';
import simpleGit from 'simple-git';
import { authMiddleware, userId } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

interface ProjectRun {
  proc: ChildProcess;
  projectId: string;
  script: string;
  command: string;
  source: string;
  cwd: string;
  startedAt: string;
  output: string[];
  url?: string;
}

interface ProjectAppStatus {
  running: boolean;
  script?: string;
  command?: string;
  source?: string;
  cwd?: string;
  startedAt?: string;
  output?: string;
  url?: string;
}

interface ProjectCommand {
  id: string;
  label: string;
  command: string;
  source: string;
}

const runningApps = new Map<string, ProjectRun>();
const lastApps = new Map<string, ProjectAppStatus>();

const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+[^\s]*)/i;

// ---------------------------------------------------------------------------

interface Row {
  id: string; user_id: string; name: string; repo_path: string; role: string;
  remote_url: string | null; github_token: string | null; local_path: string | null;
  workspace_mode: string; created_at: string;
}

function toProject(row: Row | Record<string, unknown>) {
  return {
    id:            row.id,
    name:          row.name,
    repoPath:      row.repo_path,
    role:          row.role,
    workspaceMode: (row.workspace_mode ?? 'git') as 'git' | 'workspace',
    remoteUrl:     row.remote_url  ?? undefined,
    localPath:     row.local_path  ?? undefined,
    createdAt:     row.created_at,
  };
}

function projectWorktreePath(projectId: string) {
  return path.join(DATA_DIR, 'projects', projectId, 'app');
}

async function ensureProjectWorktree(row: Pick<Row, 'id' | 'repo_path'>): Promise<string> {
  const worktreePath = projectWorktreePath(row.id);
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  if (fsSync.existsSync(worktreePath)) {
    await simpleGit(worktreePath).raw(['reset', '--hard', 'main']).catch(() => undefined);
    await simpleGit(worktreePath).raw(['clean', '-fd']).catch(() => undefined);
    return worktreePath;
  }
  await simpleGit(row.repo_path).raw(['worktree', 'add', '--force', worktreePath, 'main']);
  return worktreePath;
}

async function readMainFile(repoPath: string, filePath: string): Promise<string | null> {
  try {
    return await simpleGit(repoPath).raw(['show', `main:${filePath}`]);
  } catch {
    return null;
  }
}

function parsePackageScripts(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const json = JSON.parse(raw) as { scripts?: Record<string, string> };
    return json.scripts ?? {};
  } catch {
    return {};
  }
}

function makeCommandId(source: string, label: string) {
  return `${source}:${label}`;
}

function parseMakeTargets(raw: string | null): ProjectCommand[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const commands: ProjectCommand[] = [];
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9][\w./-]*):(?:\s|$)/);
    const target = match?.[1];
    if (!target || target.startsWith('.') || target.includes('%') || seen.has(target)) continue;
    seen.add(target);
    commands.push({ id: makeCommandId('make', target), label: target, command: `make ${target}`, source: 'Makefile' });
  }
  return commands;
}

function parseJustRecipes(raw: string | null): ProjectCommand[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const commands: ProjectCommand[] = [];
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9][\w-]*)(?:\s|:)/);
    const recipe = match?.[1];
    if (!recipe || line.startsWith(' ') || line.startsWith('\t') || seen.has(recipe)) continue;
    seen.add(recipe);
    commands.push({ id: makeCommandId('just', recipe), label: recipe, command: `just ${recipe}`, source: 'justfile' });
  }
  return commands;
}

function parseTaskfileTasks(raw: string | null): ProjectCommand[] {
  if (!raw) return [];
  const commands: ProjectCommand[] = [];
  const lines = raw.split('\n');
  const start = lines.findIndex(line => /^tasks:\s*$/.test(line));
  if (start < 0) return commands;
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(/^  ([A-Za-z0-9][\w-]*):\s*$/);
    if (match?.[1]) {
      const task = match[1];
      commands.push({ id: makeCommandId('task', task), label: task, command: `task ${task}`, source: 'Taskfile' });
    } else if (/^\S/.test(lines[i])) {
      break;
    }
  }
  return commands;
}

async function detectProjectCommands(repoPath: string, files: string[]) {
  const scripts = parsePackageScripts(await readMainFile(repoPath, 'package.json'));
  const commands: ProjectCommand[] = Object.entries(scripts).map(([label]) => ({
    id: makeCommandId('npm', label),
    label,
    command: `npm run ${label}`,
    source: 'package.json',
  }));

  commands.push(...parseMakeTargets(await readMainFile(repoPath, 'Makefile')));
  commands.push(...parseMakeTargets(await readMainFile(repoPath, 'makefile')));
  commands.push(...parseJustRecipes(await readMainFile(repoPath, 'justfile')));
  commands.push(...parseJustRecipes(await readMainFile(repoPath, 'Justfile')));
  commands.push(...parseTaskfileTasks(await readMainFile(repoPath, 'Taskfile.yml')));
  commands.push(...parseTaskfileTasks(await readMainFile(repoPath, 'Taskfile.yaml')));

  for (const file of files) {
    if (/^scripts\/[^/]+\.(sh|bash|zsh|js|ts|py)$/i.test(file)) {
      const label = file.replace(/^scripts\//, '');
      const runner = file.endsWith('.py') ? 'python' : file.endsWith('.js') ? 'node' : file.endsWith('.ts') ? 'npx tsx' : 'bash';
      commands.push({ id: makeCommandId('script', label), label, command: `${runner} ${file}`, source: 'scripts/' });
    }
  }

  return { scripts, commands };
}

function appendRunOutput(run: ProjectRun, chunk: Buffer | string) {
  const text = chunk.toString();
  run.output.push(text);
  if (run.output.length > 400) run.output.splice(0, run.output.length - 400);
  const found = text.match(URL_RE)?.[1];
  if (found) run.url = found.replace('0.0.0.0', 'localhost');
}

function runStatus(projectId: string): ProjectAppStatus {
  const run = runningApps.get(projectId);
  if (!run) return lastApps.get(projectId) ?? { running: false as const };
  return {
    running: true as const,
    script: run.script,
    command: run.command,
    source: run.source,
    cwd: run.cwd,
    startedAt: run.startedAt,
    output: run.output.join('').slice(-20000),
    url: run.url,
  };
}

// ---------------------------------------------------------------------------
// GET /projects
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(userId(req)) as Row[];
  res.json(rows.map(toProject));
});

// ---------------------------------------------------------------------------
// POST /projects
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  name:           z.string().min(1),
  githubCloneUrl: z.string().url().optional(),
  githubToken:    z.string().optional(),
  localPath:      z.string().optional(),
  workspaceMode:  z.enum(['git', 'workspace']).default('git'),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { name, githubCloneUrl, githubToken, localPath, workspaceMode } = parsed.data;
  const id       = uuid();
  const repoPath = path.join(DATA_DIR, 'repos', userId(req), id);

  const row = {
    id,
    user_id:        userId(req),
    name,
    repo_path:      repoPath,
    role:           'any',
    workspace_mode: workspaceMode,
    remote_url:     githubCloneUrl ?? null,
    github_token:   githubToken    ?? null,
    local_path:     localPath      ?? null,
    created_at:     new Date().toISOString(),
  };

  const projectObj = { id, name, repoPath, role: 'any' as any, workspaceMode, createdAt: row.created_at };

  try {
    if (workspaceMode === 'git') {
      if (githubCloneUrl && githubToken) {
        await cloneRepo(projectObj, githubCloneUrl, githubToken);
      } else if (localPath) {
        await importLocalRepo(projectObj, localPath);
      } else {
        await initRepo(projectObj);
      }
    } else {
      // Workspace projects: just create a directory — no git repo
      await fs.mkdir(repoPath, { recursive: true });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? 'Failed to set up project' });
    return;
  }

  db.prepare(
    'INSERT INTO projects (id, user_id, name, repo_path, role, workspace_mode, remote_url, github_token, local_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.user_id, row.name, row.repo_path, row.role, row.workspace_mode, row.remote_url, row.github_token, row.local_path, row.created_at);

  res.status(201).json(toProject(row));
});

// ---------------------------------------------------------------------------
// PATCH /projects/:id
// ---------------------------------------------------------------------------

const UpdateSchema = z.object({
  name:        z.string().min(1).optional(),
  remoteUrl:   z.string().url().optional().or(z.literal('')),
  githubToken: z.string().optional(),
});

router.patch('/:id', (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const sets: string[] = []; const vals: unknown[] = [];
  if (parsed.data.name        !== undefined) { sets.push('name = ?');         vals.push(parsed.data.name) }
  if (parsed.data.remoteUrl   !== undefined) { sets.push('remote_url = ?');   vals.push(parsed.data.remoteUrl   || null) }
  if (parsed.data.githubToken !== undefined) { sets.push('github_token = ?'); vals.push(parsed.data.githubToken || null) }
  if (sets.length > 0) { vals.push(row.id); db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.id) as Row;
  res.json(toProject(updated));
});

// ---------------------------------------------------------------------------
// POST /projects/:id/push  — push main to GitHub remote
// ---------------------------------------------------------------------------

router.post('/:id/push', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (!row.remote_url || !row.github_token) {
    res.status(400).json({ error: 'No remote configured for this project' });
    return;
  }

  try {
    const projectObj = { id: row.id, name: row.name, repoPath: row.repo_path, role: row.role as any, createdAt: row.created_at };
    await pushToRemote(projectObj, row.remote_url, row.github_token);
    res.json({ pushed: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Push failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /projects/:id/app-info — scripts and browser-viewable files
// ---------------------------------------------------------------------------

router.get('/:id/app-info', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  let files: string[] = [];
  try {
    const out = await simpleGit(row.repo_path).raw(['ls-tree', '-r', '--name-only', 'main']);
    files = out.trim().split('\n').filter(Boolean);
  } catch { /* empty repo */ }

  const { scripts, commands } = await detectProjectCommands(row.repo_path, files);
  const htmlEntries = files.filter(f => /\.html?$/i.test(f)).sort((a, b) => {
    if (a === 'index.html') return -1;
    if (b === 'index.html') return 1;
    return a.localeCompare(b);
  });

  res.json({
    scripts,
    commands,
    htmlEntries,
    status: runStatus(row.id),
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:id/app/start — start an npm script in a main-branch worktree
// ---------------------------------------------------------------------------

router.post('/:id/app/start', async (req: Request, res: Response) => {
  const parsed = z.object({ script: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  let files: string[] = [];
  try {
    const out = await simpleGit(row.repo_path).raw(['ls-tree', '-r', '--name-only', 'main']);
    files = out.trim().split('\n').filter(Boolean);
  } catch { /* empty repo */ }
  const { commands } = await detectProjectCommands(row.repo_path, files);
  const command = commands.find(c => c.id === parsed.data.script) ??
    commands.find(c => c.id === makeCommandId('npm', parsed.data.script));
  if (!command) {
    res.status(400).json({ error: 'Unknown project command' });
    return;
  }

  const existing = runningApps.get(row.id);
  if (existing) {
    existing.proc.kill();
    runningApps.delete(row.id);
  }
  lastApps.delete(row.id);

  const cwd = await ensureProjectWorktree(row);
  const proc = spawn(command.command, [], {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const run: ProjectRun = {
    proc,
    projectId: row.id,
    script: command.id,
    command: command.command,
    source: command.source,
    cwd,
    startedAt: new Date().toISOString(),
    output: [],
  };
  runningApps.set(row.id, run);

  appendRunOutput(run, `$ ${command.command}\n`);
  proc.stdout?.on('data', chunk => appendRunOutput(run, chunk));
  proc.stderr?.on('data', chunk => appendRunOutput(run, chunk));
  proc.on('close', code => {
    appendRunOutput(run, `\n[process exited ${code ?? 0}]\n`);
    lastApps.set(row.id, {
      running: false,
      script: run.script,
      command: command.command,
      source: command.source,
      cwd: run.cwd,
      startedAt: run.startedAt,
      output: run.output.join('').slice(-20000),
      url: run.url,
    });
    if (runningApps.get(row.id) === run) runningApps.delete(row.id);
  });

  res.status(201).json(runStatus(row.id));
});

// ---------------------------------------------------------------------------
// POST /projects/:id/app/stop
// ---------------------------------------------------------------------------

router.post('/:id/app/stop', (req: Request, res: Response) => {
  const row = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as { id: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  const run = runningApps.get(row.id);
  if (run) {
    run.proc.kill();
    runningApps.delete(row.id);
  }
  res.json({ stopped: true });
});

// ---------------------------------------------------------------------------
// GET /projects/:id/files — list files from main branch (git) or merged sessions (workspace)
// ---------------------------------------------------------------------------

router.get('/:id/files', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT repo_path, workspace_mode FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as { repo_path: string; workspace_mode: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  if ((row.workspace_mode ?? 'git') === 'workspace') {
    const wsDir = path.join(DATA_DIR, 'workspaces', String(req.params.id));
    const files = await listFilesRecursive(wsDir).catch(() => [] as string[]);
    res.json({ files });
    return;
  }

  try {
    const out = await simpleGit(row.repo_path).raw(['ls-tree', '-r', '--name-only', 'main']);
    res.json({ files: out.trim().split('\n').filter(Boolean) });
  } catch {
    res.json({ files: [] });
  }
});

// ---------------------------------------------------------------------------
// GET /projects/:id/file?path= — get a single file's content
// ---------------------------------------------------------------------------

router.get('/:id/file', async (req: Request, res: Response) => {
  const filePath = req.query.path as string | undefined;
  const row = db.prepare('SELECT repo_path, workspace_mode FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as { repo_path: string; workspace_mode: string } | undefined;
  if (!row || !filePath) { res.status(400).json({ error: 'Missing path' }); return; }

  if ((row.workspace_mode ?? 'git') === 'workspace') {
    try {
      const content = await fs.readFile(path.join(DATA_DIR, 'workspaces', String(req.params.id), filePath), 'utf-8');
      res.json({ content });
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
    return;
  }

  try {
    const content = await simpleGit(row.repo_path).raw(['show', `main:${filePath}`]);
    res.json({ content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /projects/:id
// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId(req)) as Row | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  await fs.rm(row.repo_path as string, { recursive: true, force: true }).catch(() => {});
  res.status(204).send();
});

export default router;
