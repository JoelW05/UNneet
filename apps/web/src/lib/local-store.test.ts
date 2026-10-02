// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore } from './local-store';

const make = () =>
  createLocalStore<{ n: number }>({
    key: 'test.store',
    empty: { n: 0 },
    parse: (raw) => {
      try {
        const v = JSON.parse(raw) as { n?: unknown };
        return typeof v.n === 'number' ? { n: v.n } : null;
      } catch {
        return null;
      }
    },
  });

beforeEach(() => window.localStorage.clear());

describe('createLocalStore', () => {
  it('returns the empty value until something is written', () => {
    expect(make().read()).toEqual({ n: 0 });
  });

  it('persists, returns a stable snapshot between changes, and notifies subscribers', () => {
    const store = make();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.write({ n: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    const first = store.read();
    expect(first).toEqual({ n: 3 });
    expect(store.read()).toBe(first); // same reference: no needless re-render
    expect(window.localStorage.getItem('test.store')).toBe('{"n":3}');
    off();
    store.write({ n: 4 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores corrupt stored data instead of crashing', () => {
    window.localStorage.setItem('test.store', '{not json');
    expect(make().read()).toEqual({ n: 0 });
    window.localStorage.setItem('test.store', '{"n":"nope"}');
    expect(make().read()).toEqual({ n: 0 });
  });

  it('reacts to changes made in another tab', () => {
    const store = make();
    const listener = vi.fn();
    store.subscribe(listener);
    window.localStorage.setItem('test.store', '{"n":9}');
    window.dispatchEvent(new StorageEvent('storage', { key: 'test.store' }));
    expect(listener).toHaveBeenCalled();
    expect(store.read()).toEqual({ n: 9 });
  });

  it('clears', () => {
    const store = make();
    store.write({ n: 5 });
    store.clear();
    expect(store.read()).toEqual({ n: 0 });
    expect(window.localStorage.getItem('test.store')).toBeNull();
  });

  it('falls back to memory when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const store = make();
    store.write({ n: 7 });
    expect(store.read()).toEqual({ n: 7 });
    spy.mockRestore();
    getSpy.mockRestore();
  });

  it('serves the empty value to the server', () => {
    expect(make().serverSnapshot()).toEqual({ n: 0 });
  });
});
