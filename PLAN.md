# Epic: Owl Agent - AI-Powered Web App Generator

## Project Configuration
| Setting | Choice |
|---------|--------|
| **Project Name** | owl-app (frontend), owl-backend (backend) |
| **Backend Framework** | Express.js |
| **Authentication** | No auth (MVP) - add later |

## Executive Summary

Build a v0-like web application featuring "Owl", an autonomous AI agent that generates complete web applications based on user requests. The system uses a chat-based interface where users describe what they want, and Owl creates production-ready code using shadcn/ui components.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                    │
│  ┌─────────────────────────────────┬─────────────────────────────────────┐  │
│  │         CHAT PANEL (50%)        │       ACTIVITY PANEL (50%)          │  │
│  │  ┌───────────────────────────┐  │  ┌─────────────────────────────────┐│  │
│  │  │     Message History       │  │  │      Live Agent Activity        ││  │
│  │  │  - User messages          │  │  │  - File operations              ││  │
│  │  │  - Owl responses          │  │  │  - Terminal output              ││  │
│  │  │  - Tool call viz          │  │  │  - Code being written           ││  │
│  │  │  - Code blocks            │  │  │  - Live preview (iframe)        ││  │
│  │  └───────────────────────────┘  │  └─────────────────────────────────┘│  │
│  │  ┌───────────────────────────┐  │                                     │  │
│  │  │      Chat Input           │  │                                     │  │
│  │  └───────────────────────────┘  │                                     │  │
│  └─────────────────────────────────┴─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ SSE/WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS FRONTEND (Vercel)                            │
│  - App Router with Server Components                                        │
│  - Streaming API routes for chat                                            │
│  - shadcn/ui components                                                     │
│  - Real-time activity streaming                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ REST/WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OWL AGENT BACKEND (Render)                           │
│  - Claude Agents SDK with Opus 4.5                                          │
│  - Bash tool for code execution                                             │
│  - Session management                                                       │
│  - E2B sandbox orchestration                                                │
│  - Version management & snapshots                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ E2B SDK
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           E2B SANDBOX (Cloud)                               │
│  - Isolated Firecracker microVM per session                                 │
│  - Full file system access                                                  │
│  - npm/pip package installation                                             │
│  - Code execution & preview server                                          │
│  - 200ms startup, hardware-level isolation                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VERSIONING & DEPLOYMENT                              │
│  - Vercel Blob for filesystem snapshots                                     │
│  - Vercel Deploy API for preview/production links                           │
│  - Auto-save after each agent turn                                          │
│  - Version duplication for branching                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Versioning & Iteration System

### Overview

Users iterate on their apps through continuous feedback loops. Each agent turn automatically creates a new version with a complete filesystem snapshot. Users can deploy any version to production/staging or duplicate older versions to branch off.

### Version Flow

```
v1 ──► v2 ──► v3 ──► v4 (current)
              │
              └──► v5 (duplicate of v3 → becomes new current)
```

### Key Behaviors

| Behavior | Description |
|----------|-------------|
| **Auto-save** | New version created after each agent turn |
| **Linear with duplication** | Duplicating v3 creates v5 (not v3.1) - always moves forward |
| **Deploy anywhere** | Any version can be pushed to production/staging via Vercel |
| **Unlimited history** | All versions retained indefinitely |

### Data Model

