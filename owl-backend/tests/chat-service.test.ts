import { describe, it, expect, beforeEach } from 'vitest';
import { ChatService } from '../src/services/chat-service.js';

describe('ChatService', () => {
  let chatService: ChatService;

  beforeEach(() => {
    // Create service without API key to test fallback behavior
    chatService = new ChatService();
  });

  describe('chat', () => {
    it('should return helpful response when API key not configured', async () => {
      const response = await chatService.chat('session-1', 'Build a todo app', []);

      expect(response.content).toContain('Owl');
      expect(response.content).toContain('ANTHROPIC_API_KEY');
    });

    it('should include capability information in fallback response', async () => {
      const response = await chatService.chat('session-1', 'Hello', []);

      expect(response.content).toContain('Next.js');
      expect(response.content).toContain('shadcn/ui');
      expect(response.content).toContain('TypeScript');
    });
  });
});
