'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function Home() {
  const router = useRouter();

  const handleNewSession = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/sessions`, {
        method: 'POST',
      });
      const data = await response.json();
      router.push(`/chat/${data.session.id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center space-y-8">
        <h1 className="text-6xl font-bold">Owl</h1>
        <p className="text-xl text-muted-foreground max-w-md">
          AI-powered web app generator. Describe what you want, and watch it come to life.
        </p>
        <Button size="lg" onClick={handleNewSession}>
          Start Building
        </Button>
      </div>
    </main>
  );
}