```typescript
interface Version {
  id: string;
  sessionId: string;
  parentVersionId: string | null;  // For tracking lineage
  number: number;                   // v1, v2, v3...
  filesystemSnapshot: string;       // URL to Vercel Blob snapshot
  chatHistory: Message[];
  vercelDeploymentId: string | null;
  previewUrl: string | null;        // Persistent Vercel preview
  createdAt: Date;
}

interface Session {
  id: string;
  currentVersionId: string;
  versions: Version[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Version API Endpoints

```
POST   /sessions/:id/versions              # Auto-created after agent turn
GET    /sessions/:id/versions              # List all versions
GET    /versions/:id                       # Get version details
POST   /versions/:id/duplicate             # Create new version from snapshot
POST   /versions/:id/deploy                # Deploy to Vercel (production/preview)
GET    /versions/:id/files                 # Get filesystem contents
```

### Storage Architecture

- **Filesystem Snapshots**: Stored in Vercel Blob as tar.gz archives
- **Chat History**: Stored in database (Postgres/SQLite)
- **Preview Deployments**: Created via Vercel Deploy API on-demand

---

## Technical Stack (Data-Driven Selection)

### 1. AI Model: Claude Opus 4.5
**Source:** [Anthropic Opus 4.5 Announcement](https://www.anthropic.com/news/claude-opus-4-5)

| Capability | Value | Why It Matters |
|------------|-------|----------------|
| SWE-bench Score | 80.9% (first to exceed 80%) | Best-in-class code generation |
| Context Window | 200K tokens | Handle large codebases |
| Max Output | 64K tokens | Generate complete applications |
| Token Efficiency | 76% fewer tokens than Sonnet | Cost-effective for production |

**Reasoning:**
- Opus 4.5 is the first frontier model to exceed 80% on SWE-bench Verified
- Excels at multi-file generation and code refactoring
- Extended thinking mode for complex planning tasks
- 50-75% reduction in tool calling errors vs. other models

### 2. Agent Framework: Claude Agents SDK
**Source:** [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)

**Capabilities Used:**
- Built-in Bash tool for code execution
- Read/Write/Edit tools for file operations
- Streaming output with `includePartialMessages`
- Session management for multi-turn conversations
- Hooks for custom behavior (logging, validation)

**Why Claude Agents SDK:**
- Same tools that power Claude Code
- Production-ready orchestration
- Native streaming support
- Built-in context management

### 3. Code Sandbox: E2B
**Source:** [E2B Documentation](https://e2b.dev/docs), [How Manus Uses E2B](https://e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers)

| Feature | Specification |
|---------|---------------|
| Isolation | Firecracker microVMs with KVM |
| Startup Time | <200ms |
| Session Duration | Up to 24 hours (Pro) |
| Persistence | Pause/resume with full state |

**Why E2B:**
- Used by Manus (the viral AI agent) for code execution
- Hardware-level isolation (not just containers)
- Full filesystem, networking, browser access
- Built-in Jupyter server for Python execution
- Accessible preview URLs for generated apps

### 4. Frontend: Next.js 14+ with App Router
**Source:** [Next.js App Router Docs](https://nextjs.org/docs/app), [Vercel AI SDK](https://ai-sdk.dev/)

**Key Patterns:**
- Server Components by default (minimize JS bundle)
- Route Handlers for streaming API endpoints
- SSE for real-time agent activity
- Suspense boundaries for progressive loading

**Why Next.js + Vercel:**
- Native streaming support for AI chat
- Edge-optimized deployment
- Built-in caching and optimization
- Seamless Vercel AI SDK integration

### 5. UI Components: shadcn/ui
**Source:** [shadcn/ui AI Components](https://www.shadcn.io/ai), [AI-First UIs: Why shadcn/ui's Model is Leading](https://refine.dev/blog/shadcn-blog/)

**Why shadcn/ui is AI-Native:**
- Tailwind utility classes map directly to CSS (AI can manipulate via text)
- Components copied into codebase (not hidden in node_modules)
- No proprietary theming systems to navigate
- 25+ pre-built AI chat components available

### 6. Backend Hosting: Render
**Source:** [Real-Time Communication Patterns](https://dev.to/brinobruno/real-time-web-communication-longshort-polling-websockets-and-sse-explained-nextjs-code-1l43)

**Why Render (not Vercel serverless):**
- WebSockets require persistent connections
- Long-running agent sessions (minutes to hours)
- Node.js runtime for full Claude SDK support
- Not constrained by serverless timeouts

### 7. Version Storage: Vercel Blob + Deploy API

**Vercel Blob** for filesystem snapshots:
- Serverless object storage
- Automatic CDN distribution
- Simple SDK integration

**Vercel Deploy API** for previews:
- Programmatic deployments
- Persistent preview URLs
- Production/staging deployments

---

## Core Features Based on Research

### Feature 1: Split-Screen "Computer" Window
**Inspiration:** [Manus UX Pattern](https://uxdesign.cc/cursor-vibe-coding-and-manus-the-ux-revolution-that-ai-needs-3d3a0f8ccdfa)

Manus's signature feature is showing users exactly what the agent is doing in real-time. This builds trust and enables intervention.

**Implementation:**
- Left panel (50%): Chat conversation
- Right panel (50%): Live activity viewer
  - File browser showing created/modified files
  - Terminal output from bash commands
  - Live preview iframe of generated app
  - Code being written in real-time

### Feature 2: CodeAct Pattern (Code as Actions)
**Source:** [Manus Technical Investigation](https://gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f)

Instead of rigid function calls, Owl generates executable code:

```python
# Instead of: {"action": "create_file", "path": "..."}
# Owl generates and executes:
with open('src/components/Button.tsx', 'w') as f:
    f.write('''
    export function Button({ children }) {
      return <button className="...">{children}</button>
    }
    ''')
