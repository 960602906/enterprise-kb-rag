/**
 * Pure SearchKnowledge scope helpers (no DB I/O).
 * Used by resolveSearchKnowledgeBaseIds and unit tests.
 */

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
