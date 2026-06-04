import { describe, test, expect, vi } from 'vitest';
import request from 'supertest';
import { spawn } from 'child_process';
import app from '../app';
import { scaffold } from './helpers';

const raw = vi.fn(async (args: string[]) => {
  if (args[0] === 'ls-tree') return 'package.json\nindex.html\nsrc/app.ts\n';
  if (args[0] === 'show' && args[1] === 'main:package.json') {
    return JSON.stringify({ scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' } });
  }
  if (args[0] === 'worktree') return '';
  return '';
});

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({ raw })),
}));

describe('project app runtime routes', () => {
  test('returns package scripts and renderable html entries', async () => {
    const { project, token } = scaffold();

    const res = await request(app)
      .get(`/projects/${project.id}/app-info`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.scripts).toEqual({ dev: 'vite --host 0.0.0.0', build: 'vite build' });
    expect(res.body.htmlEntries).toEqual(['index.html']);
    expect(res.body.status.running).toBe(false);
  });

  test('starts only known package scripts', async () => {
    const { project, token } = scaffold();

    const rejected = await request(app)
      .post(`/projects/${project.id}/app/start`)
      .set('Authorization', `Bearer ${token}`)
      .send({ script: 'missing' });

    expect(rejected.status).toBe(400);

    const started = await request(app)
      .post(`/projects/${project.id}/app/start`)
      .set('Authorization', `Bearer ${token}`)
      .send({ script: 'dev' });

    expect(started.status).toBe(201);
    expect(spawn).toHaveBeenCalledWith(
      'npm run dev',
      [],
      expect.objectContaining({ shell: true, stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });
});
