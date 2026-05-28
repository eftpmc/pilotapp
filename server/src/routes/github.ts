import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Proxy the GitHub repo list so the app doesn't need to store the PAT anywhere except Keychain.
// The token comes in as a header from the app.
router.get('/repos', async (req: Request, res: Response) => {
  const token = req.headers['x-github-token'] as string;
  if (!token) {
    res.status(401).json({ error: 'Missing X-GitHub-Token header' });
    return;
  }

  const ghRes = await fetch(
    'https://api.github.com/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator',
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  );

  if (!ghRes.ok) {
    res.status(ghRes.status).json({ error: 'GitHub API error' });
    return;
  }

  const repos = await ghRes.json();
  res.json(repos);
});

export default router;
