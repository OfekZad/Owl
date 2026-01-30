import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/index.js';
import type { Session, Version, Activity } from '../src/types/index.js';

describe('InMemoryDB', () => {
  beforeEach(() => {
    db.clear();
  });

  describe('Sessions', () => {
    it('should create a session', () => {
      const session: Session = {
        id: 'session-1',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const created = db.createSession(session);
      expect(created).toEqual(session);
    });

    it('should get a session by id', () => {
      const session: Session = {
        id: 'session-1',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      db.createSession(session);
      const found = db.getSession('session-1');
      expect(found).toEqual(session);
    });

    it('should return undefined for non-existent session', () => {
      const found = db.getSession('non-existent');
      expect(found).toBeUndefined();
    });

    it('should update a session', () => {
      const oldDate = new Date('2020-01-01');
      const session: Session = {
        id: 'session-1',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: oldDate,
        updatedAt: oldDate
      };

      db.createSession(session);
      const updated = db.updateSession('session-1', { currentVersionId: 'v1' });

      expect(updated?.currentVersionId).toBe('v1');
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('should delete a session', () => {
      const session: Session = {
        id: 'session-1',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      db.createSession(session);
      const deleted = db.deleteSession('session-1');

      expect(deleted).toBe(true);
      expect(db.getSession('session-1')).toBeUndefined();
    });

    it('should get all sessions', () => {
      const session1: Session = {
        id: 'session-1',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const session2: Session = {
        id: 'session-2',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      db.createSession(session1);
      db.createSession(session2);

      const sessions = db.getAllSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('Versions', () => {
    it('should create a version', () => {
      const version: Version = {
        id: 'v1',
        sessionId: 'session-1',
        parentVersionId: null,
        number: 1,
        filesystemSnapshot: 'https://blob.vercel.com/snapshot1',
        chatHistory: [],
        vercelDeploymentId: null,
        previewUrl: null,
        createdAt: new Date()
      };

      const created = db.createVersion(version);
      expect(created).toEqual(version);
    });

    it('should get versions by session sorted by number', () => {
      const v1: Version = {
        id: 'v1',
        sessionId: 'session-1',
        parentVersionId: null,
        number: 1,
        filesystemSnapshot: '',
        chatHistory: [],
        vercelDeploymentId: null,
        previewUrl: null,
        createdAt: new Date()
      };
      const v2: Version = {
        id: 'v2',
        sessionId: 'session-1',
        parentVersionId: 'v1',
        number: 2,
        filesystemSnapshot: '',
        chatHistory: [],
        vercelDeploymentId: null,
        previewUrl: null,
        createdAt: new Date()
      };

      db.createVersion(v2);
      db.createVersion(v1);

      const versions = db.getVersionsBySession('session-1');
      expect(versions).toHaveLength(2);
      expect(versions[0].number).toBe(1);
      expect(versions[1].number).toBe(2);
    });

    it('should get next version number', () => {
      const v1: Version = {
        id: 'v1',
        sessionId: 'session-1',
        parentVersionId: null,
        number: 1,
        filesystemSnapshot: '',
        chatHistory: [],
        vercelDeploymentId: null,
        previewUrl: null,
        createdAt: new Date()
      };

      db.createVersion(v1);
      const nextNumber = db.getNextVersionNumber('session-1');
      expect(nextNumber).toBe(2);
    });

    it('should return 1 for first version', () => {
      const nextNumber = db.getNextVersionNumber('session-1');
      expect(nextNumber).toBe(1);
    });
  });

  describe('Activities', () => {
    it('should add activity to session', () => {
      const session: Session = {
        id: 'session-1',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      db.createSession(session);

      const activity: Activity = {
        id: 'act-1',
        sessionId: 'session-1',
        type: 'tool_call',
        data: { tool: 'Bash', command: 'npm install' },
        timestamp: new Date()
      };

      const added = db.addActivity('session-1', activity);
      expect(added).toEqual(activity);
    });

    it('should get activities for session', () => {
      const session: Session = {
        id: 'session-1',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      db.createSession(session);

      const activity: Activity = {
        id: 'act-1',
        sessionId: 'session-1',
        type: 'terminal',
        data: { output: 'Hello world' },
        timestamp: new Date()
      };

      db.addActivity('session-1', activity);
      const activities = db.getActivities('session-1');
      expect(activities).toHaveLength(1);
    });

    it('should clear activities', () => {
      const session: Session = {
        id: 'session-1',
        currentVersionId: null,
        sandboxId: null,
        previewUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      db.createSession(session);

      const activity: Activity = {
        id: 'act-1',
        sessionId: 'session-1',
        type: 'terminal',
        data: {},
        timestamp: new Date()
      };

      db.addActivity('session-1', activity);
      db.clearActivities('session-1');

      const activities = db.getActivities('session-1');
      expect(activities).toHaveLength(0);
    });
  });
});
