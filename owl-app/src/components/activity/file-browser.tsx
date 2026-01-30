'use client';

import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import type { FileNode } from '@/types';

interface FileBrowserProps {
  sessionId: string;
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

export function FileBrowser({ sessionId }: FileBrowserProps) {
  const [files, setFiles] = useState<FileNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Mock file tree for now - will be populated by backend
    const mockFiles: FileNode = {
      name: 'project',
      path: '/',
      type: 'directory',
      children: [
        {
          name: 'src',
          path: '/src',
          type: 'directory',
          children: [
            { name: 'app', path: '/src/app', type: 'directory', children: [] },
            { name: 'components', path: '/src/components', type: 'directory', children: [] },
          ],
        },
        { name: 'package.json', path: '/package.json', type: 'file' },
        { name: 'tsconfig.json', path: '/tsconfig.json', type: 'file' },
      ],
    };

    setTimeout(() => {
      setFiles(mockFiles);
      setIsLoading(false);
    }, 500);
  }, [sessionId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Loading files...</p>
      </div>
    );
  }

  if (!files) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No files yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <FileTreeItem node={files} depth={0} />
      </div>
    </ScrollArea>
  );
}
