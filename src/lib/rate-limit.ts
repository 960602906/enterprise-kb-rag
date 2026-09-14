/**
 * Process-local sliding window. Fine on a single serverless isolate;
 * not a cluster-wide quota. Set RATE_LIMIT_DISABLED=true in eval/CI.
 */

type Bucket = number[];

const store = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number; limit: number }
  | { ok: false; remaining: 0; limit: number; retryAfterSec: number };

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function hitRateLimit(opts: {
  key: string;
  limit: number;
  windowMs?: number;
}): RateLimitResult {
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return { ok: true, remaining: opts.limit, limit: opts.limit };
  }
  const limit = Math.max(1, opts.limit);
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  const cutoff = now - windowMs;
  const prev = (store.get(opts.key) ?? []).filter((t) => t > cutoff);
  if (prev.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((prev[0]! + windowMs - now) / 1000));
    store.set(opts.key, prev);
    return { ok: false, remaining: 0, limit, retryAfterSec };
  }
  prev.push(now);
  store.set(opts.key, prev);
  return { ok: true, remaining: limit - prev.length, limit };
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function rateLimitedResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "retry-after": String(result.retryAfterSec),
        "x-ratelimit-limit": String(result.limit),
        "x-ratelimit-remaining": "0",
      },
    },
  );
}
