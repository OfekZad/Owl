'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileBrowser } from './file-browser';
import { TerminalOutput } from './terminal-output';
import { PreviewFrame } from './preview-frame';
import { ActivityFeed } from './activity-feed';
import type { Activity } from '@/types';

interface ActivityPanelProps {
  sessionId: string;
  backendUrl?: string;
}

export function ActivityPanel({ sessionId, backendUrl = 'http://localhost:3001' }: ActivityPanelProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Fetch existing session data to get preview URL if available
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/sessions/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.session?.previewUrl) {
            setPreviewUrl(data.session.previewUrl);
          }
        }
      } catch (error) {
        console.error('Failed to fetch session:', error);
      }
    };
    fetchSession();
  }, [sessionId, backendUrl]);

  useEffect(() => {
    // Connect to WebSocket for real-time activity updates
    const ws = new WebSocket(`${backendUrl.replace('http', 'ws')}/ws?sessionId=${sessionId}`);

    ws.onmessage = (event) => {
      const activity = JSON.parse(event.data) as Activity;
      setActivities((prev) => [...prev, activity]);

      if (activity.type === 'preview_ready' && activity.data.url) {
        setPreviewUrl(activity.data.url as string);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [sessionId, backendUrl]);

  const terminalActivities = activities.filter((a) => a.type === 'terminal');

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="activity" className="flex-1 flex flex-col">
        <div className="border-b px-4">
          <TabsList className="h-12">
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="terminal">Terminal</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity" className="flex-1 m-0 overflow-hidden">
          <ActivityFeed activities={activities} />
        </TabsContent>

        <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
          <FileBrowser sessionId={sessionId} backendUrl={backendUrl} />
        </TabsContent>

        <TabsContent value="terminal" className="flex-1 m-0 overflow-hidden">
          <TerminalOutput activities={terminalActivities} />
        </TabsContent>

        <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
          <PreviewFrame url={previewUrl} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
