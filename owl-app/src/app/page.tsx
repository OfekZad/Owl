'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNewSession = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      router.push(`/chat/${data.session.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      setError(`Failed to connect to backend at ${BACKEND_URL}. Please ensure the backend server is running.`);
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center space-y-8">
        <h1 className="text-6xl font-bold">Owl</h1>
        <p className="text-xl text-muted-foreground max-w-md">
          AI-powered web app generator. Describe what you want, and watch it come to life.
        </p>
        <Button size="lg" onClick={handleNewSession} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating session...
            </>
          ) : (
            'Start Building'
          )}
        </Button>
        {error && (
          <p className="text-sm text-red-500 max-w-md">{error}</p>
        )}
      </div>
    </main>
  );
}
