import Anthropic from '@anthropic-ai/sdk';
import { SandboxService } from './sandbox-service.js';
import type { Message, Activity } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

type BroadcastCallback = (sessionId: string, activity: Activity) => void;

// Claude's tools - direct sandbox access
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'write_file',
    description: 'Write or update a file. Changes appear instantly in preview via hot-reload.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path (e.g., "app/page.tsx", "components/Button.tsx")' },
        content: { type: 'string', description: 'Complete file content' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'run_command',
    description: 'Run a shell command. Use for npm install, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Command to run' }
      },
      required: ['command']
    }
  }
];

// Files to include in Claude's context
const CONTEXT_FILES = [
  'package.json',
  'app/layout.tsx',
  'app/page.tsx',
  'app/globals.css',
  'tailwind.config.js',
  'tailwind.config.ts'
];

const SYSTEM_PROMPT = `You are Owl, an AI that builds web applications.

You have direct access to a sandbox with a Next.js project. When you write files, changes appear instantly in the preview via hot-reload.

## Your Tools
- write_file: Create or update files. Hot-reload shows changes immediately.
- run_command: Run shell commands (npm install, etc.)

## Guidelines
1. Use Tailwind CSS for styling
2. Keep code simple and focused
3. After adding new dependencies to package.json, run "npm install"

When the user asks for something, just build it by writing the necessary files. The preview updates automatically.

## Current Project State
The files below show the current state of the project. Modify them as needed.
`;

export class ChatService {
  private client: Anthropic | null = null;
  private sandboxService: SandboxService;
  private broadcastActivity: BroadcastCallback;

  constructor(sandboxService: SandboxService, broadcastCallback: BroadcastCallback) {
    this.sandboxService = sandboxService;
    this.broadcastActivity = broadcastCallback;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && !apiKey.includes('ENCRYPTED')) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async chat(sessionId: string, userMessage: string, history: Message[]): Promise<{ content: string }> {
    if (!this.client) {
      return { content: 'Please configure ANTHROPIC_API_KEY to enable AI capabilities.' };
    }

    // Ensure sandbox is running
    const status = this.sandboxService.getSandboxStatus(sessionId);
    if (!status.active) {
      await this.initializeSandbox(sessionId);
    }

    // Get current file state for Claude's context
    const fileState = await this.getFileState(sessionId);
    const systemPromptWithState = SYSTEM_PROMPT + fileState;

    // Build messages
    const messages: Anthropic.MessageParam[] = history.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
    messages.push({ role: 'user', content: userMessage });

    let finalResponse = '';

    // Agentic loop - Claude uses tools until done
    while (true) {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPromptWithState,
        tools: TOOLS,
        messages
      });

      // Collect text and tool uses
      const assistantContent: Anthropic.ContentBlock[] = [];
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        assistantContent.push(block);

        if (block.type === 'text') {
          finalResponse += block.text;
        } else if (block.type === 'tool_use') {
          // Execute tool in sandbox
          const result = await this.executeTool(sessionId, block.name, block.input as Record<string, string>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result
          });
        }
      }

      // If no tool calls, we're done
      if (toolResults.length === 0) {
        break;
      }

      // Add assistant message and tool results, continue loop
      messages.push({ role: 'assistant', content: assistantContent });
      messages.push({ role: 'user', content: toolResults });
    }

    return { content: finalResponse || 'Done! Check the preview.' };
  }

  private async getFileState(sessionId: string): Promise<string> {
    // Don't try to read if no sandbox exists
    const status = this.sandboxService.getSandboxStatus(sessionId);
    if (!status.active) {
      return '\n(New project - no files yet)';
    }

    const files: string[] = [];

    for (const filePath of CONTEXT_FILES) {
      try {
        const content = await this.sandboxService.readFile(sessionId, `/home/user/app/${filePath}`);
        files.push(`\n### ${filePath}\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        // File doesn't exist or sandbox issue, skip silently
      }
    }

    // Also get list of other files in app/ directory
    try {
      const appFiles = await this.sandboxService.listFiles(sessionId, '/home/user/app/app');
      const otherFiles = appFiles
        .filter(f => !f.isDir && !['layout.tsx', 'page.tsx', 'globals.css'].includes(f.name))
        .map(f => f.name);

      if (otherFiles.length > 0) {
        files.push(`\n### Other files in app/\n${otherFiles.join(', ')}`);
      }
    } catch {
      // Directory doesn't exist or sandbox issue
    }

    return files.length > 0 ? files.join('\n') : '\n(No files found)';
  }

  private async executeTool(sessionId: string, name: string, input: Record<string, string>): Promise<string> {
    this.emitActivity(sessionId, 'tool_call', { tool: name, input });

    try {
      switch (name) {
        case 'write_file': {
          const fullPath = `/home/user/app/${input.path}`;
          const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));

          // Ensure directory exists
          await this.sandboxService.executeCommand(sessionId, `mkdir -p ${dir}`);
          await this.sandboxService.writeFile(sessionId, fullPath, input.content);

          this.emitActivity(sessionId, 'file_change', { action: 'write', path: input.path });
          return `Written: ${input.path}`;
        }

        case 'run_command': {
          const result = await this.sandboxService.executeCommand(sessionId, `cd /home/user/app && ${input.command}`);
          return result.exitCode === 0
            ? (result.stdout || 'Command completed')
            : `Error (exit ${result.exitCode}): ${result.stderr}`;
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Tool failed';
      this.emitActivity(sessionId, 'error', { message: msg });
      return `Error: ${msg}`;
    }
  }

  private async initializeSandbox(sessionId: string): Promise<void> {
    this.emitActivity(sessionId, 'terminal', { output: '🚀 Starting sandbox...', type: 'info' });

    await this.sandboxService.createSandbox(sessionId);

    // Initialize Next.js project
    const packageJson = JSON.stringify({
      name: 'owl-app',
      version: '1.0.0',
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
      dependencies: { next: '14.0.0', react: '18.2.0', 'react-dom': '18.2.0' }
    }, null, 2);

    const layout = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}`;

    const page = `export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">Welcome to Owl</h1>
    </main>
  );
}`;

    // Write initial files
    await this.sandboxService.executeCommand(sessionId, 'mkdir -p /home/user/app/app');
    await this.sandboxService.writeFile(sessionId, '/home/user/app/package.json', packageJson);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/app/layout.tsx', layout);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/app/page.tsx', page);

    // Install and start
    this.emitActivity(sessionId, 'terminal', { output: '📦 Installing dependencies...', type: 'info' });
    await this.sandboxService.executeCommand(sessionId, 'cd /home/user/app && npm install');

    this.emitActivity(sessionId, 'terminal', { output: '🚀 Starting dev server...', type: 'info' });
    await this.sandboxService.startDevServer(sessionId, 3000);
  }

  private emitActivity(sessionId: string, type: Activity['type'], data: Record<string, unknown>): void {
    this.broadcastActivity(sessionId, {
      id: uuidv4(),
      sessionId,
      type,
      data,
      timestamp: new Date()
    });
  }
}
