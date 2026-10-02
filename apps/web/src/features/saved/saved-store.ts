'use client';

import { useCallback } from 'react';
import { browserApi } from '@/lib/browser-api';
import { createLocalStore, useLocalStore } from '@/lib/local-store';

export interface SavedItem {
  id: string;
  slug: string;
  title: string;
  organisation: string;
}

interface SavedState {
  items: SavedItem[];
}

const EMPTY: SavedState = { items: [] };
const MAX_SAVED = 200;

export const savedStore = createLocalStore<SavedState>({
  key: 'unneet.saved.v1',
  empty: EMPTY,
  parse: (raw) => {
    try {
      const v = JSON.parse(raw) as { items?: unknown };
      if (!Array.isArray(v.items)) return null;
      const items = v.items.filter(
        (i): i is SavedItem =>
          typeof i === 'object' &&
          i !== null &&
          typeof (i as SavedItem).id === 'string' &&
          typeof (i as SavedItem).slug === 'string',
      );
      return { items: items.slice(0, MAX_SAVED) };
    } catch {
      return null;
    }
  },
});

/**
 * Saving works for everyone: it is kept in this browser, and also on the account when signed in
 * (`signedIn` is supplied by the caller, who got it from the server). The API call is best-effort:
 * the local list is what the person sees, and ClientSync reconciles the two on the next visit.
 */
export function useSaved(signedIn: boolean) {
  const state = useLocalStore(savedStore);

  const isSaved = useCallback((id: string) => state.items.some((i) => i.id === id), [state.items]);

  const toggle = useCallback(
    async (item: SavedItem): Promise<boolean> => {
      const current = savedStore.read().items;
      const already = current.some((i) => i.id === item.id);
      const next = already
        ? current.filter((i) => i.id !== item.id)
        : [item, ...current].slice(0, MAX_SAVED);
      savedStore.write({ items: next });
      if (signedIn) {
        try {
          if (already) {
            await browserApi.DELETE('/v1/me/saved/{id}', { params: { path: { id: item.id } } });
          } else {
            await browserApi.PUT('/v1/me/saved/{id}', { params: { path: { id: item.id } } });
          }
        } catch {
          // Offline or the API is down: the local copy stands and syncs next time.
        }
      }
      return !already;
    },
    [signedIn],
  );

  return { items: state.items, isSaved, toggle };
}
