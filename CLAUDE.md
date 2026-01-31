# Owl Project - AI Assistant Guide

> Comprehensive documentation for AI assistants working with the Owl codebase.

## Project Overview

**Owl** is an AI-powered web app generator with a v0-like experience. Users describe what they want in a chat interface, and Claude Opus 4.5 generates complete web applications in real-time.

### Key Features
- Split-screen UI: Chat on the left, live agent activity on the right
- Real-time code generation in isolated E2B sandboxes
- Live preview with hot reloading
- Auto-versioning for every change
- Vercel deployment integration

### Architecture
```
Frontend (Next.js/Vercel) ──> Backend (Express/Render) ──> E2B Sandbox
         │                            │                         │
         │                     Claude Opus 4.5              Firecracker VM
         │                            │
         └─────── WebSocket ──────────┘ (real-time activity)
```

### Tech Stack
| Layer | Technology |
|-------|------------|
| AI | Claude Opus 4.5 via Anthropic SDK |
| Frontend | Next.js 15, React 19, shadcn/ui, Tailwind CSS |
| Backend | Express.js 4.21, WebSockets |
| Sandbox | E2B (Firecracker microVMs) |
| Storage | Vercel Blob (filesystem snapshots) |
| Deployment | Vercel (frontend), Render (backend) |

---

## Codebase Structure

```
/home/user/Owl/
├── CLAUDE.md              # This file - AI assistant guide
├── README.md              # User-facing documentation
├── PLAN.md                # Technical specification (36KB)
│
├── owl-app/               # Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                    # Home page - session creation
│   │   │   ├── layout.tsx                  # Root layout
│   │   │   └── chat/[sessionId]/page.tsx   # Main chat interface
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                # shadcn/ui primitives (17 components)
│   │   │   ├── chat/              # Chat interface components
│   │   │   │   ├── message-list.tsx
│   │   │   │   ├── chat-input.tsx
│   │   │   │   └── message.tsx
│   │   │   ├── activity/          # Real-time activity panel
│   │   │   │   ├── activity-panel.tsx
│   │   │   │   ├── activity-feed.tsx
│   │   │   │   ├── file-browser.tsx
│   │   │   │   ├── terminal-output.tsx
│   │   │   │   └── preview-frame.tsx
│   │   │   └── versions/          # Version management
│   │   │       ├── version-list.tsx
│   │   │       └── version-card.tsx
│   │   │
│   │   ├── types/index.ts         # Shared TypeScript types
│   │   └── lib/utils.ts           # cn() helper for class merging
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.js
│   ├── vitest.config.ts
│   └── components.json           # shadcn/ui configuration
│
└── owl-backend/           # Express backend
    ├── src/
    │   ├── index.ts              # Server entry + WebSocket setup
    │   ├── app.ts                # Express routes (25+ endpoints)
    │   │
    │   ├── services/
    │   │   ├── session-service.ts   # Session CRUD operations
    │   │   ├── version-service.ts   # Version management + auto-versioning
    │   │   ├── chat-service.ts      # Claude integration + agentic loop
    │   │   ├── sandbox-service.ts   # E2B sandbox lifecycle
    │   │   └── activity-service.ts  # Activity logging
    │   │
    │   ├── db/index.ts           # In-memory database (Maps)
    │   └── types/index.ts        # Backend TypeScript types
    │
    ├── tests/                    # Vitest test files
    │   ├── session-service.test.ts
    │   ├── version-service.test.ts
    │   ├── chat-service.test.ts
    │   ├── activity-service.test.ts
    │   ├── db.test.ts
    │   └── api-routes.test.ts
    │
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── Dockerfile
    └── render.yaml
```

---

## Key Files Reference

### Frontend Critical Files

| File | Purpose |
|------|---------|
| `owl-app/src/app/chat/[sessionId]/page.tsx` | Main chat interface with split-screen layout |
| `owl-app/src/components/activity/preview-frame.tsx` | Iframe preview with retry/refresh logic |
| `owl-app/src/components/chat/message-list.tsx` | Message history with auto-scroll |
| `owl-app/src/types/index.ts` | Shared types (Message, ToolCall, Version, Session) |
| `owl-app/tailwind.config.ts` | Theme colors using CSS variables (HSL) |

