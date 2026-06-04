import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import app from './app';
import { attachWebSocket } from './services/socket';
import { failInterruptedWork } from './services/lifecycle';
import { resumePendingTasks } from './services/agents';
import { ensureAdminExists } from './services/bootstrap';

// Mark sessions that were mid-run as error, reset their tasks to pending for re-assignment.
failInterruptedWork();
void resumePendingTasks();
void ensureAdminExists();

// Clean up MCP config files left over from a crashed or killed server.
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
try {
  const orphans = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('-mcp.json'));
  for (const f of orphans) fs.unlinkSync(path.join(DATA_DIR, f));
  if (orphans.length > 0) console.log(`[startup] Cleaned up ${orphans.length} orphaned MCP config file(s)`);
} catch { /* DATA_DIR may not exist on first boot */ }

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
attachWebSocket(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`pilotapp server running on :${PORT}`);
});
