'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Activity } from '@/types';

interface TerminalOutputProps {
  activities: Activity[];
}

export function TerminalOutput({ activities }: TerminalOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities]);

  if (activities.length === 0) {
    return (
      <div className="h-full bg-black text-green-400 font-mono text-sm p-4">
        <p className="text-muted-foreground">$ Terminal output will appear here...</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full bg-black" ref={scrollRef}>
      <div className="p-4 font-mono text-sm text-green-400 whitespace-pre-wrap">
        {activities.map((activity, index) => {
          const output = activity.data?.output as string | undefined;
          const type = activity.data?.type as string | undefined;
          const command = activity.data?.command as string | undefined;
          const error = activity.data?.error as string | undefined;

          // Determine styling based on type
          const getOutputClass = () => {
            switch (type) {
              case 'command':
                return 'text-blue-400';
              case 'stderr':
              case 'error':
                return 'text-red-400';
              case 'info':
                return 'text-yellow-400';
              case 'success':
                return 'text-green-500';
              default:
                return 'text-green-400';
            }
          };

          return (
            <div key={activity.id || index} className="mb-1">
              {command && (
                <div className="text-blue-400">$ {command}</div>
              )}
              {output && (
                <div className={getOutputClass()}>{output}</div>
              )}
              {error && (
                <div className="text-red-400">{error}</div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
