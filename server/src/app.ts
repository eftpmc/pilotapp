import express from 'express';
import path from 'path';
import authRoutes       from './routes/auth';
import projectRoutes    from './routes/projects';
import sessionRoutes    from './routes/sessions';
import agentRoutes      from './routes/agents';
import taskRoutes       from './routes/tasks';
import githubRoutes     from './routes/github';
import settingsRoutes   from './routes/settings';
import connectionsRoutes from './routes/connections';
import specsRoutes      from './routes/specs';
import knowledgeRoutes  from './routes/knowledge';
import departmentRoutes from './routes/departments';
import eventsRoutes     from './routes/events';
import shiftsRoutes     from './routes/shifts';
import toolsRoutes      from './routes/tools';
import { agentHealth }  from './services/agents';

const app = express();
app.use(express.json({ limit: '4mb' }));

const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

app.use('/auth',        authRoutes);
app.use('/projects',    projectRoutes);
app.use('/employees',   agentRoutes);
app.use('/brains',      connectionsRoutes);
app.use('/specs',       specsRoutes);
app.use('/tasks',       taskRoutes);
app.use('/sessions',    sessionRoutes);
app.use('/github',      githubRoutes);
app.use('/settings',    settingsRoutes);
app.use('/knowledge',   knowledgeRoutes);
app.use('/departments', departmentRoutes);
app.use('/events',      eventsRoutes);
app.use('/shifts',      shiftsRoutes);
app.use('/tools',       toolsRoutes);

app.get('/health', (_req, res) => res.json({ ok: true, agents: agentHealth() }));

app.use((_req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).json({ error: 'Not found' });
  });
});

export default app;
