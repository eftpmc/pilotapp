import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { Project } from '../types';

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || './data/projects';

// Well-known SHA1 of git's empty tree object — valid in any git repo.
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export async function initRepo(project: Project): Promise<void> {
  await fs.mkdir(project.repoPath, { recursive: true });
  const git = simpleGit(project.repoPath);
  await git.init(['--bare']);
  await git.addConfig('user.email', 'pilot@localhost');
  await git.addConfig('user.name', 'Pilot');
  // Bare repos have no working tree — create initial commit via plumbing.
  // commit-tree respects user.name / user.email configs set above.
  const commitHash = (await git.raw(['commit-tree', EMPTY_TREE_HASH, '-m', 'init'])).trim();
  await git.raw(['update-ref', 'refs/heads/main', commitHash]);
}

export async function cloneRepo(project: Project, cloneUrl: string, token: string): Promise<void> {
  await fs.mkdir(path.dirname(project.repoPath), { recursive: true });
  // Embed token in URL for private repo access
  const authedUrl = cloneUrl.replace('https://', `https://oauth2:${token}@`);
  const git = simpleGit();
  await git.clone(authedUrl, project.repoPath);
  // Set identity for agent commits
  const cloned = simpleGit(project.repoPath);
  await cloned.addConfig('user.email', 'pilot@localhost');
  await cloned.addConfig('user.name', 'Pilot');
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

export async function getDiff(worktreePath: string, baseBranch = 'main'): Promise<string> {
  const git = simpleGit(worktreePath);
  return git.diff([`${baseBranch}...HEAD`]);
}

export async function mergeWorktree(
  project: Project,
  sessionBranch: string,
  targetBranch = 'main'
): Promise<void> {
  const git = simpleGit(project.repoPath);
  await git.checkout(targetBranch);
  await git.merge([sessionBranch, '--no-ff', '-m', `Merge ${sessionBranch}`]);
  await git.checkout('--detach');
}
