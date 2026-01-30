import { Sandbox } from '@e2b/code-interpreter';
import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '../types/index.js';

// Store active sandboxes by session ID
const activeSandboxes = new Map<string, Sandbox>();

// Callback type for broadcasting activities
type BroadcastCallback = (sessionId: string, activity: Activity) => void;

export class SandboxService {
  private broadcastActivity: BroadcastCallback;

  constructor(broadcastCallback: BroadcastCallback) {
    this.broadcastActivity = broadcastCallback;
  }

  /**
   * Create a new E2B sandbox for a session
   */
  async createSandbox(sessionId: string): Promise<{ sandboxId: string; previewUrl: string }> {
    // Check if sandbox already exists for this session
    if (activeSandboxes.has(sessionId)) {
      const existing = activeSandboxes.get(sessionId)!;
      const previewUrl = await this.getPreviewUrl(existing);
      return { sandboxId: existing.sandboxId, previewUrl };
    }

    // Broadcast sandbox creation start
    this.emitActivity(sessionId, 'terminal', {
      output: '🚀 Creating E2B sandbox environment...',
      type: 'info'
    });

    try {
      // Create new sandbox
      const sandbox = await Sandbox.create({
        timeoutMs: 10 * 60 * 1000, // 10 minutes timeout
      });

      activeSandboxes.set(sessionId, sandbox);

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
   * Execute a command in the sandbox
   */
  async executeCommand(sessionId: string, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) {
      throw new Error('No active sandbox for this session');
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
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) {
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
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) {
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
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) {
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
    const sandbox = activeSandboxes.get(sessionId);
    if (!sandbox) {
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
