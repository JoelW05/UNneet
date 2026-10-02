import { useSyncExternalStore } from 'react';

/**
 * A tiny external store backed by localStorage, built for `useSyncExternalStore`:
 *
 *  - hydration-safe: the server (and the first client render) see `empty`, the real value follows;
 *  - snapshots are cached by raw string, so React sees a stable reference until the data changes;
 *  - works across tabs (the `storage` event) and within one tab (our own listeners);
 *  - degrades gracefully: if storage is blocked (private windows, strict settings) it falls back to
 *    memory for the page's lifetime instead of throwing.
 *
 * Per the artefact rules: storage is only for per-visitor conveniences; nothing here is the
 * source of truth for signed-in users (the API is).
 */
export interface LocalStore<T> {
  read(): T;
  write(next: T): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
  serverSnapshot(): T;
}

export interface LocalStoreOptions<T> {
  key: string;
  empty: T;
  /** Turn stored text into a value, or null if it is not valid (it is then ignored). */
  parse(raw: string): T | null;
  serialise?(value: T): string;
}

export function createLocalStore<T>({
  key,
  empty,
  parse,
  serialise = JSON.stringify,
}: LocalStoreOptions<T>): LocalStore<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue: T = empty;
  let memory: string | null = null;
  let storageWorks = true;

  const emit = () => {
    for (const l of listeners) l();
  };

  function readRaw(): string | null {
    if (typeof window === 'undefined') return null;
    if (!storageWorks) return memory;
    try {
      return window.localStorage.getItem(key);
    } catch {
      storageWorks = false;
      return memory;
    }
  }

  function writeRaw(raw: string | null): void {
    memory = raw;
    if (typeof window === 'undefined' || !storageWorks) return;
    try {
      if (raw === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, raw);
    } catch {
      storageWorks = false;
    }
  }

  function onStorage(event: StorageEvent) {
    if (event.key === key || event.key === null) emit();
  }

  return {
    read() {
      const raw = readRaw();
      if (raw === cachedRaw) return cachedValue;
      cachedRaw = raw;
      cachedValue = raw === null ? empty : (parse(raw) ?? empty);
      return cachedValue;
    },
    write(next) {
      writeRaw(serialise(next));
      cachedRaw = undefined; // force a re-read so the cached value is what was really stored
      emit();
    },
    clear() {
      writeRaw(null);
      cachedRaw = undefined;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== 'undefined') {
        window.addEventListener('storage', onStorage);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') {
          window.removeEventListener('storage', onStorage);
        }
      };
    },
    serverSnapshot: () => empty,
  };
}

export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.read, store.serverSnapshot);
}

const noop = () => () => {};

/** false on the server and during hydration, true afterwards: gate anything that reads storage. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
