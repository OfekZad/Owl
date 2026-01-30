import { config } from 'dotenv';
config();

import { createApp } from './app.js';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const PORT = process.env.PORT || 3001;

const app = createApp();
const server = http.createServer(app);

// WebSocket server for real-time activity streaming
const wss = new WebSocketServer({ server, path: '/ws' });

// Store active connections by session
const sessionConnections = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    ws.close(1008, 'Session ID required');
    return;
  }

  // Add connection to session
  if (!sessionConnections.has(sessionId)) {
    sessionConnections.set(sessionId, new Set());
  }
  sessionConnections.get(sessionId)!.add(ws);

  console.log(`Client connected to session ${sessionId}`);

  ws.on('close', () => {
    sessionConnections.get(sessionId)?.delete(ws);
    if (sessionConnections.get(sessionId)?.size === 0) {
      sessionConnections.delete(sessionId);
    }
    console.log(`Client disconnected from session ${sessionId}`);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for session ${sessionId}:`, error);
  });
});

// Export broadcast function for use by other modules
export function broadcastActivity(sessionId: string, activity: unknown): void {
  const connections = sessionConnections.get(sessionId);
  if (!connections) return;

  const message = JSON.stringify(activity);
  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

server.listen(PORT, () => {
  console.log(`Owl Backend running on port ${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}/ws`);
});
