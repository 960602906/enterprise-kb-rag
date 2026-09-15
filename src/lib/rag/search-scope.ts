import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeBases } from "@/lib/db/schema";
import { defaultSearchKnowledgeBaseName } from "./chunk-config";

function envKbAllowlist(): string[] | null {
  const raw = process.env.SEARCH_KNOWLEDGE_KB_IDS?.trim();
  if (!raw) return null;
  const ids = raw.split(/[,\s]+/).filter(Boolean);
  return ids.length ? ids : null;
}

/**
 * Legacy-only escape hatch. Unsafe in multi-tenant deployments.
 * In production, requires SEARCH_KNOWLEDGE_ALLOW_ALL_IN_PRODUCTION=true.
 * Never used for DB-issued API keys.
 */
export function allowAllKnowledgeBases(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.SEARCH_KNOWLEDGE_ALLOW_ALL !== "true") return false;
  if (env.NODE_ENV === "production") {
    if (env.SEARCH_KNOWLEDGE_ALLOW_ALL_IN_PRODUCTION === "true") {
      console.warn(
        "[search-knowledge] SEARCH_KNOWLEDGE_ALLOW_ALL_IN_PRODUCTION=true — reading every knowledge base via legacy env key. Unsafe for multi-tenant.",
      );
      return true;
    }
    console.warn(
      "[search-knowledge] SEARCH_KNOWLEDGE_ALLOW_ALL=true is ignored in production unless SEARCH_KNOWLEDGE_ALLOW_ALL_IN_PRODUCTION=true",
    );
    return false;
  }
  return true;
}

export type ResolveSearchKbOptions = {
  /**
   * Explicit allowlist from an authenticated DB API key.
   * When set, `SEARCH_KNOWLEDGE_ALLOW_ALL` is ignored — the key may only
   * read its bound knowledge bases (intersection with the request).
   */
  allowlist?: string[] | null;
  /**
   * When true (legacy env path only), fall back to env allowlist / default
   * name / ALLOW_ALL. When false (DB key), never expand beyond `allowlist`.
   */
  legacyEnvScope?: boolean;
};

export type DbKeyScopeResult =
  | { ok: true; ids: string[] }
  | { ok: false; status: 403; error: string };

/**
 * Pure DB-key scope rules (no DB I/O).
 *
 * - Zero bound KBs → 403 (default-deny)
 * - Any requested id outside the bind → 403 (no silent drop; prevents probing)
 * - No request ids → use full bind list
 * - Mixed foreign+permitted → 403 (safer than silent intersection)
 */
export function evaluateDbKeyScope(
  requested: string[] | undefined,
  bound: string[],
): DbKeyScopeResult {
  if (bound.length === 0) {
    return {
      ok: false,
      status: 403,
      error: "API key is not bound to any knowledge base",
    };
  }

  if (requested?.length) {
    const unique = [...new Set(requested)];
    const boundSet = new Set(bound);
    const foreign = unique.filter((id) => !boundSet.has(id));
    if (foreign.length > 0) {
      return {
        ok: false,
        status: 403,
        error: "One or more knowledgeBaseIds are outside this API key's scope",
      };
    }
    return { ok: true, ids: unique };
  }

  return { ok: true, ids: [...bound] };
}

async function existingIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(inArray(knowledgeBases.id, ids));
  return rows.map((r) => r.id);
}

/**
 * Resolve KBs the caller may read.
 *
 * - DB API key: use `evaluateDbKeyScope` then verify ids exist.
 * - Legacy env key / localhost: SEARCH_KNOWLEDGE_* behavior (ALLOW_ALL gated in prod).
 */
export async function resolveSearchKnowledgeBaseIds(
  requested?: string[],
  options?: ResolveSearchKbOptions,
): Promise<string[]> {
  // DB-backed key path: hard-scoped to bound KBs (ALLOW_ALL disabled).
  if (options?.allowlist !== undefined || options?.legacyEnvScope === false) {
    const bound = options?.allowlist ?? [];
    const scope = evaluateDbKeyScope(requested, bound);
    if (!scope.ok) {
      // Caller should prefer evaluateDbKeyScope for 403; keep fail-closed empty.
      return [];
    }
    return existingIds(scope.ids);
  }

  // Legacy env / localhost path
  const allowlist = envKbAllowlist();

  if (requested?.length) {
    const unique = [...new Set(requested)];
    const scoped = allowlist
      ? unique.filter((id) => allowlist.includes(id))
      : unique;
    if (scoped.length === 0) return [];
    return existingIds(scoped);
  }

  if (allowlist?.length) {
    return existingIds(allowlist);
  }

  const defaultName = defaultSearchKnowledgeBaseName();
  const named = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(eq(knowledgeBases.name, defaultName));
  if (named.length > 0) return named.map((r) => r.id);

  if (allowAllKnowledgeBases()) {
    console.warn(
      "[search-knowledge] SEARCH_KNOWLEDGE_ALLOW_ALL=true — reading every knowledge base. Do not enable this in multi-tenant deployments.",
    );
    const all = await db.select({ id: knowledgeBases.id }).from(knowledgeBases);
    return all.map((r) => r.id);
  }

  console.warn(
    `[search-knowledge] no KB allowlist and default KB "${defaultName}" was not found; returning no results. Set SEARCH_KNOWLEDGE_KB_IDS or create the default knowledge base.`,
  );
  return [];
}
