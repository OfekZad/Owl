import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { SessionService } from './services/session-service.js';
import { VersionService } from './services/version-service.js';
import { ChatService } from './services/chat-service.js';
import { SandboxService } from './services/sandbox-service.js';
import type { Activity } from './types/index.js';

// Broadcast callback will be set by index.ts
let broadcastCallback: ((sessionId: string, activity: Activity) => void) | null = null;

export function setBroadcastCallback(callback: (sessionId: string, activity: Activity) => void): void {
  broadcastCallback = callback;
}

export function createApp(): Express {
  const app = express();
  const sessionService = new SessionService();
  const versionService = new VersionService();

  // Broadcast helper
  const broadcast = (sessionId: string, activity: Activity) => {
    if (broadcastCallback) {
      broadcastCallback(sessionId, activity);
    }
  };

  // Create sandbox service with broadcast callback
  const sandboxService = new SandboxService(broadcast);

  // Create chat service with sandbox access
  const chatService = new ChatService(sandboxService, broadcast);

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }));
  app.use(express.json());

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Sessions API
  app.post('/api/sessions', async (_req: Request, res: Response) => {
    try {
      const session = await sessionService.createSession();
      res.status(201).json({ session });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  app.get('/api/sessions/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = await sessionService.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json({ session });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  app.delete('/api/sessions/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const deleted = await sessionService.deleteSession(id);
      if (!deleted) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // Versions API
  app.post('/api/sessions/:id/versions', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { filesystemSnapshot, chatHistory } = req.body;
      const version = await versionService.createVersion(
        id,
        filesystemSnapshot,
        chatHistory
      );
      res.status(201).json({ version });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create version' });
    }
  });

  app.get('/api/sessions/:id/versions', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const versions = await versionService.getVersionsBySession(id);
      res.json({ versions });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get versions' });
    }
  });

  app.get('/api/versions/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const version = await versionService.getVersion(id);
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      res.json({ version });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get version' });
    }
  });

  app.post('/api/versions/:id/duplicate', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const version = await versionService.duplicateVersion(id);
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      res.status(201).json({ version });
    } catch (error) {
      res.status(500).json({ error: 'Failed to duplicate version' });
    }
  });

  // Chat API
  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const { sessionId, message, history } = req.body;

      if (!sessionId || !message) {
        res.status(400).json({ error: 'sessionId and message are required' });
        return;
      }

      const response = await chatService.chat(sessionId, message, history || []);
      res.json({ message: response });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  // Sandbox API

  // Create sandbox for a session
  app.post('/api/sessions/:id/sandbox', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const { sandboxId, previewUrl } = await sandboxService.createSandbox(sessionId);

      // Update session with sandbox info
      await sessionService.updateSession(sessionId, {
        sandboxId,
        previewUrl
      });

      res.status(201).json({ sandboxId, previewUrl });
    } catch (error) {
      console.error('Sandbox creation error:', error);
      res.status(500).json({ error: 'Failed to create sandbox' });
    }
  });

  // Get sandbox status
  app.get('/api/sessions/:id/sandbox', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const status = sandboxService.getSandboxStatus(sessionId);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get sandbox status' });
    }
  });

  // Execute command in sandbox
  app.post('/api/sessions/:id/sandbox/execute', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { command } = req.body;

      if (!command) {
        res.status(400).json({ error: 'command is required' });
        return;
      }

      const result = await sandboxService.executeCommand(sessionId, command);
      res.json(result);
    } catch (error) {
      console.error('Command execution error:', error);
      const message = error instanceof Error ? error.message : 'Failed to execute command';
      res.status(500).json({ error: message });
    }
  });

  // Write file to sandbox
  app.post('/api/sessions/:id/sandbox/files', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { path, content } = req.body;

      if (!path || content === undefined) {
        res.status(400).json({ error: 'path and content are required' });
        return;
      }

      await sandboxService.writeFile(sessionId, path, content);
      res.json({ success: true, path });
    } catch (error) {
      console.error('File write error:', error);
      const message = error instanceof Error ? error.message : 'Failed to write file';
      res.status(500).json({ error: message });
    }
  });

  // Read file from sandbox
  app.get('/api/sessions/:id/sandbox/files', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const path = req.query.path as string;

      if (!path) {
        res.status(400).json({ error: 'path query parameter is required' });
        return;
      }

      const content = await sandboxService.readFile(sessionId, path);
      res.json({ path, content });
    } catch (error) {
      console.error('File read error:', error);
      const message = error instanceof Error ? error.message : 'Failed to read file';
      res.status(500).json({ error: message });
    }
  });

  // List files in sandbox directory
  app.get('/api/sessions/:id/sandbox/files/list', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const path = (req.query.path as string) || '/';

      const files = await sandboxService.listFiles(sessionId, path);
      res.json({ path, files });
    } catch (error) {
      console.error('File list error:', error);
      const message = error instanceof Error ? error.message : 'Failed to list files';
      res.status(500).json({ error: message });
    }
  });

  // Start dev server in sandbox
  app.post('/api/sessions/:id/sandbox/server', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { port = 3000 } = req.body;

      const previewUrl = await sandboxService.startDevServer(sessionId, port);

      // Update session with preview URL
      await sessionService.updateSession(sessionId, { previewUrl });

      res.json({ previewUrl });
    } catch (error) {
      console.error('Dev server error:', error);
      const message = error instanceof Error ? error.message : 'Failed to start dev server';
      res.status(500).json({ error: message });
    }
  });

  // Close sandbox
  app.delete('/api/sessions/:id/sandbox', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      await sandboxService.closeSandbox(sessionId);

      // Clear sandbox info from session
      await sessionService.updateSession(sessionId, {
        sandboxId: null,
        previewUrl: null
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Sandbox close error:', error);
      res.status(500).json({ error: 'Failed to close sandbox' });
    }
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
