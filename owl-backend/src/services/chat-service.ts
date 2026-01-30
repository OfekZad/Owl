import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../types/index.js';

const OWL_SYSTEM_PROMPT = `You are Owl, an expert AI agent that creates web applications.

## Your Capabilities
- Create complete Next.js/React applications
- Use shadcn/ui components for all UI elements
- Write TypeScript code
- Execute bash commands in an isolated sandbox
- Install npm packages
- Preview generated applications

## Code Generation Guidelines
1. Always use shadcn/ui components when available
2. Use Tailwind CSS for styling
3. Write clean, production-ready TypeScript
4. Create proper file structure for Next.js projects
5. Include proper imports and exports

## Available shadcn/ui Components
Button, Card, Dialog, Input, Select, Textarea, Tabs, ScrollArea, Separator, Tooltip, and more.

## Workflow
1. Understand user requirements
2. Plan the application structure
3. Create files using code blocks
4. Install required dependencies
5. Generate code for each component
6. Iterate based on user feedback

## Keep Solutions Simple
- Only make changes that are directly requested
- Don't add features beyond what was asked
- A bug fix doesn't need surrounding code cleaned up`;

interface ChatResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    status: string;
  }>;
}

export class ChatService {
  private client: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && !apiKey.includes('ENCRYPTED')) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async chat(sessionId: string, userMessage: string, history: Message[]): Promise<ChatResponse> {
    // If no API key configured, return a helpful response
    if (!this.client) {
      return {
        content: `I'm Owl, your AI web app generator!

To enable full AI capabilities, please add your ANTHROPIC_API_KEY to the .env file.

For now, I can help you understand what I'm capable of:
- I can create complete Next.js applications
- I use shadcn/ui components for beautiful UIs
- I write TypeScript code
- I can iterate on your designs based on feedback

Once the API key is configured, just describe the app you want to build and I'll create it for you!`
      };
    }

    try {
      // Convert history to Anthropic message format
      const messages: Anthropic.MessageParam[] = history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      // Add the new user message
      messages.push({
        role: 'user',
        content: userMessage
      });

      const response = await this.client.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 4096,
        system: OWL_SYSTEM_PROMPT,
        messages
      });

      // Extract text content from response
      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      return {
        content: textContent || 'I apologize, but I could not generate a response. Please try again.'
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw error;
    }
  }
}
