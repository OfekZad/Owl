# Migration Plan: E2B to Vercel Sandbox

> **Status**: Draft - For Future Implementation
> **Created**: January 31, 2026

## Overview

Migrate Owl's backend from `@e2b/code-interpreter` to `@vercel/sandbox` to leverage snapshots, SSH access, and native Vercel integration.

---

## Why Migrate?

| Feature | E2B (Current) | Vercel Sandbox |
|---------|---------------|----------------|
| Cold start | ~30s (npm install) | ~2s from snapshot |
| Authentication | API key | Auto OIDC on Vercel |
| Sandbox listing | Not available | Full management API |
| SSH access | Not available | CLI support |
| State persistence | Not available | Snapshots (7-day expiry) |
| Timeout extension | Not available | Programmatic |

---

## Phase 1: Setup & Dependencies

### 1.1 Update package.json
```diff
- "@e2b/code-interpreter": "^1.0.0",
+ "@vercel/sandbox": "^1.0.0",
```

### 1.2 Update Environment
```diff
- E2B_API_KEY=your_e2b_api_key
+ # Vercel OIDC (auto-populated via vercel env pull)
+ VERCEL_OIDC_TOKEN=auto
```

### 1.3 Link Project
```bash
cd owl-backend
vercel link
vercel env pull
```

---

## Phase 2: Sandbox Service Migration

### File: `src/services/sandbox-service.ts`

### 2.1 Imports
```diff
- import { Sandbox } from '@e2b/code-interpreter';
+ import { Sandbox, Snapshot } from '@vercel/sandbox';
```

### 2.2 Create Sandbox
```diff
- const sandbox = await Sandbox.create({
-   timeoutMs: 30 * 60 * 1000
- });
+ const sandbox = await Sandbox.create({
+   runtime: 'node24',
+   timeout: 30 * 60 * 1000,
+   ports: [3000, 3001, 5173]  // Must declare upfront
+ });
```

### 2.3 Reconnect to Existing Sandbox
```diff
- const sandbox = await Sandbox.connect(sandboxId);
+ const sandbox = await Sandbox.get({ sandboxId });
```

### 2.4 Kill Sandbox
```diff
- await sandbox.kill();
+ await sandbox.stop();
```

### 2.5 Get Preview URL
```diff
- const url = sandbox.getHost(3000);
+ const url = sandbox.domain(3000);
```

---

## Phase 3: Command Execution Migration

### 3.1 Basic Command (Blocking)
```diff
- const result = await sandbox.commands.run(command, {
-   timeoutMs: 60000,
-   onStdout: (data) => broadcast(sessionId, { type: 'terminal', content: data }),
-   onStderr: (data) => broadcast(sessionId, { type: 'terminal', content: data })
- });
+ const result = await sandbox.runCommand({
+   cmd: command,
+   args: [],
+   stdout: new Writable({
+     write(chunk, _, cb) {
+       broadcast(sessionId, { type: 'terminal', content: chunk.toString() });
+       cb();
+     }
+   }),
+   stderr: new Writable({
+     write(chunk, _, cb) {
+       broadcast(sessionId, { type: 'terminal', content: chunk.toString() });
+       cb();
+     }
+   })
+ });
```

### 3.2 Background/Detached Command (Dev Server)
```diff
- await sandbox.commands.run('npm run dev', {
-   background: true,
-   onStdout: (data) => { /* ... */ }
- });
+ const devServer = await sandbox.runCommand({
+   cmd: 'npm',
+   args: ['run', 'dev'],
+   detached: true,
+   stdout: createBroadcastStream(sessionId)
+ });
+ // Later: await devServer.wait() or devServer.kill()
```

---

## Phase 4: File Operations Migration

### 4.1 Write File
```diff
- await sandbox.files.write(path, content);
+ await sandbox.writeFiles([{ path, content: Buffer.from(content) }]);
```

### 4.2 Read File
```diff
- const content = await sandbox.files.read(path);
+ const buffer = await sandbox.readFileToBuffer({ path });
+ const content = buffer?.toString() ?? null;
```

### 4.3 List Directory
```diff
- const files = await sandbox.files.list(dirPath);
- return files.map(f => ({ name: f.name, type: f.type }));
+ const result = await sandbox.runCommand('ls', ['-la', dirPath]);
+ const output = await result.stdout();
+ // Parse ls output
```

### 4.4 Create Directory
```diff
- // E2B creates implicitly
+ await sandbox.mkDir(dirPath);
```

---

## Phase 5: Implement Snapshots (Key Feature)

### 5.1 Create Base Snapshot After Init
```typescript
async function createBaseSnapshot(sandbox: Sandbox): Promise<string> {
  await initializeNextJsProject(sandbox);
  const snapshot = await sandbox.snapshot();
  // Note: sandbox stops after snapshot()
  return snapshot.snapshotId;
}
```

