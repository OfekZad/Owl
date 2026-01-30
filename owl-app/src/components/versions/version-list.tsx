'use client';

import { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VersionCard } from './version-card';
import type { Version } from '@/types';

interface VersionListProps {
  sessionId: string;
  backendUrl?: string;
}

export function VersionList({ sessionId, backendUrl = 'http://localhost:3001' }: VersionListProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchVersions();
  }, [sessionId]);

  const fetchVersions = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/sessions/${sessionId}/versions`);
      const data = await response.json();
      setVersions(data.versions || []);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicate = async (versionId: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/versions/${versionId}/duplicate`, {
        method: 'POST',
      });
      if (response.ok) {
        fetchVersions();
      }
    } catch (error) {
      console.error('Failed to duplicate version:', error);
    }
  };

  const handleDeploy = async (versionId: string, target: 'preview' | 'production') => {
    try {
      const response = await fetch(`${backendUrl}/api/versions/${versionId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (response.ok) {
        const data = await response.json();
        window.open(data.url, '_blank');
        fetchVersions();
      }
    } catch (error) {
      console.error('Failed to deploy version:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Loading versions...</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No versions yet. Start chatting to create your first version.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Version History</h2>
        {versions.map((version) => (
          <VersionCard
            key={version.id}
            version={version}
            onDuplicate={() => handleDuplicate(version.id)}
            onDeploy={(target) => handleDeploy(version.id, target)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
