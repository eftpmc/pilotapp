import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { Project } from '../types';

const PROJECTS_ROOT = path.resolve(process.env.PROJECTS_ROOT || './data/projects');

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
  baseBranch = 'main'
): Promise<string> {
  const worktreePath = path.join(PROJECTS_ROOT, project.id, 'worktrees', sessionId);
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  const git = simpleGit(project.repoPath);
  const branch = `agent/${sessionId}`;
  await git.raw(['worktree', 'add', '-b', branch, worktreePath, baseBranch]);
  return worktreePath;
}

export async function removeWorktree(project: Project, worktreePath: string): Promise<void> {
  const git = simpleGit(project.repoPath);
  await git.raw(['worktree', 'remove', '--force', worktreePath]);
}

export async function getDiff(worktreePath: string, baseBranch: string): Promise<string> {
  const git = simpleGit(worktreePath);
  const [committed, staged, unstaged] = await Promise.all([
    git.diff([`${baseBranch}..HEAD`]).catch(() => ''),  // committed on this branch
    git.diff(['--cached']).catch(() => ''),              // staged but not committed
    git.diff().catch(() => ''),                          // modified but not staged
  ]);
  return [committed, staged, unstaged].filter(Boolean).join('\n');
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
