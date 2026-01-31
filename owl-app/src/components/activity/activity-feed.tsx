'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Activity } from '@/types';
import { Terminal, FileCode, Eye, AlertCircle, Wrench, AlertTriangle } from 'lucide-react';

interface ActivityFeedProps {
  activities: Activity[];
}

const activityIcons = {
  tool_call: Wrench,
  terminal: Terminal,
  file_change: FileCode,
  preview_ready: Eye,
  error: AlertCircle,
  sandbox_expired: AlertTriangle,
};

const activityColors = {
  tool_call: 'text-blue-500',
  terminal: 'text-green-500',
  file_change: 'text-yellow-500',
  preview_ready: 'text-purple-500',
  error: 'text-red-500',
  sandbox_expired: 'text-orange-500',
};

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Activity will appear here as Owl works on your app</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-2">
        {activities.map((activity) => {
          const Icon = activityIcons[activity.type];
          const colorClass = activityColors[activity.type];

          return (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
            >
              <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', colorClass)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">
                    {activity.type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(activity.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {activity.data && Object.keys(activity.data).length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground font-mono">
                    {JSON.stringify(activity.data, null, 2).slice(0, 200)}
                    {JSON.stringify(activity.data).length > 200 && '...'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
