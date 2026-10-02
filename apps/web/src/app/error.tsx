'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest links this to the server log line; never show the raw message to visitors.
    console.error(error.digest ? `Page error ${error.digest}` : 'Page error');
  }, [error]);

  return (
    <div className="page grid justify-items-start gap-5 py-20">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="text-title">Sorry, that did not work</h1>
      <p className="max-w-xl text-lg text-ink-2">
        It is a problem on our side, not something you did. Please try again. If it keeps happening,
        come back a little later.
      </p>
      {error.digest ? <p className="text-sm text-ink-2">Reference: {error.digest}</p> : null}
      <Button size="lg" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
