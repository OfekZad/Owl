import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import type { Express } from 'express';

describe('API Routes', () => {
  let app: Express;

  beforeEach(() => {
    db.clear();
    app = createApp();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('Sessions API', () => {
    describe('POST /api/sessions', () => {
      it('should create a new session', async () => {
        const response = await request(app).post('/api/sessions');

        expect(response.status).toBe(201);
        expect(response.body.session).toBeDefined();
        expect(response.body.session.id).toBeDefined();
      });
    });

    describe('GET /api/sessions/:id', () => {
      it('should return session by id', async () => {
        const createResponse = await request(app).post('/api/sessions');
        const sessionId = createResponse.body.session.id;

        const response = await request(app).get(`/api/sessions/${sessionId}`);

        expect(response.status).toBe(200);
        expect(response.body.session.id).toBe(sessionId);
      });

      it('should return 404 for non-existent session', async () => {
        const response = await request(app).get('/api/sessions/non-existent');

        expect(response.status).toBe(404);
      });
    });

    describe('DELETE /api/sessions/:id', () => {
      it('should delete session', async () => {
        const createResponse = await request(app).post('/api/sessions');
        const sessionId = createResponse.body.session.id;

        const response = await request(app).delete(`/api/sessions/${sessionId}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should return 404 for non-existent session', async () => {
        const response = await request(app).delete('/api/sessions/non-existent');

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Versions API', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await request(app).post('/api/sessions');
      sessionId = response.body.session.id;
    });

    describe('POST /api/sessions/:id/versions', () => {
      it('should create a new version', async () => {
        const response = await request(app)
          .post(`/api/sessions/${sessionId}/versions`)
          .send({
            filesystemSnapshot: 'https://blob.test/snap.tar.gz',
            chatHistory: [{ id: 'm1', role: 'user', content: 'Hello', createdAt: new Date() }]
          });

        expect(response.status).toBe(201);
        expect(response.body.version).toBeDefined();
        expect(response.body.version.number).toBe(1);
      });
    });

    describe('GET /api/sessions/:id/versions', () => {
      it('should return all versions for session', async () => {
        await request(app)
          .post(`/api/sessions/${sessionId}/versions`)
          .send({ filesystemSnapshot: 'snap1', chatHistory: [] });
        await request(app)
          .post(`/api/sessions/${sessionId}/versions`)
          .send({ filesystemSnapshot: 'snap2', chatHistory: [] });

        const response = await request(app).get(`/api/sessions/${sessionId}/versions`);

        expect(response.status).toBe(200);
        expect(response.body.versions).toHaveLength(2);
      });
    });

    describe('GET /api/versions/:id', () => {
      it('should return version by id', async () => {
        const createResponse = await request(app)
          .post(`/api/sessions/${sessionId}/versions`)
          .send({ filesystemSnapshot: 'snap', chatHistory: [] });
        const versionId = createResponse.body.version.id;

        const response = await request(app).get(`/api/versions/${versionId}`);

        expect(response.status).toBe(200);
        expect(response.body.version.id).toBe(versionId);
      });

      it('should return 404 for non-existent version', async () => {
        const response = await request(app).get('/api/versions/non-existent');

        expect(response.status).toBe(404);
      });
    });

    describe('POST /api/versions/:id/duplicate', () => {
      it('should duplicate a version', async () => {
        const createResponse = await request(app)
          .post(`/api/sessions/${sessionId}/versions`)
          .send({ filesystemSnapshot: 'snap', chatHistory: [] });
        const versionId = createResponse.body.version.id;

        const response = await request(app).post(`/api/versions/${versionId}/duplicate`);

        expect(response.status).toBe(201);
        expect(response.body.version.number).toBe(2);
        expect(response.body.version.parentVersionId).toBe(versionId);
      });

      it('should return 404 for non-existent version', async () => {
        const response = await request(app).post('/api/versions/non-existent/duplicate');

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Chat API', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await request(app).post('/api/sessions');
      sessionId = response.body.session.id;
    });

    describe('POST /api/chat', () => {
      it('should return response for valid chat request', async () => {
        const response = await request(app)
          .post('/api/chat')
          .send({
            sessionId,
            message: 'Hello, build me a todo app',
            history: []
          });

        expect(response.status).toBe(200);
        expect(response.body.message).toBeDefined();
        expect(response.body.message.content).toBeDefined();
      });

      it('should return 400 when sessionId is missing', async () => {
        const response = await request(app)
          .post('/api/chat')
          .send({
            message: 'Hello'
          });

        expect(response.status).toBe(400);
      });

      it('should return 400 when message is missing', async () => {
        const response = await request(app)
          .post('/api/chat')
          .send({
            sessionId
          });

        expect(response.status).toBe(400);
      });
    });
  });
});
