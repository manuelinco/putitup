// ─── Tiny in-process TTL cache ───────────────────────────────────────────────
// Used to absorb bursts of identical read traffic on hot, expensive endpoints
// (stats, leaderboard) so they don't saturate the pg connection pool.
// Single-instance only — acceptable because these values are non-critical and
// short-lived. Not a substitute for a shared cache across multiple replicas.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/**
 * Return a cached value for `key`, or compute it with `fn`, store it for
 * `ttlMs`, and return it. Concurrent callers during a miss share the same
 * in-flight promise so the underlying work runs only once.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise as Promise<T>;
}

/** Drop a cached entry (e.g. after a mutation that invalidates it). */
export function invalidate(key: string): void {
  store.delete(key);
}
