'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Rocket, ExternalLink } from 'lucide-react';
import type { Version } from '@/types';

interface VersionCardProps {
  version: Version;
  onDuplicate: () => void;
  onDeploy: (target: 'preview' | 'production') => void;
}

export function VersionCard({ version, onDuplicate, onDeploy }: VersionCardProps) {
  const formattedDate = new Date(version.createdAt).toLocaleString();

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Version {version.number}</CardTitle>
          {version.previewUrl && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.open(version.previewUrl!, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription>{formattedDate}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="text-sm text-muted-foreground">
          {version.chatHistory.length} message{version.chatHistory.length !== 1 ? 's' : ''}
        </div>
        {version.vercelDeploymentId && (
          <div className="mt-2 text-xs text-green-600">
            Deployed
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-1" />
          Duplicate
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDeploy('preview')}>
          <Rocket className="h-4 w-4 mr-1" />
          Deploy
        </Button>
      </CardFooter>
    </Card>
  );
}