### 5.2 Fast Sandbox Creation from Snapshot
```typescript
const BASE_SNAPSHOT_ID = process.env.VERCEL_SANDBOX_BASE_SNAPSHOT;

async function createSandboxFast(): Promise<Sandbox> {
  if (BASE_SNAPSHOT_ID) {
    return Sandbox.create({
      source: { type: 'snapshot', snapshotId: BASE_SNAPSHOT_ID },
      ports: [3000]
    });
  }
  return createFreshSandbox();
}
```

---

## Phase 6: Complete Service Implementation

```typescript
// src/services/vercel-sandbox-service.ts
import { Sandbox, Snapshot } from '@vercel/sandbox';
import { Writable } from 'stream';

const activeSandboxes = new Map<string, Sandbox>();
const BASE_SNAPSHOT_ID = process.env.VERCEL_SANDBOX_BASE_SNAPSHOT;

export class VercelSandboxService {
  async createSandbox(sessionId: string): Promise<{ sandboxId: string; previewUrl: string }> {
    let sandbox: Sandbox;

    if (BASE_SNAPSHOT_ID) {
      sandbox = await Sandbox.create({
        source: { type: 'snapshot', snapshotId: BASE_SNAPSHOT_ID },
        timeout: 30 * 60 * 1000,
        ports: [3000]
      });
    } else {
      sandbox = await Sandbox.create({
        runtime: 'node24',
        timeout: 30 * 60 * 1000,
        ports: [3000]
      });
      await this.initializeProject(sandbox, sessionId);
    }

    activeSandboxes.set(sessionId, sandbox);
    await this.startDevServer(sandbox, sessionId);

    return {
      sandboxId: sandbox.sandboxId,
      previewUrl: sandbox.domain(3000)
    };
  }

  async reconnect(sessionId: string, sandboxId: string): Promise<Sandbox> {
    const sandbox = await Sandbox.get({ sandboxId });
    activeSandboxes.set(sessionId, sandbox);
    return sandbox;
  }

  async runCommand(
    sessionId: string,
    command: string,
    broadcast: (activity: Activity) => void
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) throw new Error('No active sandbox');

    let stdout = '';
    let stderr = '';

    const result = await sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', command],
      stdout: new Writable({
        write(chunk, _, cb) {
          const text = chunk.toString();
          stdout += text;
          broadcast({ type: 'terminal', content: text, stream: 'stdout' });
          cb();
        }
      }),
      stderr: new Writable({
        write(chunk, _, cb) {
          const text = chunk.toString();
          stderr += text;
          broadcast({ type: 'terminal', content: text, stream: 'stderr' });
          cb();
        }
      })
    });

    return { exitCode: result.exitCode, stdout, stderr };
  }

  async writeFile(sessionId: string, path: string, content: string): Promise<void> {
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) throw new Error('No active sandbox');
    await sandbox.writeFiles([{ path, content: Buffer.from(content) }]);
  }

  async readFile(sessionId: string, path: string): Promise<string | null> {
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) throw new Error('No active sandbox');
    const buffer = await sandbox.readFileToBuffer({ path });
    return buffer?.toString() ?? null;
  }

  async stopSandbox(sessionId: string): Promise<void> {
    const sandbox = activeSandboxes.get(sessionId);
    if (sandbox) {
      await sandbox.stop();
      activeSandboxes.delete(sessionId);
    }
  }

  private async startDevServer(sandbox: Sandbox, sessionId: string): Promise<void> {
    await sandbox.runCommand({
      cmd: 'npm',
      args: ['run', 'dev'],
      detached: true
    });
  }

  private async initializeProject(sandbox: Sandbox, sessionId: string): Promise<void> {
    // Existing initialization logic
  }
}
```

---

## Phase 7: Testing Checklist

- [ ] Sandbox creation works with OIDC token
- [ ] Sandbox creation from snapshot works
- [ ] Command execution streams output correctly
- [ ] Detached commands (dev server) start properly
- [ ] File write/read operations work
- [ ] Preview URL (domain) returns accessible URL
- [ ] Sandbox reconnection works after restart
- [ ] Sandbox stop/cleanup works
- [ ] Snapshot creation and restoration works
- [ ] Timeout extension works for long sessions

---

## Phase 8: Deployment

### 8.1 Create Base Snapshot (One-time)
```bash
npx ts-node scripts/create-base-snapshot.ts
# Output: VERCEL_SANDBOX_BASE_SNAPSHOT=snap_abc123
```

### 8.2 Add to Vercel Environment
```bash
vercel env add VERCEL_SANDBOX_BASE_SNAPSHOT
```

### 8.3 Deploy
```bash
vercel deploy --prod
```

---

## Rollback Plan

Use feature flag during transition:

```typescript
const USE_VERCEL_SANDBOX = process.env.USE_VERCEL_SANDBOX === 'true';

const sandboxService = USE_VERCEL_SANDBOX
  ? new VercelSandboxService()
  : new E2BSandboxService();
```

---

## References

- [Vercel Sandbox Docs](https://vercel.com/docs/vercel-sandbox)
- [Vercel Sandbox SDK Reference](https://vercel.com/kb/sandbox)
- [How to Execute AI-Generated Code Safely](https://vercel.com/kb/guide/how-to-execute-ai-generated-code-safely)
