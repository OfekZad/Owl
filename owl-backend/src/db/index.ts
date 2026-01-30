import type { Session, Version, Activity } from '../types/index.js';

class InMemoryDB {
  private sessions: Map<string, Session> = new Map();
  private versions: Map<string, Version> = new Map();
  private activities: Map<string, Activity[]> = new Map();

  // Sessions
  createSession(session: Session): Session {
    this.sessions.set(session.id, session);
    this.activities.set(session.id, []);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates, updatedAt: new Date() };
    this.sessions.set(id, updated);
    return updated;
  }

  deleteSession(id: string): boolean {
    this.activities.delete(id);
    return this.sessions.delete(id);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  // Versions
  createVersion(version: Version): Version {
    this.versions.set(version.id, version);
    return version;
  }

  getVersion(id: string): Version | undefined {
    return this.versions.get(id);
  }

  getVersionsBySession(sessionId: string): Version[] {
    return Array.from(this.versions.values())
      .filter(v => v.sessionId === sessionId)
      .sort((a, b) => a.number - b.number);
  }

  updateVersion(id: string, updates: Partial<Version>): Version | undefined {
    const version = this.versions.get(id);
    if (!version) return undefined;
    const updated = { ...version, ...updates };
    this.versions.set(id, updated);
    return updated;
  }

  getNextVersionNumber(sessionId: string): number {
    const versions = this.getVersionsBySession(sessionId);
    return versions.length + 1;
  }

  // Activities
  addActivity(sessionId: string, activity: Activity): Activity {
    const activities = this.activities.get(sessionId) || [];
    activities.push(activity);
    this.activities.set(sessionId, activities);
    return activity;
  }

  getActivities(sessionId: string): Activity[] {
    return this.activities.get(sessionId) || [];
  }

  clearActivities(sessionId: string): void {
    this.activities.set(sessionId, []);
  }

  // Utility
  clear(): void {
    this.sessions.clear();
    this.versions.clear();
    this.activities.clear();
  }
}

export const db = new InMemoryDB();
