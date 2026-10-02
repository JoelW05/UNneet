'use client';

import { ProfileSchema } from '@unneet/domain';
import { useEffect, useRef } from 'react';
import { browserApi } from '@/lib/browser-api';
import { hasAnyProfileData, profileStore } from '../profile/profile-store';
import { savedStore } from '../saved/saved-store';

const SAVE_DELAY_MS = 1200;

/**
 * Keeps a signed-in person's profile and saved items backed up to their account. Renders nothing.
 *
 * Rules (so nobody's data is silently lost):
 *  - on sign-in: if the account already has a profile, it wins (you are on a new device);
 *    otherwise whatever you built as a guest is uploaded;
 *  - saved items are merged both ways (a union), never overwritten;
 *  - afterwards, profile edits are saved to the account after a short pause.
 * Everything is best-effort: a failed sync never blocks or errors the page.
 */
export function ClientSync({ signedIn }: { signedIn: boolean }) {
  const ready = useRef(false);
  const lastSaved = useRef<string>('');

  useEffect(() => {
    if (!signedIn) {
      ready.current = false;
      return;
    }
    let cancelled = false;

    async function initialSync() {
      try {
        const { data } = await browserApi.GET('/v1/me/profile');
        const remote = data?.profile ? ProfileSchema.safeParse(data.profile) : null;
        if (cancelled) return;
        if (remote?.success) {
          profileStore.write(remote.data);
          lastSaved.current = JSON.stringify(remote.data);
        } else if (hasAnyProfileData(profileStore.read())) {
          const local = profileStore.read();
          await browserApi.PUT('/v1/me/profile', { body: local });
          lastSaved.current = JSON.stringify(local);
        }

        const saved = await browserApi.GET('/v1/me/saved');
        if (cancelled || !saved.data) return;
        const remoteItems = saved.data.items;
        const local = savedStore.read().items;
        const remoteIds = new Set(remoteItems.map((i) => i.id));
        // Upload guest saves the account does not have yet...
        await Promise.all(
          local
            .filter((i) => !remoteIds.has(i.id))
            .slice(0, 50)
            .map((i) => browserApi.PUT('/v1/me/saved/{id}', { params: { path: { id: i.id } } })),
        );
        // ...and show the union locally.
        const localIds = new Set(local.map((i) => i.id));
        const fromRemote = remoteItems
          .filter((i) => !localIds.has(i.id))
          .map((i) => ({
            id: i.id,
            slug: i.slug,
            title: i.title,
            organisation: i.organisation.name,
          }));
        if (fromRemote.length > 0) savedStore.write({ items: [...local, ...fromRemote] });
      } catch {
        // Offline / API down: carry on with the local copy.
      } finally {
        if (!cancelled) ready.current = true;
      }
    }
    void initialSync();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = profileStore.subscribe(() => {
      if (!ready.current) return;
      const current = profileStore.read();
      const serialised = JSON.stringify(current);
      if (serialised === lastSaved.current) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await browserApi.PUT('/v1/me/profile', { body: current });
          lastSaved.current = serialised;
        } catch {
          // try again on the next change
        }
      }, SAVE_DELAY_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [signedIn]);

  return null;
}
