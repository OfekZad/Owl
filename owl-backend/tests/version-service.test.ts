import { describe, it, expect, beforeEach } from 'vitest';
import { VersionService } from '../src/services/version-service.js';
import { SessionService } from '../src/services/session-service.js';
import { db } from '../src/db/index.js';
import type { Message } from '../src/types/index.js';

describe('VersionService', () => {
  let versionService: VersionService;
  let sessionService: SessionService;
  let sessionId: string;

  beforeEach(async () => {
    db.clear();
    versionService = new VersionService();
    sessionService = new SessionService();
    const session = await sessionService.createSession();
    sessionId = session.id;
  });

  describe('createVersion', () => {
    it('should create first version with number 1', async () => {
      const chatHistory: Message[] = [
        { id: 'm1', role: 'user', content: 'Hello', createdAt: new Date() }
      ];

      const version = await versionService.createVersion(
        sessionId,
        'https://blob.test/snapshot1.tar.gz',
        chatHistory
      );

      expect(version).toBeDefined();
      expect(version.number).toBe(1);
      expect(version.sessionId).toBe(sessionId);
      expect(version.filesystemSnapshot).toBe('https://blob.test/snapshot1.tar.gz');
      expect(version.chatHistory).toEqual(chatHistory);
      expect(version.parentVersionId).toBeNull();
    });

    it('should increment version number for subsequent versions', async () => {
      const v1 = await versionService.createVersion(sessionId, 'snap1', []);
      const v2 = await versionService.createVersion(sessionId, 'snap2', []);
      const v3 = await versionService.createVersion(sessionId, 'snap3', []);

      expect(v1.number).toBe(1);
      expect(v2.number).toBe(2);
      expect(v3.number).toBe(3);
    });

    it('should set parentVersionId to previous version', async () => {
      const v1 = await versionService.createVersion(sessionId, 'snap1', []);
      const v2 = await versionService.createVersion(sessionId, 'snap2', []);

      expect(v2.parentVersionId).toBe(v1.id);
    });
  });

  describe('getVersion', () => {
    it('should return version by id', async () => {
      const created = await versionService.createVersion(sessionId, 'snap', []);
      const found = await versionService.getVersion(created.id);

      expect(found).toEqual(created);
    });

    it('should return undefined for non-existent version', async () => {
      const found = await versionService.getVersion('non-existent');

      expect(found).toBeUndefined();
    });
  });

  describe('getVersionsBySession', () => {
    it('should return all versions for session sorted by number', async () => {
      await versionService.createVersion(sessionId, 'snap1', []);
      await versionService.createVersion(sessionId, 'snap2', []);
      await versionService.createVersion(sessionId, 'snap3', []);

      const versions = await versionService.getVersionsBySession(sessionId);

      expect(versions).toHaveLength(3);
      expect(versions[0].number).toBe(1);
      expect(versions[1].number).toBe(2);
      expect(versions[2].number).toBe(3);
    });

    it('should return empty array for session with no versions', async () => {
      const versions = await versionService.getVersionsBySession(sessionId);

      expect(versions).toHaveLength(0);
    });
  });

  describe('duplicateVersion', () => {
    it('should create new version from existing version snapshot', async () => {
      const original = await versionService.createVersion(sessionId, 'snap1', [
        { id: 'm1', role: 'user', content: 'Hello', createdAt: new Date() }
      ]);

      const duplicate = await versionService.duplicateVersion(original.id);

      expect(duplicate).toBeDefined();
      expect(duplicate.number).toBe(2);
      expect(duplicate.filesystemSnapshot).toBe(original.filesystemSnapshot);
      expect(duplicate.parentVersionId).toBe(original.id);
      expect(duplicate.id).not.toBe(original.id);
    });

    it('should return undefined for non-existent version', async () => {
      const duplicate = await versionService.duplicateVersion('non-existent');

      expect(duplicate).toBeUndefined();
    });
  });

  describe('updateVersion', () => {
    it('should update version fields', async () => {
      const version = await versionService.createVersion(sessionId, 'snap', []);
      const updated = await versionService.updateVersion(version.id, {
        vercelDeploymentId: 'dpl_123',
        previewUrl: 'https://preview.vercel.app'
      });

      expect(updated?.vercelDeploymentId).toBe('dpl_123');
      expect(updated?.previewUrl).toBe('https://preview.vercel.app');
    });
  });
});
