'use client';

import { RefreshCw, ExternalLink, AlertTriangle, Download, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadStartTime, setLoadStartTime] = useState<number | null>(null);
  const [showRetryButton, setShowRetryButton] = useState(false);

  const handleRefresh = useCallback(() => {
    setKey((prev) => prev + 1);
    setIsLoading(true);
    setLoadError(false);
    setShowRetryButton(false);
    setLoadStartTime(Date.now());
  }, []);

  const handleLoad = () => {
    setIsLoading(false);
    setLoadError(false);
    setShowRetryButton(false);
  };

  const handleError = () => {
    setLoadError(true);
    setIsLoading(false);
  };

  const handleOpenExternal = () => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  // Reset state when URL changes
  useEffect(() => {
    if (url) {
      setIsLoading(true);
      setLoadError(false);
      setShowRetryButton(false);
      setLoadStartTime(Date.now());
      setKey((prev) => prev + 1);
    }
  }, [url]);

  // Auto-retry on error (every 5 seconds)
  useEffect(() => {
    if (loadError && url) {
      const timer = setTimeout(() => {
        setKey((prev) => prev + 1);
        setIsLoading(true);
        setLoadError(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [loadError, url]);

  // Show retry button if loading takes too long (>30 seconds)
  useEffect(() => {
    if (isLoading && loadStartTime && url) {
      const timer = setTimeout(() => {
        if (isLoading) {
          setShowRetryButton(true);
        }
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, loadStartTime, url]);

  // Auto-retry during loading (every 8 seconds) to handle cases where iframe silently fails
  useEffect(() => {
    if (isLoading && url && !loadError) {
      const timer = setTimeout(() => {
        // Retry by changing key, which forces iframe to reload
        setKey((prev) => prev + 1);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, url, key, loadError]);

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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleOpenExternal} title="Open in new tab">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 relative">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading preview...</p>
            {showRetryButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Now
              </Button>
            )}
          </div>
        )}

        {/* Error state (shown briefly before auto-retry) */}
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
            <AlertCircle className="h-8 w-8 text-yellow-500 mb-4" />
            <p className="text-sm text-muted-foreground mb-2">Preview loading...</p>
            <p className="text-xs text-muted-foreground">Retrying automatically...</p>
          </div>
        )}

        <iframe
          key={key}
          src={url}
          className="w-full h-full border-0"
          title="App Preview"
          sandbox="allow-scripts allow-same-origin allow-forms"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  );
}
