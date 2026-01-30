export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
}

export interface Version {
  id: string;
  sessionId: string;
  parentVersionId: string | null;
  number: number;
  filesystemSnapshot: string;
  chatHistory: Message[];
  vercelDeploymentId: string | null;
  previewUrl: string | null;
  createdAt: Date;
}

export interface Session {
  id: string;
  currentVersionId: string | null;
  sandboxId: string | null;
  previewUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Activity {
  id: string;
  sessionId: string;
  type: 'tool_call' | 'terminal' | 'file_change' | 'preview_ready' | 'error';
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}
