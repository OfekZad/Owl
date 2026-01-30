import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import type { Session } from '../types/index.js';

export class SessionService {
  async createSession(): Promise<Session> {
    const session: Session = {
      id: uuidv4(),
      currentVersionId: null,
      sandboxId: null,
      previewUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return db.createSession(session);
  }

  async getSession(id: string): Promise<Session | undefined> {
    return db.getSession(id);
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined> {
    return db.updateSession(id, updates);
  }

  async deleteSession(id: string): Promise<boolean> {
    return db.deleteSession(id);
  }

  async listSessions(): Promise<Session[]> {
    return db.getAllSessions();
  }
}
