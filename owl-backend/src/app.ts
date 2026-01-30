import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { SessionService } from './services/session-service.js';
import { VersionService } from './services/version-service.js';
import { ChatService } from './services/chat-service.js';

export function createApp(): Express {
  const app = express();
  const sessionService = new SessionService();
  const versionService = new VersionService();
  const chatService = new ChatService();

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

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
