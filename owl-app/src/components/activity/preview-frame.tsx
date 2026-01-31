'use client';

import { RefreshCw, ExternalLink, AlertTriangle, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback } from 'react';

interface PreviewFrameProps {
  url: string | null;
  sessionId: string;
  sandboxExpired?: boolean;
  onRestart?: () => void;
  onDownload?: () => void;
}

export function PreviewFrame({ url, sessionId, sandboxExpired, onRestart, onDownload }: PreviewFrameProps) {
  const [key, setKey] = useState(0);
  const [iframeError, setIframeError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleRefresh = () => {
    setIframeError(false);
    setIsLoading(true);
    setKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Reset error state when URL changes
  useEffect(() => {
    if (url) {
      setIframeError(false);
      setIsLoading(true);
    }
  }, [url]);

  // Show expired state
  if (sandboxExpired) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 p-8">
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">Sandbox Expired</p>
          <p className="text-sm mt-2">Your sandbox environment has timed out.</p>
          <p className="text-sm">You can restart the sandbox to continue working.</p>
        </div>
        <div className="flex gap-2 mt-4">
          {onDownload && (
            <Button variant="outline" onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download Code
            </Button>
          )}
          {onRestart && (
            <Button onClick={onRestart}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restart Sandbox
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <div className="text-center">
          <p className="text-lg font-medium">No preview available</p>
          <p className="text-sm">The preview will appear here once your app is running</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b bg-muted/50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="flex-1 px-3 py-1 bg-background rounded text-sm text-muted-foreground truncate">
            {url}
          </div>
        </div>
        <div className="flex gap-1">
          {onDownload && (
            <Button variant="ghost" size="icon" onClick={onDownload} title="Download Code">
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleRefresh} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleOpenExternal} title="Open in new tab">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading preview...</p>
            </div>
          </div>
        )}
        <iframe
          key={key}
          src={url}
          className="w-full h-full border-0"
          title="App Preview"
          sandbox="allow-scripts allow-same-origin allow-forms"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}
