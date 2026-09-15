import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * SearchKnowledge API key hashing.
 *
 * Algorithm: SHA-256 hex digest of `pepper || plaintext`.
 * Pepper = `API_KEY_PEPPER` env, else `AUTH_SECRET`, else a fixed
 * development-only fallback (never rely on the fallback in production).
 *
 * SHA-256 + pepper (not bcrypt) so auth can look up by hash in O(1).
 * Keys are high-entropy random secrets; slow password hashes are unnecessary.
 */

const KEY_PREFIX = "atk_";
const PREFIX_DISPLAY_LEN = 8;

export function apiKeyPepper(): string {
  const pepper =
    process.env.API_KEY_PEPPER?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (pepper) return pepper;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "API_KEY_PEPPER or AUTH_SECRET is required to hash SearchKnowledge API keys",
    );
  }
  return "atlas-dev-api-key-pepper";
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256")
    .update(apiKeyPepper(), "utf8")
    .update(plaintext, "utf8")
    .digest("hex");
}

/** Display prefix like `atk_a1b2c3d4` (never the full secret). */
export function apiKeyDisplayPrefix(plaintext: string): string {
  const body = plaintext.startsWith(KEY_PREFIX)
    ? plaintext.slice(KEY_PREFIX.length)
    : plaintext;
  return `${KEY_PREFIX}${body.slice(0, PREFIX_DISPLAY_LEN)}`;
}

/** Generate a new plaintext key: `atk_` + 32 random hex bytes (64 chars). */
export function generateApiKeyPlaintext(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString("hex")}`;
}

export function apiKeyHashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
