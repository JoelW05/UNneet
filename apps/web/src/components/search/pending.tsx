'use client';

import { type ReactNode, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';

/**
 * A one-bit store shared between the search form (which starts a navigation) and the results
 * (which are server-rendered elsewhere in the page). While a new search is loading, the old
 * results stay on screen, dimmed and marked busy, so focus and scroll position are never lost.
 */
let pending = false;
const listeners = new Set<() => void>();

export function setSearchPending(value: boolean): void {
  if (pending === value) return;
  pending = value;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function PendingRegion({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const busy = useSyncExternalStore(
    subscribe,
    () => pending,
    () => false,
  );
  return (
    <div
      aria-busy={busy}
      className={cn('transition-opacity', busy && 'pointer-events-none opacity-55', className)}
    >
      {children}
    </div>
  );
}
