export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number): RateLimitResult;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter in process memory. Good enough for a single API instance and for tests;
 * behind several instances put a shared store (Redis) behind this same interface. The cleanup
 * sweep keeps memory bounded, and `maxKeys` stops a flood of unique keys becoming a memory DoS.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 50_000,
  ) {}

  hit(key: string, limit: number, windowMs: number): RateLimitResult {
    const t = this.now();
    this.sweep(t);
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      if (!bucket && this.buckets.size >= this.maxKeys) this.evictOldest();
      bucket = { count: 0, resetAt: t + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetSeconds: Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)),
    };
  }

  get size(): number {
    return this.buckets.size;
  }

  private sweep(t: number): void {
    if (t - this.lastSweep < 30_000) return;
    this.lastSweep = t;
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= t) this.buckets.delete(key);
  }

  private evictOldest(): void {
    // Map iterates in insertion order, so the first key is the oldest bucket.
    const first = this.buckets.keys().next();
    if (!first.done) this.buckets.delete(first.value);
  }
}
