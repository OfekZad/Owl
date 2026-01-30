import { describe, it, expect, beforeEach } from 'vitest';
import { ActivityService } from '../src/services/activity-service.js';
import { SessionService } from '../src/services/session-service.js';
import { db } from '../src/db/index.js';

describe('ActivityService', () => {
  let activityService: ActivityService;
  let sessionService: SessionService;
  let sessionId: string;

  beforeEach(async () => {
    db.clear();
    activityService = new ActivityService();
    sessionService = new SessionService();
    const session = await sessionService.createSession();
    sessionId = session.id;
  });

  describe('addActivity', () => {
    it('should add activity with unique id', async () => {
      const activity = await activityService.addActivity(sessionId, {
        type: 'tool_call',
        data: { tool: 'Bash', command: 'npm install' }
      });

      expect(activity.id).toBeDefined();
      expect(activity.sessionId).toBe(sessionId);
      expect(activity.type).toBe('tool_call');
      expect(activity.timestamp).toBeInstanceOf(Date);
    });

    it('should support different activity types', async () => {
      const toolCall = await activityService.addActivity(sessionId, {
        type: 'tool_call',
        data: { tool: 'Bash' }
      });
      const terminal = await activityService.addActivity(sessionId, {
        type: 'terminal',
        data: { output: 'Hello' }
      });
      const fileChange = await activityService.addActivity(sessionId, {
        type: 'file_change',
        data: { path: '/src/app.tsx' }
      });
      const preview = await activityService.addActivity(sessionId, {
        type: 'preview_ready',
        data: { url: 'https://preview.e2b.dev' }
      });

      expect(toolCall.type).toBe('tool_call');
      expect(terminal.type).toBe('terminal');
      expect(fileChange.type).toBe('file_change');
      expect(preview.type).toBe('preview_ready');
    });
  });

  describe('getActivities', () => {
    it('should return activities for session in order', async () => {
      await activityService.addActivity(sessionId, { type: 'tool_call', data: { order: 1 } });
      await activityService.addActivity(sessionId, { type: 'terminal', data: { order: 2 } });
      await activityService.addActivity(sessionId, { type: 'file_change', data: { order: 3 } });

      const activities = await activityService.getActivities(sessionId);

      expect(activities).toHaveLength(3);
      expect(activities[0].data).toEqual({ order: 1 });
      expect(activities[1].data).toEqual({ order: 2 });
      expect(activities[2].data).toEqual({ order: 3 });
    });

    it('should return empty array for session with no activities', async () => {
      const newSession = await sessionService.createSession();
      const activities = await activityService.getActivities(newSession.id);

      expect(activities).toHaveLength(0);
    });
  });

  describe('clearActivities', () => {
    it('should clear all activities for session', async () => {
      await activityService.addActivity(sessionId, { type: 'tool_call', data: {} });
      await activityService.addActivity(sessionId, { type: 'terminal', data: {} });

      await activityService.clearActivities(sessionId);
      const activities = await activityService.getActivities(sessionId);

      expect(activities).toHaveLength(0);
    });
  });
});
