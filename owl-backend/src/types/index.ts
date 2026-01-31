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
  type: 'tool_call' | 'terminal' | 'file_change' | 'preview_ready' | 'error' | 'sandbox_expired';
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface SandboxSession {
  id: string;
  sessionId: string;
  status: 'creating' | 'active' | 'paused' | 'terminated';
  previewUrl: string | null;
  createdAt: Date;
}

export interface CreateSessionResponse {
  session: Session;
  previewUrl: string | null;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
}

export interface VersionListResponse {
  versions: Version[];
}

export interface DeployRequest {
  target: 'preview' | 'production';
}

export interface DeployResponse {
  url: string;
  deploymentId: string;
}
