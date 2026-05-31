import 'dotenv/config';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import app from './app';
import { attachWebSocket } from './services/socket';
import { db } from './db';

// On startup: mark any sessions that were mid-run when the server died as error.
db.prepare("UPDATE sessions SET status = 'error' WHERE status = 'running' OR status = 'idle'").run();
db.prepare("UPDATE tasks SET status = 'failed', completed_at = ? WHERE status = 'running'").run(new Date().toISOString());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
attachWebSocket(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`pilotapp server running on :${PORT}`);
});