```

**Benefits:**
- Flexible: Combine multiple operations in one execution
- Iterative: Write → Execute → Observe → Debug → Repeat
- Powerful: Access any Python/Node library

### Feature 3: Streaming Chat with Tool Visualization
**Source:** [Vercel AI SDK useChat](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot), [AI UI Patterns](https://www.patterns.dev/react/ai-ui-patterns/)

**Implementation:**
- Use `useChat` hook for automatic streaming management
- Show tool calls inline in chat (expanding cards)
- Display execution status: pending → executing → completed
- Stream code blocks with syntax highlighting

### Feature 4: Context Engineering for Reliability
**Source:** [Manus Context Engineering Blog](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)

**Key Lessons from Manus:**
1. **File-based memory**: Treat filesystem as infinite context (not relying on context window)
2. **Include errors**: Don't hide failures; models learn from mistakes
3. **Avoid pattern fixation**: Introduce variation to prevent repetitive outputs
4. **KV-cache optimization**: Stable prompt prefixes for 10x cost savings

### Feature 5: shadcn/ui Component Library Reference
**Source:** [shadcn/ui Registry](https://ui.shadcn.com/docs/registry/getting-started)

Owl will have access to:
- Full shadcn/ui component registry metadata
- Example usage for each component
- Dependency information (which components depend on others)
- Tailwind CSS configuration

**Prompt Strategy:**
```
You have access to shadcn/ui components. When generating UI:
1. Always use shadcn/ui components where available
2. Follow the component API exactly
3. Use Tailwind CSS for styling
4. Components available: Button, Card, Dialog, Input, Select, ...
```

### Feature 6: Auto-Save Versioning
Every agent turn automatically creates a new version:

1. Agent completes a turn (files modified)
2. Backend snapshots E2B filesystem → Vercel Blob
3. New version record created with chat history
4. Frontend updates version list
5. User can deploy any version or duplicate older ones

---

## Implementation Plan

### Phase 1: Project Setup & Core Infrastructure

#### 1.1 Initialize Next.js Frontend
```
owl-app/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with providers
│   │   ├── page.tsx                # Landing/home page
│   │   ├── chat/
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx        # Main chat interface
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts        # Streaming chat endpoint
│   │       ├── activity/
│   │       │   └── route.ts        # SSE for agent activity
│   │       └── versions/
│   │           └── route.ts        # Version management
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── chat/
│   │   │   ├── message-list.tsx
│   │   │   ├── message.tsx
│   │   │   ├── chat-input.tsx
│   │   │   └── tool-call.tsx
│   │   ├── activity/
│   │   │   ├── activity-panel.tsx
│   │   │   ├── file-browser.tsx
│   │   │   ├── terminal-output.tsx
│   │   │   └── preview-frame.tsx
│   │   └── versions/
│   │       ├── version-list.tsx
│   │       ├── version-card.tsx
│   │       └── deploy-dialog.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   └── owl-client.ts       # Backend API client
│   │   └── utils/
│   │       └── cn.ts               # shadcn utility
│   └── types/
│       ├── chat.ts
│       └── version.ts
├── package.json
├── tailwind.config.ts
└── next.config.js
```

**Dependencies:**
- `next@14+`
- `@ai-sdk/react` (useChat hook)
- `react-markdown` + `react-syntax-highlighter` (rendering)
- `@vercel/blob` (snapshot storage)
- shadcn/ui components

#### 1.2 Initialize Owl Agent Backend
```
owl-backend/
├── src/
│   ├── index.ts                    # Express server
│   ├── agent/
│   │   ├── owl.ts                  # Owl agent configuration
│   │   ├── system-prompt.ts        # System prompt for code gen
│   │   └── tools.ts                # Custom tool definitions
│   ├── sandbox/
│   │   ├── e2b-client.ts           # E2B SDK wrapper
│   │   └── session-manager.ts      # Sandbox session management
│   ├── versions/
│   │   ├── version-manager.ts      # Version CRUD operations
│   │   ├── snapshot.ts             # Filesystem snapshot logic
│   │   └── deploy.ts               # Vercel deployment logic
│   ├── routes/
│   │   ├── chat.ts                 # Chat endpoint
│   │   ├── activity.ts             # Activity stream endpoint
│   │   └── versions.ts             # Version management endpoints
│   └── types/
│       └── index.ts
├── package.json
└── Dockerfile                      # For Render deployment
```

**Dependencies:**
- `@anthropic-ai/claude-agent-sdk`
- `@e2b/sdk`
- `express`
- `ws` (WebSocket)
- `@vercel/blob`
- `tar` (for filesystem snapshots)

### Phase 2: Owl Agent Implementation

#### 2.1 System Prompt Design
**Based on:** [Claude 4 Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)

```typescript
const OWL_SYSTEM_PROMPT = `
You are Owl, an expert AI agent that creates web applications.

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
${SHADCN_COMPONENT_REGISTRY}

## Workflow
1. Understand user requirements
2. Plan the application structure
3. Create files using bash commands
4. Install required dependencies
5. Generate code for each component
6. Test by running the development server
7. Iterate based on user feedback

## Keep Solutions Simple
- Only make changes that are directly requested
- Don't add features beyond what was asked
- A bug fix doesn't need surrounding code cleaned up
`;
```

#### 2.2 Agent Configuration
```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';

