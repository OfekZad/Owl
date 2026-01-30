'use client';

import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import ReactMarkdown from 'react-markdown';

interface MessageProps {
  message: Message;
}

export function ChatMessage({ message }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full mb-4',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.toolCalls.map((tool) => (
              <div
                key={tool.id}
                className="text-xs bg-background/50 rounded p-2"
              >
                <span className="font-mono font-semibold">{tool.name}</span>
                <span
                  className={cn(
                    'ml-2 px-1.5 py-0.5 rounded text-xs',
                    tool.status === 'completed' && 'bg-green-500/20 text-green-600',
                    tool.status === 'executing' && 'bg-yellow-500/20 text-yellow-600',
                    tool.status === 'error' && 'bg-red-500/20 text-red-600',
                    tool.status === 'pending' && 'bg-gray-500/20 text-gray-600'
                  )}
                >
                  {tool.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
