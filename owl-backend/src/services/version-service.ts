import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import type { Version, Message } from '../types/index.js';

export class VersionService {
  async createVersion(
    sessionId: string,
    filesystemSnapshot: string,
    chatHistory: Message[]
  ): Promise<Version> {
    const versions = db.getVersionsBySession(sessionId);
    const nextNumber = versions.length + 1;
    const parentVersion = versions[versions.length - 1];

    const version: Version = {
      id: uuidv4(),
      sessionId,
      parentVersionId: parentVersion?.id ?? null,
      number: nextNumber,
      filesystemSnapshot,
      chatHistory,
      vercelDeploymentId: null,
      previewUrl: null,
      createdAt: new Date()
    };

    return db.createVersion(version);
  }

  async getVersion(id: string): Promise<Version | undefined> {
    return db.getVersion(id);
  }

  async getVersionsBySession(sessionId: string): Promise<Version[]> {
    return db.getVersionsBySession(sessionId);
  }

  async duplicateVersion(versionId: string): Promise<Version | undefined> {
    const source = db.getVersion(versionId);
    if (!source) return undefined;

    const versions = db.getVersionsBySession(source.sessionId);
    const nextNumber = versions.length + 1;

    const duplicate: Version = {
      id: uuidv4(),
      sessionId: source.sessionId,
      parentVersionId: source.id,
      number: nextNumber,
      filesystemSnapshot: source.filesystemSnapshot,
      chatHistory: [...source.chatHistory],
      vercelDeploymentId: null,
      previewUrl: null,
      createdAt: new Date()
    };

    return db.createVersion(duplicate);
  }

  async updateVersion(id: string, updates: Partial<Version>): Promise<Version | undefined> {
    return db.updateVersion(id, updates);
  }
}
