'use client';

import { Check, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Uses the device's share sheet when there is one, otherwise copies the link. */
export function ShareButton({ title }: { title: string }) {
  const [message, setMessage] = useState('');

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage('Link copied');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      // The person dismissed the share sheet, or clipboard access was refused: nothing to do.
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={share}>
        {message ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Share2 aria-hidden className="size-4" />
        )}
        Share
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </>
  );
}
