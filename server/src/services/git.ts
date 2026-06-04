import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { Project } from '../types';

const PROJECTS_ROOT = path.resolve(process.env.PROJECTS_ROOT || './data/projects');
const DATA_DIR      = path.resolve(process.env.DATA_DIR ?? './data');

// Well-known SHA1 of git's empty tree object — valid in any git repo.
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export async function initRepo(project: Project): Promise<void> {
  await fs.mkdir(project.repoPath, { recursive: true });
  const git = simpleGit(project.repoPath);
  await git.init(['--bare']);
  await git.addConfig('user.email', 'pilot@localhost');
  await git.addConfig('user.name', 'Pilot');
  const commitHash = (await git.raw(['commit-tree', EMPTY_TREE_HASH, '-m', 'init'])).trim();
  await git.raw(['update-ref', 'refs/heads/main', commitHash]);
}

export async function cloneRepo(project: Project, cloneUrl: string, token: string): Promise<void> {
  await fs.mkdir(path.dirname(project.repoPath), { recursive: true });
  const authedUrl = cloneUrl.replace('https://', `https://oauth2:${token}@`);
  const git = simpleGit();
  await git.clone(authedUrl, project.repoPath, ['--bare']);
  const cloned = simpleGit(project.repoPath);
  await cloned.addConfig('user.email', 'pilot@localhost');
  await cloned.addConfig('user.name', 'Pilot');
}

export async function importLocalRepo(project: Project, localPath: string): Promise<void> {
  await fs.mkdir(path.dirname(project.repoPath), { recursive: true });
  const git = simpleGit();
  await git.clone(localPath, project.repoPath, ['--bare', '--local', '--no-hardlinks']);
  const cloned = simpleGit(project.repoPath);
  await cloned.addConfig('user.email', 'pilot@localhost');
  await cloned.addConfig('user.name', 'Pilot');
}

export async function pushToRemote(project: Project, remoteUrl: string, token: string): Promise<void> {
  const authedUrl = remoteUrl.replace('https://', `https://oauth2:${token}@`);
  const git = simpleGit(project.repoPath);
  await git.raw(['push', authedUrl, 'main']);
}

export async function createWorktree(
  project: Project,
  sessionId: string,
  baseBranch = 'main',
  branchName = `agent/${sessionId}`
): Promise<string> {
  const worktreePath = path.join(PROJECTS_ROOT, project.id, 'worktrees', sessionId);
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  const git = simpleGit(project.repoPath);
  await git.raw(['worktree', 'add', '-b', branchName, worktreePath, baseBranch]);
  return worktreePath;
}

export async function removeWorktree(project: Project, worktreePath: string): Promise<void> {
  const git = simpleGit(project.repoPath);
  await git.raw(['worktree', 'remove', '--force', worktreePath]);
}

export async function getDiff(worktreePath: string, baseBranch: string): Promise<string> {
  const git = simpleGit(worktreePath);
  const [committed, staged, unstaged, untracked] = await Promise.all([
    git.diff([`${baseBranch}..HEAD`]).catch(() => ''),  // committed on this branch
    git.diff(['--cached']).catch(() => ''),              // staged but not committed
    git.diff().catch(() => ''),                          // modified but not staged
    untrackedDiff(git),
  ]);
  return [committed, staged, unstaged, untracked].filter(Boolean).join('\n');
}

async function untrackedDiff(git: ReturnType<typeof simpleGit>): Promise<string> {
  const files = (await git.raw(['ls-files', '--others', '--exclude-standard']).catch(() => ''))
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean);

  if (files.length === 0) return '';

  const diffs = await Promise.all(
    files.map(file => git.diff(['--no-index', '--', os.devNull, file]).catch(() => ''))
  );

  return diffs.filter(Boolean).join('\n');
}

export async function mergeWorktree(
  project: Project,
  sessionBranch: string,
  targetBranch: string
): Promise<void> {
  const git    = simpleGit(project.repoPath);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pilot-merge-'));
  try {
    // Bare repos have no working tree — create a temporary one for the merge
    await git.raw(['worktree', 'add', tmpDir, targetBranch]);
    await simpleGit(tmpDir).merge([sessionBranch, '--no-ff', '-m', `Merge ${sessionBranch}`]);
  } finally {
    await git.raw(['worktree', 'remove', '--force', tmpDir]).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Commit any uncommitted changes in a session worktree before merging
export async function commitWorktree(worktreePath: string): Promise<void> {
  const git = simpleGit(worktreePath);
  const status = await git.status();
  if (status.files.length === 0) return;
  await git.add('.');
  await git.commit('agent work');
}

// Plain working directory for non-git (workspace) sessions
export async function createWorkDir(sessionId: string): Promise<string> {
  const workDir = path.join(DATA_DIR, 'workdirs', sessionId);
  await fs.mkdir(workDir, { recursive: true });
  return workDir;
}

export async function removeWorkDir(workDir: string): Promise<void> {
  await fs.rm(workDir, { recursive: true, force: true });
}

// Returns a pseudo-diff showing all files in a workspace work directory
export async function getWorkDirDiff(workDir: string): Promise<string> {
  const files = await listFilesRecursive(workDir);
  if (files.length === 0) return '';
  const MAX_FILES    = 50;
  const MAX_FILE_LEN = 10_000;
  const parts: string[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    try {
      const raw     = await fs.readFile(path.join(workDir, file), 'utf-8');
      const content = raw.length > MAX_FILE_LEN ? raw.slice(0, MAX_FILE_LEN) + '\n…(truncated)' : raw;
      const lines   = content.split('\n');
      const header  = `diff --git a/${file} b/${file}\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@`;
      const body    = lines.map(l => `+${l}`).join('\n');
      parts.push(`${header}\n${body}`);
    } catch { /* binary or unreadable — skip */ }
  }
  if (files.length > MAX_FILES) parts.push(`\n… and ${files.length - MAX_FILES} more files`);
  return parts.join('\n\n');
}

export async function listFilesRecursive(dir: string, base = ''): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) files.push(...await listFilesRecursive(path.join(dir, e.name), rel));
    else files.push(rel);
  }
  return files;
}

// Shared utility: copy task attachment files into a session work directory
export async function copyTaskFilesToWorkDir(taskFilesDir: string, workDir: string): Promise<void> {
  try {
    const files = await fs.readdir(taskFilesDir);
    await Promise.all(files.map(f =>
      fs.copyFile(path.join(taskFilesDir, f), path.join(workDir, f)).catch(() => {})
    ));
  } catch { /* no attachments — fine */ }
}

// Merge all files from a completed session work dir into the persistent project workspace
export async function mergeIntoProjectWorkspace(workDir: string, workspaceDir: string): Promise<void> {
  await fs.mkdir(workspaceDir, { recursive: true });
  const files = await listFilesRecursive(workDir).catch(() => [] as string[]);
  await Promise.all(files.map(async f => {
    const src  = path.join(workDir, f);
    const dest = path.join(workspaceDir, f);
    await fs.mkdir(path.dirname(dest), { recursive: true }).catch(() => {});
    await fs.copyFile(src, dest).catch(() => {});
  }));
}

// Seed a new work directory from the persistent project workspace
export async function seedWorkDirFromWorkspace(workspaceDir: string, workDir: string): Promise<void> {
  const files = await listFilesRecursive(workspaceDir).catch(() => [] as string[]);
  await Promise.all(files.map(async f => {
    const src  = path.join(workspaceDir, f);
    const dest = path.join(workDir, f);
    await fs.mkdir(path.dirname(dest), { recursive: true }).catch(() => {});
    await fs.copyFile(src, dest).catch(() => {});
  }));
}
