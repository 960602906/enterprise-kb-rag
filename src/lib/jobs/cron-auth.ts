import { createHmac, timingSafeEqual } from "crypto";

export type AuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Authorize Vercel Cron / operator drain.
 * Accepts `Authorization: Bearer <secret>` (Vercel Cron) or `x-cron-secret`.
 * Secret is `CRON_SECRET` or `INGEST_CRON_SECRET`.
 */
export function authorizeCronRequest(req: Request): AuthResult {
  const expected =
    process.env.CRON_SECRET?.trim() ||
    process.env.INGEST_CRON_SECRET?.trim() ||
    "";
  const provided = extractCronSecret(req);

  if (expected) {
    if (provided && secretsEqual(provided, expected)) return { ok: true };
    return { ok: false, status: 401, error: "Invalid or missing cron secret" };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured",
    };
  }

  if (isLocalRequest(req)) {
    console.warn(
      "[ingest-cron] CRON_SECRET is unset; allowing localhost in development.",
    );
    return { ok: true };
  }

  return {
    ok: false,
    status: 401,
    error: "CRON_SECRET is unset; only localhost is allowed in development",
  };
}

function extractCronSecret(req: Request): string {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (bearer) return bearer;
  return (
    req.headers.get("x-cron-secret")?.trim() ||
    req.headers.get("x-ingest-secret")?.trim() ||
    ""
  );
}

function secretsEqual(a: string, b: string): boolean {
  const key = Buffer.from("atlas-ingest-cron-secret");
  const ha = createHmac("sha256", key).update(a).digest();
  const hb = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(ha, hb);
}

function isLocalRequest(req: Request): boolean {
  const url = new URL(req.url);
  const hostHeader = req.headers.get("host")?.split(":")[0]?.trim() ?? "";
  const hostname = url.hostname;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (!LOCAL_HOSTS.has(hostname) && !LOCAL_HOSTS.has(hostHeader)) {
    return false;
  }
  if (forwarded && !LOCAL_HOSTS.has(forwarded)) return false;
  return true;
}