### Backend Critical Files

| File | Purpose |
|------|---------|
| `owl-backend/src/services/chat-service.ts` | Claude integration with agentic tool loop |
| `owl-backend/src/services/sandbox-service.ts` | E2B sandbox lifecycle management |
| `owl-backend/src/app.ts` | All REST API route definitions |
| `owl-backend/src/index.ts` | WebSocket server + activity broadcasting |
| `owl-backend/src/db/index.ts` | In-memory storage implementation |

---

## Development Workflows

### Local Development

```bash
# Terminal 1: Start backend (port 3001)
cd owl-backend
npm install
npm run dev

# Terminal 2: Start frontend (port 3000)
cd owl-app
npm install
npm run dev
```

### Running Tests

```bash
# Backend tests (93%+ coverage)
cd owl-backend
npm test                    # Run all tests
npm run test:coverage       # With coverage report

# Frontend tests
cd owl-app
npm test                    # Run all tests
npm run test:coverage       # With coverage report
```

### Building for Production

```bash
# Frontend
cd owl-app
npm run build

# Backend
cd owl-backend
npm run build               # TypeScript -> dist/
```

---

## API Reference

### Session Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/:id` | Get session details |
| DELETE | `/api/sessions/:id` | Delete session |

### Version Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions/:id/versions` | Create version snapshot |
| GET | `/api/sessions/:id/versions` | List all versions |
| GET | `/api/versions/:id` | Get single version |
| POST | `/api/versions/:id/duplicate` | Duplicate version |

### Chat Endpoint
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message to Claude (agentic loop) |

### Sandbox Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions/:id/sandbox` | Create sandbox |
| GET | `/api/sessions/:id/sandbox` | Get sandbox status |
| POST | `/api/sessions/:id/sandbox/execute` | Run command |
| POST | `/api/sessions/:id/sandbox/files` | Write file |
| GET | `/api/sessions/:id/sandbox/files` | Read file |
| GET | `/api/sessions/:id/sandbox/files/list` | List directory |
| POST | `/api/sessions/:id/sandbox/server` | Start dev server |
| POST | `/api/sessions/:id/sandbox/keepalive` | Ping sandbox |
| GET | `/api/sessions/:id/sandbox/download` | Download all code |
| POST | `/api/sessions/:id/sandbox/restart` | Recreate sandbox |
| DELETE | `/api/sessions/:id/sandbox` | Close sandbox |

### WebSocket
- **Path**: `/ws?sessionId=<id>`
- **Events**: `tool_call`, `terminal`, `file_change`, `preview_ready`, `error`, `sandbox_expired`

---

## Coding Conventions

### TypeScript
- **Strict mode** enabled in both frontend and backend
- All entities use **UUID v4** for IDs
- Types defined in `src/types/index.ts`

### Frontend Patterns
```typescript
// Component structure: forwardRef + Radix UI
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)

// Class merging with cn() helper
import { cn } from "@/lib/utils"
cn("base-class", condition && "conditional-class", className)
```

### Backend Patterns
```typescript
// Service layer pattern
export const sessionService = {
  createSession: async (): Promise<Session> => { ... },
  getSession: async (id: string): Promise<Session | null> => { ... },
}

// Activity broadcasting callback
const onActivity = (activity: Activity) => {
  broadcastActivity(sessionId, activity)
}
```

### CSS/Styling
- **Tailwind CSS** with utility-first approach
- **CSS variables** for theming (HSL colors)
- **shadcn/ui** components as base primitives

---

## Important Patterns

### Agentic Loop (chat-service.ts)
The chat service implements Claude's tool use in a loop:
1. Send user message + tool definitions to Claude
2. Claude responds with text and/or tool_use blocks
3. Execute tools in sandbox (write_file, run_command)
4. Add tool results to message history
5. Continue loop until no more tool calls
6. Return final text response

### Sandbox Lifecycle (sandbox-service.ts)
- Sandboxes have 1-hour timeout
- Keep-alive pings every 5 minutes
- Auto-reconnection to existing sandboxes
- Broadcasts activity events via WebSocket

