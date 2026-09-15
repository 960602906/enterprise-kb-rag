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

function allowAllKnowledgeBases(): boolean {
  return process.env.SEARCH_KNOWLEDGE_ALLOW_ALL === "true";
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
 * - DB API key: `requested ∩ key.allowlist` (empty allowlist → no results).
 * - Legacy env key / localhost: existing SEARCH_KNOWLEDGE_* behavior.
 */
export async function resolveSearchKnowledgeBaseIds(
  requested?: string[],
  options?: ResolveSearchKbOptions,
): Promise<string[]> {
  const legacy = options?.legacyEnvScope !== false && options?.allowlist === undefined;
  const allowlist =
    options?.allowlist !== undefined
      ? options.allowlist
      : legacy
        ? envKbAllowlist()
        : null;

  // DB-backed key path: hard-scoped to bound KBs (ALLOW_ALL disabled).
  if (options?.allowlist !== undefined) {
    const bound = allowlist ?? [];
    if (bound.length === 0) return [];

    if (requested?.length) {
      const unique = [...new Set(requested)];
      const scoped = unique.filter((id) => bound.includes(id));
      return existingIds(scoped);
    }
    return existingIds(bound);
  }

  // Legacy env / localhost path
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