const owlOptions: ClaudeAgentOptions = {
  model: 'claude-opus-4-5-20251101',
  allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
  systemPrompt: OWL_SYSTEM_PROMPT,
  includePartialMessages: true, // Enable streaming
  permissionMode: 'acceptEdits', // Auto-approve file operations
  thinking: {
    type: 'enabled',
    budgetTokens: 8000 // Extended thinking for complex planning
  }
};
```

#### 2.3 E2B Sandbox Integration
```typescript
import { Sandbox } from '@e2b/sdk';

class SandboxManager {
  private sandboxes = new Map<string, Sandbox>();

  async createSession(sessionId: string): Promise<Sandbox> {
    const sandbox = await Sandbox.create({
      template: 'nextjs', // Pre-configured with Node.js, npm
      timeout: 3600000,   // 1 hour
    });

    // Initialize project structure
    await sandbox.commands.run('npx create-next-app@latest . --typescript --tailwind --eslint');
    await sandbox.commands.run('npx shadcn@latest init -y');

    this.sandboxes.set(sessionId, sandbox);
    return sandbox;
  }

  async executeInSandbox(sessionId: string, command: string): Promise<string> {
    const sandbox = this.sandboxes.get(sessionId);
    const result = await sandbox.commands.run(command);
    return result.stdout + result.stderr;
  }

  async getPreviewUrl(sessionId: string): Promise<string> {
    const sandbox = this.sandboxes.get(sessionId);
    // Start dev server if not running
    await sandbox.commands.run('npm run dev', { background: true });
    return sandbox.getPreviewUrl(3000);
  }

