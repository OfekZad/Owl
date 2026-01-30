import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import type { Activity } from '../types/index.js';

interface AddActivityInput {
  type: Activity['type'];
  data: Record<string, unknown>;
}

export class ActivityService {
  async addActivity(sessionId: string, input: AddActivityInput): Promise<Activity> {
    const activity: Activity = {
      id: uuidv4(),
      sessionId,
      type: input.type,
      data: input.data,
      timestamp: new Date()
    };

    return db.addActivity(sessionId, activity);
  }

  async getActivities(sessionId: string): Promise<Activity[]> {
    return db.getActivities(sessionId);
  }

  async clearActivities(sessionId: string): Promise<void> {
    db.clearActivities(sessionId);
  }
}
