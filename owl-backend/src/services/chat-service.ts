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
  'tsconfig.json',
  'tailwind.config.ts',
  'postcss.config.js',
  'lib/utils.ts',
  'app/layout.tsx',
  'app/page.tsx',
  'app/globals.css',
  'components/ui/button.tsx',
  'components/ui/card.tsx',
  'components/ui/input.tsx'
];

const SYSTEM_PROMPT = `You are Owl, an AI that builds web applications.

You have direct access to a sandbox with a Next.js 15 project pre-configured with Tailwind CSS and shadcn/ui.

## Your Tools
- write_file: Create or update files. Hot-reload shows changes immediately.
- run_command: Run shell commands (npm install, etc.)

## Project Stack (Already Configured)
- Next.js 15 with App Router
- Tailwind CSS with CSS variables for theming
- shadcn/ui components pre-installed (see below)
- Lucide React icons available

## Pre-installed shadcn/ui Components
The following components are ready to use - import them from "@/components/ui/...":

- **Button**: \`import { Button } from "@/components/ui/button"\`
  - Variants: default, destructive, outline, secondary, ghost, link
  - Sizes: default, sm, lg, icon
  - Supports asChild prop for custom elements

- **Card**: \`import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"\`

- **Input**: \`import { Input } from "@/components/ui/input"\`

- **Textarea**: \`import { Textarea } from "@/components/ui/textarea"\`

- **Label**: \`import { Label } from "@/components/ui/label"\`

- **Badge**: \`import { Badge } from "@/components/ui/badge"\`
  - Variants: default, secondary, destructive, outline

- **Separator**: \`import { Separator } from "@/components/ui/separator"\`

- **Avatar**: \`import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"\`

- **Dialog**: \`import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"\`

- **Select**: \`import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"\`

- **Tabs**: \`import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"\`

- **Switch**: \`import { Switch } from "@/components/ui/switch"\`

- **Checkbox**: \`import { Checkbox } from "@/components/ui/checkbox"\`

- **ScrollArea**: \`import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"\`

- **Alert**: \`import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"\`

- **Skeleton**: \`import { Skeleton } from "@/components/ui/skeleton"\`

## Pre-installed Layout Templates
Ready-to-use page layouts - import from "@/components/layouts/...":

- **DashboardLayout**: \`import { DashboardLayout } from "@/components/layouts/dashboard-layout"\`
  - Responsive sidebar + header + main content
  - Collapsible sidebar on mobile
  - Customizable nav items and title

- **LandingLayout**: \`import { LandingLayout, Hero, Features } from "@/components/layouts/landing-layout"\`
  - Header with nav + footer
  - Hero section with CTA buttons
  - Features grid section

- **CardGrid**: \`import { CardGrid, ProductCard, UserCard } from "@/components/layouts/card-grid"\`
  - Responsive grid (2/3/4 columns)
  - Built-in search and filters
  - Pre-built ProductCard and UserCard components

USE THESE PRE-INSTALLED COMPONENTS AND LAYOUTS instead of writing your own. This ensures consistent styling and saves time.

## Styling Guidelines
1. Use Tailwind CSS utility classes
2. Use the cn() helper from @/lib/utils for conditional classes
3. Use CSS variable-based colors: bg-background, text-foreground, bg-primary, etc.
4. Use shadcn patterns: rounded-md, shadow-sm, proper spacing

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

When the user asks for something, build it using the pre-installed shadcn/ui components. The preview updates automatically via hot-reload.

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
          if (!input.content) {
            return 'Error: content parameter is required but was missing from tool call. Please retry with the file content.';
          }
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
        'class-variance-authority': '^0.7.0',
        // Radix UI primitives for shadcn/ui components
        '@radix-ui/react-slot': '^1.1.0',
        '@radix-ui/react-label': '^2.1.0',
        '@radix-ui/react-separator': '^1.1.0',
        '@radix-ui/react-avatar': '^1.1.1',
        '@radix-ui/react-dialog': '^1.1.2',
        '@radix-ui/react-select': '^2.1.2',
        '@radix-ui/react-tabs': '^1.1.1',
        '@radix-ui/react-switch': '^1.1.1',
        '@radix-ui/react-checkbox': '^1.1.2',
        '@radix-ui/react-scroll-area': '^1.2.0'
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

    const tsconfigJson = JSON.stringify({
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: {
          "@/*": ["./*"]
        }
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"]
    }, null, 2);

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

    // === PHASE 4B: shadcn/ui Components ===
    const buttonComponent = `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };`;

    const cardComponent = `import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };`;

    const inputComponent = `import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };`;

    const textareaComponent = `import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };`;

    const labelComponent = `"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };`;

    const badgeComponent = `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };`;

    const separatorComponent = `"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
      className
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };`;

    const avatarComponent = `"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn("aspect-square h-full w-full", className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };`;

    const dialogComponent = `"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };`;

    const selectComponent = `"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}>
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}>
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport className={cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}>
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton };`;

    const tabsComponent = `"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };`;

    const switchComponent = `"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };`;

    const checkboxComponent = `"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };`;

    const scrollAreaComponent = `"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };`;

    const alertComponent = `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  )
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
  )
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
  )
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };`;

    const skeletonComponent = `import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };`;

    // === PHASE 4C: Layout Templates ===
    const dashboardLayout = `"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Home, Settings, Users, FileText, BarChart3, Menu, X } from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  navItems?: NavItem[];
}

const defaultNavItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: <Home className="h-4 w-4" /> },
  { title: "Analytics", href: "/analytics", icon: <BarChart3 className="h-4 w-4" /> },
  { title: "Users", href: "/users", icon: <Users className="h-4 w-4" /> },
  { title: "Documents", href: "/documents", icon: <FileText className="h-4 w-4" /> },
  { title: "Settings", href: "/settings", icon: <Settings className="h-4 w-4" /> },
];

export function DashboardLayout({ children, title = "Dashboard", navItems = defaultNavItems }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 transform bg-card border-r transition-transform duration-200 lg:translate-x-0 lg:static",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <span className="text-lg font-semibold">App Name</span>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-4rem)]">
          <nav className="space-y-1 p-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {item.icon}
                {item.title}
              </Link>
            ))}
          </nav>
        </ScrollArea>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="flex h-full items-center gap-4 px-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              {/* Add header actions here */}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}`;

    const landingLayout = `import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface LandingLayoutProps {
  children: React.ReactNode;
  logo?: React.ReactNode;
  navLinks?: { title: string; href: string }[];
}

export function LandingLayout({ children, logo, navLinks = [] }: LandingLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            {logo || <span className="text-xl font-bold">Logo</span>}
            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  {link.title}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm">Sign In</Button>
            <Button size="sm">Get Started</Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50">
        <div className="container py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-semibold mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground">Features</Link></li>
                <li><Link href="#" className="hover:text-foreground">Pricing</Link></li>
                <li><Link href="#" className="hover:text-foreground">Docs</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground">About</Link></li>
                <li><Link href="#" className="hover:text-foreground">Blog</Link></li>
                <li><Link href="#" className="hover:text-foreground">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Resources</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground">Community</Link></li>
                <li><Link href="#" className="hover:text-foreground">Help Center</Link></li>
                <li><Link href="#" className="hover:text-foreground">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground">Privacy</Link></li>
                <li><Link href="#" className="hover:text-foreground">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
            © 2024 Your Company. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

// Hero section component
export function Hero({ title, description, primaryAction, secondaryAction }: {
  title: string;
  description: string;
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
}) {
  return (
    <section className="container py-24 md:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">{title}</h1>
        <p className="mt-6 text-lg text-muted-foreground">{description}</p>
        <div className="mt-10 flex items-center justify-center gap-4">
          {primaryAction && (
            <Button size="lg" asChild>
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
          )}
          {secondaryAction && (
            <Button size="lg" variant="outline" asChild>
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

// Features section component
export function Features({ title, description, features }: {
  title: string;
  description?: string;
  features: { title: string; description: string; icon?: React.ReactNode }[];
}) {
  return (
    <section className="container py-24 bg-muted/50">
      <div className="mx-auto max-w-2xl text-center mb-16">
        <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
        {description && <p className="mt-4 text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => (
          <div key={i} className="rounded-lg border bg-card p-6">
            {feature.icon && <div className="mb-4 text-primary">{feature.icon}</div>}
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}`;

    const cardGridLayout = `import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Grid, List } from "lucide-react";

interface CardGridProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  columns?: 2 | 3 | 4;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  filters?: { label: string; options: { value: string; label: string }[]; onChange: (value: string) => void }[];
  emptyMessage?: string;
}

export function CardGrid<T>({
  items,
  renderCard,
  columns = 3,
  searchable = false,
  searchPlaceholder = "Search...",
  onSearch,
  filters = [],
  emptyMessage = "No items found"
}: CardGridProps<T>) {
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-2 lg:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4"
  };

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      {(searchable || filters.length > 0) && (
        <div className="flex flex-col sm:flex-row gap-4">
          {searchable && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                className="pl-9"
                onChange={(e) => onSearch?.(e.target.value)}
              />
            </div>
          )}
          {filters.map((filter, i) => (
            <Select key={i} onValueChange={filter.onChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      )}

      {/* Grid */}
      {items.length > 0 ? (
        <div className={cn("grid gap-6", gridCols[columns])}>
          {items.map((item, index) => renderCard(item, index))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

// Example product card component
export function ProductCard({ image, title, description, price, badge, onAction }: {
  image?: string;
  title: string;
  description?: string;
  price?: string;
  badge?: string;
  onAction?: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      {image && (
        <div className="aspect-video relative bg-muted">
          <img src={image} alt={title} className="object-cover w-full h-full" />
          {badge && (
            <Badge className="absolute top-2 right-2">{badge}</Badge>
          )}
        </div>
      )}
      <CardHeader>
        <CardTitle className="line-clamp-1">{title}</CardTitle>
        {description && <CardDescription className="line-clamp-2">{description}</CardDescription>}
      </CardHeader>
      <CardFooter className="flex items-center justify-between">
        {price && <span className="text-lg font-semibold">{price}</span>}
        {onAction && <Button size="sm" onClick={onAction}>View Details</Button>}
      </CardFooter>
    </Card>
  );
}

// Example user card component
export function UserCard({ avatar, name, role, email, onAction }: {
  avatar?: string;
  name: string;
  role?: string;
  email?: string;
  onAction?: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {avatar ? (
              <img src={avatar} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-semibold">{name.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{name}</p>
            {role && <p className="text-sm text-muted-foreground">{role}</p>}
            {email && <p className="text-sm text-muted-foreground truncate">{email}</p>}
          </div>
        </div>
      </CardContent>
      {onAction && (
        <CardFooter>
          <Button variant="outline" size="sm" className="w-full" onClick={onAction}>
            View Profile
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}`;

    // Create directory structure
    await this.sandboxService.executeCommand(sessionId, 'mkdir -p /home/user/app/app /home/user/app/lib /home/user/app/components/ui /home/user/app/components/layouts');

    // Write Phase 1: package.json
    await this.sandboxService.writeFile(sessionId, '/home/user/app/package.json', packageJson);

    // Write Phase 2: Config files (BEFORE npm install)
    await this.sandboxService.writeFile(sessionId, '/home/user/app/tsconfig.json', tsconfigJson);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/tailwind.config.ts', tailwindConfig);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/postcss.config.js', postcssConfig);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/lib/utils.ts', utilsTs);

    // Write Phase 3: Styles (BEFORE npm install)
    await this.sandboxService.writeFile(sessionId, '/home/user/app/app/globals.css', globalsCss);

    // Write Phase 4: App components
    await this.sandboxService.writeFile(sessionId, '/home/user/app/app/layout.tsx', layout);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/app/page.tsx', page);

    // Write Phase 4B: shadcn/ui components
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/button.tsx', buttonComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/card.tsx', cardComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/input.tsx', inputComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/textarea.tsx', textareaComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/label.tsx', labelComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/badge.tsx', badgeComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/separator.tsx', separatorComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/avatar.tsx', avatarComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/dialog.tsx', dialogComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/select.tsx', selectComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/tabs.tsx', tabsComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/switch.tsx', switchComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/checkbox.tsx', checkboxComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/scroll-area.tsx', scrollAreaComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/alert.tsx', alertComponent);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/ui/skeleton.tsx', skeletonComponent);

    // Write Phase 4C: Layout templates
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/layouts/dashboard-layout.tsx', dashboardLayout);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/layouts/landing-layout.tsx', landingLayout);
    await this.sandboxService.writeFile(sessionId, '/home/user/app/components/layouts/card-grid.tsx', cardGridLayout);

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
