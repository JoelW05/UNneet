'use client';

import { Heart } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { type SavedItem, useSaved } from '@/features/saved/saved-store';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/local-store';

/**
 * Save for later. A real toggle button: `aria-pressed` carries the state, the label names the
 * item, and a polite live region confirms the change for screen-reader users.
 */
export function SaveButton({
  item,
  signedIn,
  variant = 'icon',
  className,
}: {
  item: SavedItem;
  signedIn: boolean;
  variant?: 'icon' | 'full';
  className?: string;
}) {
  const { isSaved, toggle } = useSaved(signedIn);
  const hydrated = useHydrated();
  const [message, setMessage] = useState('');
  const saved = hydrated && isSaved(item.id);

  async function onClick() {
    const nowSaved = await toggle(item);
    setMessage(nowSaved ? `Saved: ${item.title}` : `Removed from saved: ${item.title}`);
  }

  return (
    <>
      <Button
        variant={variant === 'full' ? 'secondary' : 'ghost'}
        size={variant === 'full' ? 'md' : 'icon'}
        aria-pressed={saved}
        aria-label={variant === 'icon' ? `${saved ? 'Unsave' : 'Save'}: ${item.title}` : undefined}
        onClick={onClick}
        className={cn('relative z-10', className)}
      >
        <Heart aria-hidden className={cn('size-5', saved && 'fill-accent text-accent')} />
        {variant === 'full' ? <span>{saved ? 'Saved' : 'Save for later'}</span> : null}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </>
  );
}
