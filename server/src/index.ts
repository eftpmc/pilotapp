import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import sessionRoutes from './routes/sessions';
import agentRoutes from './routes/agents';
import taskRoutes from './routes/tasks';
import githubRoutes from './routes/github';
import settingsRoutes from './routes/settings';
import { agentHealth } from './services/agents';
import { attachWebSocket } from './services/socket';

const app = express();
app.use(express.json());

// Serve web UI static files in production
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

app.use('/auth', authRoutes);
app.use('/projects', projectRoutes);
app.use('/agents', agentRoutes);
app.use('/tasks', taskRoutes);
app.use('/sessions', sessionRoutes);
app.use('/github', githubRoutes);
app.use('/settings', settingsRoutes);

app.get('/health', (_req, res) => res.json({ ok: true, agents: agentHealth() }));

// Fall through to web UI for any non-API route
app.use((_req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).json({ error: 'Not found' });
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
attachWebSocket(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`pilotapp server running on :${PORT}`);
});