### Pre-installed in Sandbox
The sandbox initializes with:
- Next.js 15 project structure
- 17 shadcn/ui components
- 3 layout templates (dashboard, sidebar, minimal)
- Tailwind CSS + PostCSS configuration

---

## Environment Variables

### Backend (owl-backend/.env)
```env
ANTHROPIC_API_KEY=sk-ant-...     # Required: Claude API key
E2B_API_KEY=e2b_...              # Required: E2B sandbox API key
VERCEL_TOKEN=...                  # Optional: For deployments
BLOB_READ_WRITE_TOKEN=...         # Optional: Vercel Blob storage
PORT=3001                         # Server port
FRONTEND_URL=http://localhost:3000
```

### Frontend (owl-app/.env.local)
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

---

## Deployment

### Production URLs
- **Frontend**: https://owl-ochre.vercel.app
- **Backend**: https://owl-backend-g101.onrender.com

### Render API Operations

#### Trigger Backend Deploy
```bash
curl -X POST "https://api.render.com/v1/services/srv-d5ujf84hg0os73av0cbg/deploys" \
  -H "Authorization: Bearer rnd_jrQm9OihMBbQ1VYQMEBw1keynwVq" \
  -H "Content-Type: application/json"
```

#### Check Deploy Status
```bash
curl -s "https://api.render.com/v1/services/srv-d5ujf84hg0os73av0cbg/deploys?limit=3" \
  -H "Authorization: Bearer rnd_jrQm9OihMBbQ1VYQMEBw1keynwVq"
```

### Service IDs
- **Render API Key**: `rnd_jrQm9OihMBbQ1VYQMEBw1keynwVq`
- **owl-backend Service ID**: `srv-d5ujf84hg0os73av0cbg`

---

## Common Tasks for AI Assistants

### Adding a New shadcn/ui Component
1. Add component to `owl-app/src/components/ui/`
2. Follow existing patterns (forwardRef, Radix primitives)
3. Export from component file
4. If needed in sandbox, add to `chat-service.ts` initialization

### Adding a New API Endpoint
1. Add route in `owl-backend/src/app.ts`
2. Implement logic in appropriate service file
3. Add types to `owl-backend/src/types/index.ts`
4. Write test in `owl-backend/tests/`

### Modifying Chat Behavior
1. Edit system prompt in `chat-service.ts` (line ~50)
2. Add/modify tools in the tools array
3. Update tool handlers in the agentic loop

### Debugging Sandbox Issues
1. Check `sandbox-service.ts` for lifecycle management
2. Review keep-alive mechanism (5-minute intervals)
3. Check E2B dashboard for sandbox status
4. Look for `sandbox_expired` activity events

---

## Testing Guidelines

### Backend Test Structure
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db'

describe('ServiceName', () => {
  beforeEach(() => {
    db.clear() // Reset state between tests
  })

  it('should do something', async () => {
    // Arrange, Act, Assert
  })
})
```

### Frontend Test Structure
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<Component />)
    expect(screen.getByText('...')).toBeInTheDocument()
  })
})
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Sandbox timeout | Check keep-alive mechanism, extend timeout in sandbox-service.ts |
| Preview not loading | Check preview-frame.tsx retry logic, verify dev server started |
| WebSocket disconnection | Check CORS settings, verify session ID in URL |
| Type errors | Run `npm run build` to see TypeScript errors |

### Log Locations
- Backend logs: Console output (Render dashboard for production)
- Frontend logs: Browser console
- Activity events: WebSocket messages / ActivityPanel

---

## Architecture Decisions

1. **In-memory database**: Simplified development, no external dependencies. For production scale, consider PostgreSQL.

2. **E2B sandboxes**: Provide isolated execution environments. Each user session gets its own Firecracker VM.

3. **WebSocket for real-time**: Activity events streamed to frontend for live updates during code generation.

4. **Auto-versioning**: Every chat interaction creates a version snapshot for easy rollback.

5. **shadcn/ui pre-installed**: Claude generates apps using these components, ensuring consistent UI.
