'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileBrowser } from './file-browser';
import { TerminalOutput } from './terminal-output';
import { PreviewFrame } from './preview-frame';
import { ActivityFeed } from './activity-feed';
import type { Activity } from '@/types';

// Keep-alive interval (2 minutes)
const KEEPALIVE_INTERVAL_MS = 2 * 60 * 1000;

interface ActivityPanelProps {
  sessionId: string;
  backendUrl?: string;
}

export function ActivityPanel({ sessionId, backendUrl = 'http://localhost:3001' }: ActivityPanelProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sandboxExpired, setSandboxExpired] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  // Keep-alive ping to prevent sandbox timeout
  useEffect(() => {
    const keepAlive = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/sessions/${sessionId}/sandbox/keepalive`, {
          method: 'POST',
        });
        if (response.ok) {
          const data = await response.json();
          if (!data.alive) {
            setSandboxExpired(true);
          }
        }
      } catch (error) {
        console.error('Keep-alive failed:', error);
      }
    };

    // Start keep-alive interval
    const interval = setInterval(keepAlive, KEEPALIVE_INTERVAL_MS);

    // Initial ping
    keepAlive();

    return () => clearInterval(interval);
  }, [sessionId, backendUrl]);

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
        setSandboxExpired(false); // Clear expired state when we get a new preview
      }

      // Handle sandbox expired event
      if (activity.type === 'sandbox_expired') {
        setSandboxExpired(true);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [sessionId, backendUrl]);

  // Restart sandbox handler
  const handleRestart = useCallback(async () => {
    setIsRestarting(true);
    try {
      const response = await fetch(`${backendUrl}/api/sessions/${sessionId}/sandbox/restart`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.previewUrl) {
          setPreviewUrl(data.previewUrl);
          setSandboxExpired(false);
        }
      } else {
        console.error('Failed to restart sandbox');
      }
    } catch (error) {
      console.error('Failed to restart sandbox:', error);
    } finally {
      setIsRestarting(false);
    }
  }, [sessionId, backendUrl]);

  // Download code handler
  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/sessions/${sessionId}/sandbox/download`);
      if (response.ok) {
        const data = await response.json();

        // Create a downloadable JSON file with all the code
        const blob = new Blob([JSON.stringify(data.files, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `owl-project-${sessionId.slice(0, 8)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        console.error('Failed to download code');
      }
    } catch (error) {
      console.error('Failed to download code:', error);
    }
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
          <PreviewFrame
            url={previewUrl}
            sessionId={sessionId}
            sandboxExpired={sandboxExpired}
            onRestart={handleRestart}
            onDownload={handleDownload}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
