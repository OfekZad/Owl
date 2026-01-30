'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, File, Folder, RefreshCw } from 'lucide-react';
import type { FileNode } from '@/types';

interface FileBrowserProps {
  sessionId: string;
  backendUrl?: string;
}

interface FileTreeItemProps {
  node: FileNode;
  depth: number;
}

function FileTreeItem({ node, depth }: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  const handleToggle = () => {
    if (node.type === 'directory') {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 hover:bg-muted rounded cursor-pointer',
          'text-sm'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleToggle}
      >
        {node.type === 'directory' ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <Folder className="h-4 w-4 shrink-0 text-blue-500" />
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.type === 'directory' && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileBrowser({ sessionId, backendUrl = 'http://localhost:3001' }: FileBrowserProps) {
  const [files, setFiles] = useState<FileNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async (path: string = '/home/user/app'): Promise<FileNode | null> => {
    try {
      const res = await fetch(`${backendUrl}/api/sessions/${sessionId}/sandbox/files/list?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        if (res.status === 500) {
          // Sandbox might not be created yet
          return null;
        }
        throw new Error('Failed to fetch files');
      }
      const data = await res.json();

      const children: FileNode[] = await Promise.all(
        data.files
          .filter((f: { name: string }) => !f.name.startsWith('.'))
          .map(async (f: { name: string; isDir: boolean }) => {
            const childPath = `${path}/${f.name}`;
            if (f.isDir) {
              const dirChildren = await fetchFiles(childPath);
              return {
                name: f.name,
                path: childPath,
                type: 'directory' as const,
                children: dirChildren?.children || []
              };
            }
            return {
              name: f.name,
              path: childPath,
              type: 'file' as const
            };
          })
      );

      return {
        name: path.split('/').pop() || 'app',
        path,
        type: 'directory',
        children
      };
    } catch (err) {
      console.error('Error fetching files:', err);
      return null;
    }
  }, [backendUrl, sessionId]);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const fileTree = await fetchFiles();
    if (fileTree) {
      setFiles(fileTree);
    } else {
      setError('No sandbox active or no files yet');
    }
    setIsLoading(false);
  }, [fetchFiles]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Loading files...</p>
      </div>
    );
  }

  if (error || !files) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <p>{error || 'No files yet'}</p>
        <Button variant="outline" size="sm" onClick={loadFiles}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b">
        <span className="text-sm font-medium">Files</span>
        <Button variant="ghost" size="icon" onClick={loadFiles}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          <FileTreeItem node={files} depth={0} />
        </div>
      </ScrollArea>
    </div>
  );
}