  async snapshotFilesystem(sessionId: string): Promise<Buffer> {
    const sandbox = this.sandboxes.get(sessionId);
    // Create tar archive of project files
    await sandbox.commands.run('tar -czf /tmp/snapshot.tar.gz -C /home/user/project .');
    const snapshot = await sandbox.files.read('/tmp/snapshot.tar.gz');
    return snapshot;
  }

  async restoreFilesystem(sessionId: string, snapshot: Buffer): Promise<void> {
    const sandbox = this.sandboxes.get(sessionId);
    await sandbox.files.write('/tmp/snapshot.tar.gz', snapshot);
    await sandbox.commands.run('rm -rf /home/user/project/*');
    await sandbox.commands.run('tar -xzf /tmp/snapshot.tar.gz -C /home/user/project');
  }
}
```

### Phase 3: Version Management

#### 3.1 Version Manager
```typescript
import { put, list } from '@vercel/blob';
import { db } from '../db';

class VersionManager {
  async createVersion(
    sessionId: string,
    snapshot: Buffer,
    chatHistory: Message[]
  ): Promise<Version> {
    // Get current version number
    const versions = await db.versions.findMany({ where: { sessionId } });
    const nextNumber = versions.length + 1;

    // Upload snapshot to Vercel Blob
    const { url } = await put(
      `snapshots/${sessionId}/v${nextNumber}.tar.gz`,
      snapshot,
      { access: 'public' }
    );

    // Create version record
    const version = await db.versions.create({
      data: {
        sessionId,
        number: nextNumber,
        parentVersionId: versions[versions.length - 1]?.id ?? null,
        filesystemSnapshot: url,
        chatHistory: JSON.stringify(chatHistory),
        createdAt: new Date(),
      }
    });

    return version;
  }

  async duplicateVersion(versionId: string): Promise<Version> {
    const source = await db.versions.findUnique({ where: { id: versionId } });
    const versions = await db.versions.findMany({
      where: { sessionId: source.sessionId }
    });

    // Create new version from source snapshot
    const version = await db.versions.create({
      data: {
        sessionId: source.sessionId,
        number: versions.length + 1,
        parentVersionId: source.id,
        filesystemSnapshot: source.filesystemSnapshot, // Reuse snapshot URL
        chatHistory: source.chatHistory,
        createdAt: new Date(),
      }
    });

    return version;
  }

  async deployVersion(versionId: string, target: 'preview' | 'production'): Promise<string> {
    const version = await db.versions.findUnique({ where: { id: versionId } });

    // Download snapshot
    const snapshot = await fetch(version.filesystemSnapshot).then(r => r.arrayBuffer());

    // Deploy to Vercel using Deploy API
    const deployment = await deployToVercel(snapshot, {
      target,
      name: `owl-${version.sessionId}-v${version.number}`,
    });

    // Update version with deployment info
    await db.versions.update({
      where: { id: versionId },
      data: {
        vercelDeploymentId: deployment.id,
        previewUrl: deployment.url,
      }
    });

    return deployment.url;
  }
}
```

### Phase 4: Frontend Implementation

#### 4.1 Chat Interface with Split Screen
```tsx
// src/app/chat/[sessionId]/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import { MessageList } from '@/components/chat/message-list';
import { ChatInput } from '@/components/chat/chat-input';
import { ActivityPanel } from '@/components/activity/activity-panel';
import { VersionList } from '@/components/versions/version-list';

export default function ChatPage({ params }: { params: { sessionId: string } }) {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/chat',
    body: { sessionId: params.sessionId },
  });

  const [showVersions, setShowVersions] = useState(false);

  return (
    <div className="flex h-screen">
      {/* Left: Chat Panel */}
      <div className="w-1/2 flex flex-col border-r">
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="font-semibold">Owl</h1>
          <button onClick={() => setShowVersions(!showVersions)}>
            Versions
          </button>
        </div>

        {showVersions ? (
          <VersionList sessionId={params.sessionId} />
        ) : (
          <>
            <MessageList messages={messages} status={status} />
            <ChatInput
              value={input}
              onChange={handleInputChange}
              onSubmit={handleSubmit}
              disabled={status === 'streaming'}
            />
          </>
        )}
      </div>

      {/* Right: Activity Panel */}
      <div className="w-1/2">
        <ActivityPanel sessionId={params.sessionId} />
      </div>
    </div>
  );
}
```

#### 4.2 Version List Component
```tsx
// src/components/versions/version-list.tsx
'use client';

