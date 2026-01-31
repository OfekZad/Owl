import { Sandbox } from '@e2b/code-interpreter';
import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '../types/index.js';

// Store active sandboxes by session ID (in-memory cache)
const activeSandboxes = new Map<string, Sandbox>();

// Store sandbox IDs for reconnection (persists across requests via closure)
const sandboxIds = new Map<string, string>();

// Store last activity time for keep-alive
const lastActivityTime = new Map<string, number>();

// Keep-alive interval (ping every 5 minutes)
const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000;

// Sandbox timeout - 1 hour (maximum practical for user sessions)
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;

// Callback type for broadcasting activities
type BroadcastCallback = (sessionId: string, activity: Activity) => void;

export class SandboxService {
  private broadcastActivity: BroadcastCallback;
  private keepAliveIntervals = new Map<string, NodeJS.Timeout>();

  constructor(broadcastCallback: BroadcastCallback) {
    this.broadcastActivity = broadcastCallback;
  }

  /**
   * Check if a sandbox is still alive and responsive
   */
  private async isSandboxAlive(sandbox: Sandbox): Promise<boolean> {
    try {
      // Try a simple operation to verify sandbox is responsive
      await sandbox.commands.run('echo "ping"', { timeoutMs: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get or create a sandbox - handles reconnection automatically
   */
  private async getOrCreateSandbox(sessionId: string): Promise<Sandbox> {
    // Check in-memory cache first
    const cached = activeSandboxes.get(sessionId);
    if (cached) {
      // Verify it's still alive
      const alive = await this.isSandboxAlive(cached);
      if (alive) {
        // Update last activity time
        lastActivityTime.set(sessionId, Date.now());
        return cached;
      } else {
        // Sandbox died, clean up
        this.cleanupSandbox(sessionId);
        // Notify frontend
        this.emitActivity(sessionId, 'sandbox_expired', {
          message: 'Sandbox has expired. Click "Restart Sandbox" to continue.'
        });
        throw new Error('SANDBOX_EXPIRED');
      }
    }

    // Try to reconnect if we have a stored sandboxId
    const storedId = sandboxIds.get(sessionId);
    if (storedId) {
      try {
        const sandbox = await Sandbox.connect(storedId);
        // Verify it's responsive
        const alive = await this.isSandboxAlive(sandbox);
        if (alive) {
          activeSandboxes.set(sessionId, sandbox);
          lastActivityTime.set(sessionId, Date.now());
          this.startKeepAlive(sessionId);
          return sandbox;
        }
      } catch {
        // Sandbox expired or not found
      }
      // Clean up stale reference
      this.cleanupSandbox(sessionId);
      this.emitActivity(sessionId, 'sandbox_expired', {
        message: 'Sandbox has expired. Click "Restart Sandbox" to continue.'
      });
      throw new Error('SANDBOX_EXPIRED');
    }

    // No sandbox exists
    throw new Error('NO_SANDBOX');
  }

  /**
   * Clean up sandbox references
   */
  private cleanupSandbox(sessionId: string): void {
    activeSandboxes.delete(sessionId);
    sandboxIds.delete(sessionId);
    lastActivityTime.delete(sessionId);

    // Stop keep-alive
    const interval = this.keepAliveIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.keepAliveIntervals.delete(sessionId);
    }
  }

  /**
   * Start keep-alive interval for a sandbox
   */
  private startKeepAlive(sessionId: string): void {
    // Clear existing interval if any
    const existing = this.keepAliveIntervals.get(sessionId);
    if (existing) {
      clearInterval(existing);
    }

    const interval = setInterval(async () => {
      try {
        await this.keepAlive(sessionId);
      } catch {
        // Sandbox probably expired, clean up
        this.cleanupSandbox(sessionId);
      }
    }, KEEPALIVE_INTERVAL_MS);

    this.keepAliveIntervals.set(sessionId, interval);
  }

  /**
   * Keep sandbox alive - call periodically to prevent timeout
   */
  async keepAlive(sessionId: string): Promise<{ alive: boolean; remainingMs?: number }> {
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) {
      return { alive: false };
    }

    try {
      // Ping the sandbox to keep it alive
      const alive = await this.isSandboxAlive(sandbox);
      if (alive) {
        lastActivityTime.set(sessionId, Date.now());
        const lastActive = lastActivityTime.get(sessionId) || Date.now();
        const remainingMs = SANDBOX_TIMEOUT_MS - (Date.now() - lastActive);
        return { alive: true, remainingMs: Math.max(0, remainingMs) };
      }
    } catch {
      // Sandbox is dead
    }

    this.cleanupSandbox(sessionId);
    this.emitActivity(sessionId, 'sandbox_expired', {
      message: 'Sandbox has expired. Click "Restart Sandbox" to continue.'
    });
    return { alive: false };
  }

  /**
   * Create a new E2B sandbox for a session
   */
  async createSandbox(sessionId: string): Promise<{ sandboxId: string; previewUrl: string }> {
    // Check if we can reconnect to existing sandbox
    try {
      const existing = await this.getOrCreateSandbox(sessionId);
      const previewUrl = await this.getPreviewUrl(existing);
      return { sandboxId: existing.sandboxId, previewUrl };
    } catch (error) {
      // If it's a sandbox expired error, we need to create new one
      // Otherwise for NO_SANDBOX, we also create new one
      if (error instanceof Error && error.message === 'SANDBOX_EXPIRED') {
        // Clean up was already done, proceed to create new
      }
    }

    // Broadcast sandbox creation start
    this.emitActivity(sessionId, 'terminal', {
      output: '🚀 Creating E2B sandbox environment...',
      type: 'info'
    });

    try {
      // Create new sandbox with 1 hour timeout
      const sandbox = await Sandbox.create({
        timeoutMs: SANDBOX_TIMEOUT_MS,
      });

      // Store in both maps
      activeSandboxes.set(sessionId, sandbox);
      sandboxIds.set(sessionId, sandbox.sandboxId);
      lastActivityTime.set(sessionId, Date.now());

      // Start keep-alive
      this.startKeepAlive(sessionId);

      // Get the preview URL
      const previewUrl = await this.getPreviewUrl(sandbox);

      // Broadcast success
      this.emitActivity(sessionId, 'terminal', {
        output: `✅ Sandbox created: ${sandbox.sandboxId}`,
        type: 'success'
      });

      // Broadcast preview URL
      this.emitActivity(sessionId, 'preview_ready', {
        url: previewUrl
      });

      return { sandboxId: sandbox.sandboxId, previewUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emitActivity(sessionId, 'error', {
        message: `Failed to create sandbox: ${errorMessage}`
      });
      throw error;
    }
  }

  /**
   * Download all code from the sandbox as a structured object
   */
  async downloadCode(sessionId: string): Promise<{ files: Array<{ path: string; content: string }> }> {
    let sandbox: Sandbox;
    try {
      sandbox = await this.getOrCreateSandbox(sessionId);
    } catch {
      throw new Error('No active sandbox for this session. Cannot download code.');
    }

    const files: Array<{ path: string; content: string }> = [];

    // Recursively collect all files from /home/user/app
    const collectFiles = async (dirPath: string) => {
      try {
        const entries = await sandbox.files.list(dirPath);
        for (const entry of entries) {
          const fullPath = `${dirPath}/${entry.name}`;
          if (entry.type === 'dir') {
            // Skip node_modules and .next
            if (entry.name !== 'node_modules' && entry.name !== '.next') {
              await collectFiles(fullPath);
            }
          } else {
            try {
              const content = await sandbox.files.read(fullPath);
              // Store path relative to /home/user/app
              const relativePath = fullPath.replace('/home/user/app/', '');
              files.push({ path: relativePath, content });
            } catch {
              // Skip files that can't be read (binary, etc.)
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    };

    await collectFiles('/home/user/app');

    this.emitActivity(sessionId, 'terminal', {
      output: `📦 Downloaded ${files.length} files from sandbox`,
      type: 'info'
    });

    return { files };
  }

  /**
   * Execute a command in the sandbox
   */
  async executeCommand(sessionId: string, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let sandbox: Sandbox;
    try {
      sandbox = await this.getOrCreateSandbox(sessionId);
    } catch {
      throw new Error('No active sandbox for this session. Please start a new chat.');
    }

    // Broadcast command execution start
    this.emitActivity(sessionId, 'terminal', {
      output: `$ ${command}`,
      type: 'command'
    });

    try {
      const result = await sandbox.commands.run(command, {
        timeoutMs: 60000, // 1 minute timeout per command
        onStdout: (data) => {
          this.emitActivity(sessionId, 'terminal', {
            output: data,
            type: 'stdout'
          });
        },
        onStderr: (data) => {
          this.emitActivity(sessionId, 'terminal', {
            output: data,
            type: 'stderr'
          });
        }
      });

      // Broadcast exit code
      if (result.exitCode !== 0) {
        this.emitActivity(sessionId, 'terminal', {
          output: `Process exited with code ${result.exitCode}`,
          type: 'error'
        });
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emitActivity(sessionId, 'error', {
        message: `Command execution failed: ${errorMessage}`
      });
      throw error;
    }
  }

  /**
   * Write a file to the sandbox
   */
  async writeFile(sessionId: string, path: string, content: string): Promise<void> {
    let sandbox: Sandbox;
    try {
      sandbox = await this.getOrCreateSandbox(sessionId);
    } catch {
      throw new Error('No active sandbox for this session');
    }

    try {
      await sandbox.files.write(path, content);

      // Broadcast file change
      this.emitActivity(sessionId, 'file_change', {
        action: 'write',
        path,
        size: content.length
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emitActivity(sessionId, 'error', {
        message: `Failed to write file ${path}: ${errorMessage}`
      });
      throw error;
    }
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(sessionId: string, path: string): Promise<string> {
    let sandbox: Sandbox;
    try {
      sandbox = await this.getOrCreateSandbox(sessionId);
    } catch {
      throw new Error('No active sandbox for this session');
    }

    try {
      const content = await sandbox.files.read(path);
      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emitActivity(sessionId, 'error', {
        message: `Failed to read file ${path}: ${errorMessage}`
      });
      throw error;
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(sessionId: string, path: string = '/'): Promise<Array<{ name: string; isDir: boolean }>> {
    let sandbox: Sandbox;
    try {
      sandbox = await this.getOrCreateSandbox(sessionId);
    } catch {
      throw new Error('No active sandbox for this session');
    }

    try {
      const files = await sandbox.files.list(path);
      return files.map(f => ({
        name: f.name,
        isDir: f.type === 'dir'
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emitActivity(sessionId, 'error', {
        message: `Failed to list files in ${path}: ${errorMessage}`
      });
      throw error;
    }
  }

  /**
   * Start a dev server and return the preview URL
   */
  async startDevServer(sessionId: string, port: number = 3000): Promise<string> {
    let sandbox: Sandbox;
    try {
      sandbox = await this.getOrCreateSandbox(sessionId);
    } catch {
      throw new Error('No active sandbox for this session');
    }

    // Broadcast server start
    this.emitActivity(sessionId, 'terminal', {
      output: `🌐 Starting dev server on port ${port}...`,
      type: 'info'
    });

    // Run the dev server in background
    sandbox.commands.run(`cd /home/user/app && npm run dev -- --port ${port}`, {
      background: true,
      onStdout: (data) => {
        this.emitActivity(sessionId, 'terminal', {
          output: data,
          type: 'stdout'
        });
      },
      onStderr: (data) => {
        this.emitActivity(sessionId, 'terminal', {
          output: data,
          type: 'stderr'
        });
      }
    });

    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get and return the preview URL
    const previewUrl = sandbox.getHost(port);

    this.emitActivity(sessionId, 'preview_ready', {
      url: `https://${previewUrl}`
    });

    return `https://${previewUrl}`;
  }

  /**
   * Get the preview URL for a sandbox
   */
  private async getPreviewUrl(sandbox: Sandbox): Promise<string> {
    // E2B provides a host URL for accessing ports
    const host = sandbox.getHost(3000);
    return `https://${host}`;
  }

  /**
   * Close a sandbox
   */
  async closeSandbox(sessionId: string): Promise<void> {
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) {
      return;
    }

    try {
      await sandbox.kill();
      activeSandboxes.delete(sessionId);

      this.emitActivity(sessionId, 'terminal', {
        output: '🛑 Sandbox closed',
        type: 'info'
      });
    } catch (error) {
      console.error(`Failed to close sandbox for session ${sessionId}:`, error);
    }
  }

  /**
   * Get sandbox status
   */
  getSandboxStatus(sessionId: string): { active: boolean; sandboxId?: string } {
    const sandbox = activeSandboxes.get(sessionId);
    if (sandbox) {
      return { active: true, sandboxId: sandbox.sandboxId };
    }
    return { active: false };
  }

  /**
   * Helper to emit activity via WebSocket
   */
  private emitActivity(sessionId: string, type: Activity['type'], data: Record<string, unknown>): void {
    const activity: Activity = {
      id: uuidv4(),
      sessionId,
      type,
      data,
      timestamp: new Date()
    };
    this.broadcastActivity(sessionId, activity);
  }
}
