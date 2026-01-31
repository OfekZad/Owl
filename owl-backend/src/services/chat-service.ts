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
  'tailwind.config.ts',
  'postcss.config.js',
  'lib/utils.ts',
  'app/layout.tsx',
  'app/page.tsx',
  'app/globals.css'
];

const SYSTEM_PROMPT = `You are Owl, an AI that builds web applications.

You have direct access to a sandbox with a Next.js 15 project pre-configured with Tailwind CSS and shadcn/ui foundations.

## Your Tools
- write_file: Create or update files. Hot-reload shows changes immediately.
- run_command: Run shell commands (npm install, etc.)

## Project Stack (Already Configured)
- Next.js 15 with App Router
- Tailwind CSS with CSS variables for theming
- shadcn/ui compatible setup (lib/utils.ts with cn() helper)
- Lucide React icons available

## Styling Guidelines
1. Use Tailwind CSS utility classes
2. Use the cn() helper from @/lib/utils for conditional classes
3. Use CSS variable-based colors: bg-background, text-foreground, bg-primary, etc.
4. Use shadcn patterns: rounded-md, shadow-sm, proper spacing

## Component Patterns
When building UI components, follow shadcn conventions:
- Use forwardRef for components that accept refs
- Use class-variance-authority (cva) for variant-based components
- Import cn from "@/lib/utils"
- Use semantic color variables, not hardcoded colors like purple-500 or blue-gradient

## Image Placeholders
For prototype images, use these placeholder services:
- Cats: https://placekitten.com/{width}/{height}
- Photos: https://picsum.photos/{width}/{height}
- Avatars: https://i.pravatar.cc/{size}

Never use emoji as placeholder images.

## Build Order (CRITICAL)
If you need to add new dependencies:
1. Update package.json
2. Run npm install
3. THEN write component files

When the user asks for something, build it by writing the necessary component files. The preview updates automatically via hot-reload.

## Current Project State
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

    // === PHASE 1: Dependencies ===
    const packageJson = JSON.stringify({
      name: 'owl-app',
      version: '1.0.0',
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start'
      },
      dependencies: {
        next: '^15.1.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        'lucide-react': '^0.460.0',
        'clsx': '^2.1.1',
        'tailwind-merge': '^2.5.4',
        'class-variance-authority': '^0.7.0'
      },
      devDependencies: {
        tailwindcss: '^3.4.15',
        postcss: '^8.4.49',
        autoprefixer: '^10.4.20',
        typescript: '^5.6.3',
        '@types/node': '^22.9.0',
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0'
      }
    }, null, 2);

    // === PHASE 2: Configuration files ===
    const tailwindConfig = `import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;`;

    const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`;

    const utilsTs = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`;

    // === PHASE 3: Styles ===
    const globalsCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}`;

    // === PHASE 4: Components ===
    const layout = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owl App",
  description: "Built with Owl",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}`;

    const page = `export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">Welcome to Owl</h1>
        <p className="mt-2 text-muted-foreground">Your app is ready to build</p>
      </div>
    </main>
  );
}`;

    // Create directory structure
    await this.sandboxService.executeCommand(sessionId, 'mkdir -p /home/user/app/app /home/user/app/lib /home/user/app/components');

    // Write Phase 1: package.json
    await this.sandboxService.writeFile(sessionId, '/home/user/app/package.json', packageJson);

    // Write Phase 2: Config files (BEFORE npm install)
    await this.sandboxService.writeFile(sessionId, '/home/user/app/tailwind.config.ts', tailwindConfig);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/postcss.config.js', postcssConfig);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/lib/utils.ts', utilsTs);

    // Write Phase 3: Styles (BEFORE npm install)
    await this.sandboxService.writeFile(sessionId, '/home/user/app/app/globals.css', globalsCss);

    // Write Phase 4: Components
    await this.sandboxService.writeFile(sessionId, '/home/user/app/app/layout.tsx', layout);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/app/page.tsx', page);

    // === PHASE 5: Install and start server ===
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
