import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import sessionRoutes from './routes/sessions';
import agentRoutes from './routes/agents';
import taskRoutes from './routes/tasks';
import githubRoutes from './routes/github';
import { attachWebSocket } from './services/socket';

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/projects', projectRoutes);
app.use('/agents', agentRoutes);
app.use('/tasks', taskRoutes);
app.use('/sessions', sessionRoutes);
app.use('/github', githubRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
attachWebSocket(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`pilotapp server running on :${PORT}`);
});
