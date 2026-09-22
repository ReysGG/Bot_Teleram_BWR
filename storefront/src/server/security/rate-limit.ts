type Bucket = { count: number; resetsAt: number };

const globalBuckets = globalThis as unknown as {
  telegramStoreRateLimits?: Map<string, Bucket>;
};

const buckets =
  globalBuckets.telegramStoreRateLimits ?? new Map<string, Bucket>();
let nextSweepAt = 0;

if (process.env.NODE_ENV !== "production") {
  globalBuckets.telegramStoreRateLimits = buckets;
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  if (now >= nextSweepAt) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetsAt <= now) buckets.delete(bucketKey);
    }
    nextSweepAt = now + 60_000;
  }
  const current = buckets.get(key);
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function rateLimitSource(
  headers: Pick<Headers, "get">,
  fallback = "unknown",
): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || fallback).slice(0, 100);
}
