# Owl - AI-Powered Web App Generator

An autonomous AI agent that generates complete web applications based on natural language requests. Built with Claude Opus 4.5, E2B sandboxes, and shadcn/ui.

## Overview

Owl is a v0-like experience where users describe what they want in a chat interface, and an AI agent creates production-ready code in real-time. Features include:

- **Split-screen UI**: Chat on the left, live agent activity on the right
- **Real-time code generation**: Watch files being created and modified
- **Live preview**: See your app running in an iframe
- **Auto-versioning**: Every change creates a new version automatically
- **Deploy anywhere**: Push any version to Vercel production or preview

## Architecture

```
Frontend (Next.js/Vercel) -> Backend (Express/Render) -> E2B Sandbox
                                    |
                           Version Storage (Vercel Blob)
```

## Tech Stack

- **AI**: Claude Opus 4.5 via Anthropic SDK
- **Frontend**: Next.js 15, shadcn/ui, Tailwind CSS
- **Backend**: Express.js, WebSockets
- **Sandbox**: E2B (Firecracker microVMs)
- **Storage**: Vercel Blob for snapshots
- **Deployment**: Vercel (frontend), Render (backend)

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Environment Variables

1. Copy the example env files:

```bash
# Backend
cp owl-backend/.env.example owl-backend/.env

# Frontend
cp owl-app/.env.example owl-app/.env.local
```

2. Add your API keys to `owl-backend/.env`:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key
E2B_API_KEY=your_e2b_api_key
VERCEL_TOKEN=your_vercel_token
PORT=3001
FRONTEND_URL=http://localhost:3000
```

3. Add backend URL to `owl-app/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### Installation

```bash
# Install backend dependencies
cd owl-backend
npm install

# Install frontend dependencies
cd ../owl-app
npm install
```

### Running Locally

```bash
# Terminal 1: Start backend
cd owl-backend
npm run dev

# Terminal 2: Start frontend
cd owl-app
npm run dev
```

Open http://localhost:3000 in your browser.

## Testing

### Backend Tests

```bash
cd owl-backend
npm test                 # Run tests
npm run test:coverage    # Run with coverage report
```

### Frontend Tests

```bash
cd owl-app
npm test                 # Run tests
npm run test:coverage    # Run with coverage report
```

## Project Structure

```
owl/
├── owl-app/                 # Next.js frontend
│   ├── src/
│   │   ├── app/             # App router pages
│   │   ├── components/      # React components
│   │   │   ├── ui/          # shadcn/ui components
│   │   │   ├── chat/        # Chat interface
│   │   │   ├── activity/    # Activity panel
│   │   │   └── versions/    # Version management
│   │   ├── lib/             # Utilities
│   │   └── types/           # TypeScript types
│   └── package.json
│
├── owl-backend/             # Express backend
│   ├── src/
│   │   ├── services/        # Business logic
│   │   ├── db/              # In-memory database
│   │   ├── types/           # TypeScript types
│   │   ├── app.ts           # Express app
│   │   └── index.ts         # Server entry point
│   ├── tests/               # Test files
│   └── package.json
│
├── PLAN.md                  # Technical specification
└── README.md                # This file
```

## API Documentation

### Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | POST | Create new session |
| `/api/sessions/:id` | GET | Get session by ID |
| `/api/sessions/:id` | DELETE | Delete session |

### Versions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions/:id/versions` | POST | Create new version |
| `/api/sessions/:id/versions` | GET | List versions for session |
| `/api/versions/:id` | GET | Get version by ID |
| `/api/versions/:id/duplicate` | POST | Duplicate a version |

### Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send chat message to Owl |

### WebSocket

Connect to `/ws?sessionId=<id>` for real-time activity updates.

## Test Coverage

- Backend: 93%+ statement coverage, 80%+ branch coverage
- Frontend: Component and integration tests for key flows

## Documentation

See [PLAN.md](./PLAN.md) for the complete technical specification.

## License

MIT
