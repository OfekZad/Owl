'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MessageList } from '@/components/chat/message-list';
import { ChatInput } from '@/components/chat/chat-input';
import { ActivityPanel } from '@/components/activity/activity-panel';
import { VersionList } from '@/components/versions/version-list';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { History, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@/types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: content,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = await response.json();

      if (data.message) {
        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: data.message.content,
          toolCalls: data.message.toolCalls,
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, messages]);

  return (
    <div className="flex h-screen">
      {/* Left Panel: Chat */}
      <div className="w-1/2 flex flex-col border-r">
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-semibold">Owl</h1>
          <Button
            variant={showVersions ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowVersions(!showVersions)}
          >
            {showVersions ? (
              <>
                <X className="h-4 w-4 mr-1" />
                Close
              </>
            ) : (
              <>
                <History className="h-4 w-4 mr-1" />
                Versions
              </>
            )}
          </Button>
        </div>

        {showVersions ? (
          <VersionList sessionId={sessionId} backendUrl={BACKEND_URL} />
        ) : (
          <>
            <MessageList messages={messages} isLoading={isLoading} />
            <ChatInput onSend={handleSendMessage} disabled={isLoading} />
          </>
        )}
      </div>

      {/* Right Panel: Activity */}
      <div className="w-1/2">
        <ActivityPanel sessionId={sessionId} backendUrl={BACKEND_URL} />
      </div>
    </div>
  );
}