import { useVersions } from '@/hooks/use-versions';
import { VersionCard } from './version-card';
import { DeployDialog } from './deploy-dialog';

export function VersionList({ sessionId }: { sessionId: string }) {
  const { versions, duplicate, deploy } = useVersions(sessionId);

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <h2 className="text-lg font-semibold">Version History</h2>

      {versions.map((version) => (
        <VersionCard
          key={version.id}
          version={version}
          onDuplicate={() => duplicate(version.id)}
          onDeploy={(target) => deploy(version.id, target)}
        />
      ))}
    </div>
  );
}
```

#### 4.3 Activity Panel with Real-Time Updates
```tsx
// src/components/activity/activity-panel.tsx
'use client';

import { useEffect, useState } from 'react';
import { FileBrowser } from './file-browser';
import { TerminalOutput } from './terminal-output';
import { PreviewFrame } from './preview-frame';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ActivityPanel({ sessionId }: { sessionId: string }) {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    // SSE connection for real-time activity
    const eventSource = new EventSource(`/api/activity?session=${sessionId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setActivity(prev => [...prev, data]);

      if (data.type === 'preview_ready') {
        setPreviewUrl(data.url);
      }
    };

    return () => eventSource.close();
  }, [sessionId]);

  return (
    <Tabs defaultValue="activity" className="h-full">
      <TabsList>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
        <TabsTrigger value="terminal">Terminal</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>

      <TabsContent value="activity" className="h-full overflow-auto">
        <ActivityFeed items={activity} />
      </TabsContent>

      <TabsContent value="files">
        <FileBrowser sessionId={sessionId} />
      </TabsContent>

      <TabsContent value="terminal">
        <TerminalOutput logs={activity.filter(a => a.type === 'terminal')} />
      </TabsContent>

      <TabsContent value="preview">
        {previewUrl ? (
          <PreviewFrame url={previewUrl} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Preview will appear when app is running
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
```

### Phase 5: Integration & Polish

#### 5.1 Backend Chat Route with Auto-Versioning
```typescript
// owl-backend/src/routes/chat.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { sandboxManager } from '../sandbox/session-manager';
import { versionManager } from '../versions/version-manager';

export async function handleChat(req: Request, res: Response) {
  const { sessionId, messages } = req.body;

  // Get or create sandbox for session
  const sandbox = await sandboxManager.getOrCreate(sessionId);

  // Set up streaming response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let allMessages = [...messages];

  // Run Owl agent
  for await (const message of query({
    prompt: messages[messages.length - 1].content,
    options: {
      ...owlOptions,
      // Connect Bash tool to E2B sandbox
      bashExecutor: (cmd) => sandbox.commands.run(cmd),
    }
  })) {
    // Stream message to client
    if (message.type === 'stream_event') {
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    }

    // Broadcast activity to activity panel
    if (message.type === 'tool_use') {
      broadcastActivity(sessionId, {
        type: 'tool_call',
        tool: message.name,
        input: message.input,
        status: 'executing'
      });
    }

    // Collect messages for version history
    if (message.type === 'assistant_message') {
      allMessages.push(message);
    }
  }

  // Auto-save version after agent turn completes
  const snapshot = await sandboxManager.snapshotFilesystem(sessionId);
  const version = await versionManager.createVersion(sessionId, snapshot, allMessages);

  // Notify frontend of new version
  res.write(`data: ${JSON.stringify({ type: 'version_created', version })}\n\n`);

  res.end();
}
```

---

## Deployment Architecture

### Frontend (Vercel)
- Next.js app deployed to Vercel
- Automatic edge caching for static assets
- Environment variables for backend URL

### Backend (Render)
- Node.js service with WebSocket support
- Docker container for consistent environment
- Auto-scaling based on load
- Environment variables for API keys

### Sandboxes (E2B Cloud)
- On-demand Firecracker microVMs
- Automatic cleanup after session timeout
- Pause/resume for cost optimization

### Version Storage (Vercel Blob)
- Filesystem snapshots stored as tar.gz
- CDN-distributed for fast restoration

```yaml
# render.yaml
services:
  - type: web
    name: owl-backend
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: E2B_API_KEY
        sync: false
      - key: BLOB_READ_WRITE_TOKEN
        sync: false
      - key: VERCEL_TOKEN
        sync: false
    healthCheckPath: /health
```

---

## Success Metrics

| Metric | Target | Based On |
|--------|--------|----------|
| Code Generation Success Rate | >90% | Manus GAIA benchmark (86.5% Level 1) |
| Time to First Token | <500ms | Vercel AI SDK benchmarks |
| Session Duration Support | Up to 1 hour | E2B Pro tier limits |
| Tool Call Error Rate | <10% | Opus 4.5 claims 50-75% reduction |
| Version Creation Time | <5s | Snapshot + Blob upload |

---

## Risk Mitigation

### Risk 1: Agent Loops/Repetition
**Source:** [Manus Lessons - Context Engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)

**Mitigation:**
- Introduce controlled variation in serialization
- Include errors in context (models learn from mistakes)
- Set maximum iteration limits

### Risk 2: Code Quality Issues
**Source:** [AI Code Robustness Research](https://arxiv.org/html/2503.20197v1) - 43.1% of LLM code has robustness issues

**Mitigation:**
- Use extended thinking for complex planning
- AST validation before execution
- Automated linting in sandbox

### Risk 3: Sandbox Security
**Source:** [Complete Guide to Sandboxing Autonomous Agents](https://www.ikangai.com/the-complete-guide-to-sandboxing-autonomous-agents-tools-frameworks-and-safety-essentials/)

**Mitigation:**
- E2B provides hardware-level isolation (Firecracker)
- Network isolation per sandbox
- No cross-session data access

### Risk 4: Version Storage Costs
**Mitigation:**
- Compress snapshots (tar.gz)
- Deduplicate unchanged files across versions (future optimization)
- Consider tiered storage for older versions

---

## Verification Plan

### Local Development Testing
1. Start Next.js frontend: `npm run dev`
2. Start backend server: `npm run dev`
3. Create new chat session
4. Request: "Create a todo app with dark mode"
5. Verify:
   - Agent streams responses
   - Tool calls visible in activity panel
   - Files created in sandbox
   - Preview loads in iframe
   - New version auto-created
   - Version list shows new entry
   - Iterative refinement works ("make the buttons rounded")
   - Version duplication works
   - Deploy to Vercel preview works

### Production Testing
1. Deploy frontend to Vercel
2. Deploy backend to Render
3. End-to-end test with real users
4. Monitor error rates and latency
5. Iterate based on feedback

---

## References

1. [Anthropic - Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
2. [Claude Agent SDK Documentation](https://platform.claude.com/docs/en/agent-sdk/overview)
3. [Claude Opus 4.5 Announcement](https://www.anthropic.com/news/claude-opus-4-5)
4. [E2B Documentation](https://e2b.dev/docs)
5. [How Manus Uses E2B](https://e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers)
6. [Manus Context Engineering Lessons](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
7. [Manus Technical Investigation](https://gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f)
8. [shadcn/ui AI Components](https://www.shadcn.io/ai)
9. [Vercel AI SDK](https://ai-sdk.dev/)
10. [Next.js App Router Docs](https://nextjs.org/docs/app)
11. [AI UI Patterns - patterns.dev](https://www.patterns.dev/react/ai-ui-patterns/)
12. [Cursor AI Architecture](https://medium.com/@lakkannawalikar/cursor-ai-architecture-system-prompts-and-tools-deep-dive-77f44cb1c6b0)
13. [Replit Multi-Agent Architecture](https://www.zenml.io/llmops-database/building-a-production-ready-multi-agent-coding-assistant)
14. [Claude 4.5 Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
15. [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
16. [Vercel Deploy API](https://vercel.com/docs/rest-api/endpoints#create-a-new-deployment)
