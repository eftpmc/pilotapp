import WebSocket from 'ws';

const globalSubscribers = new Set<WebSocket>();

export function addGlobalSubscriber(ws: WebSocket): void {
  globalSubscribers.add(ws);
}

export function removeGlobalSubscriber(ws: WebSocket): void {
  globalSubscribers.delete(ws);
}

export function broadcastGlobal(type: string, data: Record<string, unknown> = {}): void {
  const msg = JSON.stringify({ type, ...data });
  for (const ws of globalSubscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }
}
