import { describe, it, expect, beforeEach } from 'vitest';
import { SessionService } from '../src/services/session-service.js';
import { db } from '../src/db/index.js';

describe('SessionService', () => {
  let sessionService: SessionService;

  beforeEach(() => {
    db.clear();
    sessionService = new SessionService();
  });

  describe('createSession', () => {
    it('should create a new session with unique id', async () => {
      const session = await sessionService.createSession();

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.id.length).toBeGreaterThan(0);
      expect(session.currentVersionId).toBeNull();
      expect(session.sandboxId).toBeNull();
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('should create sessions with unique ids', async () => {
      const session1 = await sessionService.createSession();
      const session2 = await sessionService.createSession();

      expect(session1.id).not.toBe(session2.id);
    });

    it('should persist session to database', async () => {
      const session = await sessionService.createSession();
      const found = await sessionService.getSession(session.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(session.id);
    });
  });

  describe('getSession', () => {
    it('should return session by id', async () => {
      const created = await sessionService.createSession();
      const found = await sessionService.getSession(created.id);

      expect(found).toEqual(created);
    });

    it('should return undefined for non-existent session', async () => {
      const found = await sessionService.getSession('non-existent-id');

      expect(found).toBeUndefined();
    });
  });

  describe('updateSession', () => {
    it('should update session fields', async () => {
      const session = await sessionService.createSession();
      const updated = await sessionService.updateSession(session.id, {
        currentVersionId: 'version-1',
        sandboxId: 'sandbox-123'
      });

      expect(updated?.currentVersionId).toBe('version-1');
      expect(updated?.sandboxId).toBe('sandbox-123');
    });

    it('should return undefined for non-existent session', async () => {
      const updated = await sessionService.updateSession('non-existent', {
        currentVersionId: 'v1'
      });

      expect(updated).toBeUndefined();
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', async () => {
      const session = await sessionService.createSession();
      const deleted = await sessionService.deleteSession(session.id);

      expect(deleted).toBe(true);
      expect(await sessionService.getSession(session.id)).toBeUndefined();
    });

    it('should return false for non-existent session', async () => {
      const deleted = await sessionService.deleteSession('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('listSessions', () => {
    it('should return all sessions', async () => {
      await sessionService.createSession();
      await sessionService.createSession();
      await sessionService.createSession();

      const sessions = await sessionService.listSessions();

      expect(sessions).toHaveLength(3);
    });

    it('should return empty array when no sessions', async () => {
      const sessions = await sessionService.listSessions();

      expect(sessions).toHaveLength(0);
    });
  });
});
