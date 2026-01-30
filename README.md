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
Frontend (Next.js/Vercel) → Backend (Express/Render) → E2B Sandbox
                                    ↓
                           Version Storage (Vercel Blob)
```

## Tech Stack

- **AI**: Claude Opus 4.5 via Claude Agents SDK
- **Frontend**: Next.js 14+, shadcn/ui, Tailwind CSS
- **Backend**: Express.js, WebSockets
- **Sandbox**: E2B (Firecracker microVMs)
- **Storage**: Vercel Blob for snapshots
- **Deployment**: Vercel (frontend), Render (backend)

## Documentation

See [PLAN.md](./PLAN.md) for the complete technical specification.

## Status

🚧 In Development
