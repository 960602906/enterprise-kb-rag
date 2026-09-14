import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeBases } from "@/lib/db/schema";
import { defaultSearchKnowledgeBaseName } from "./chunk-config";

function apiKeyKbAllowlist(): string[] | null {
  const raw = process.env.SEARCH_KNOWLEDGE_KB_IDS?.trim();
  if (!raw) return null;
  const ids = raw.split(/[,\s]+/).filter(Boolean);
  return ids.length ? ids : null;
}

function allowAllKnowledgeBases(): boolean {
  return process.env.SEARCH_KNOWLEDGE_ALLOW_ALL === "true";
}

/**
 * Resolve KBs the service key may read.
 * Never scans every knowledge base unless SEARCH_KNOWLEDGE_ALLOW_ALL=true.
 */
export async function resolveSearchKnowledgeBaseIds(
  requested?: string[],
): Promise<string[]> {
  const allowlist = apiKeyKbAllowlist();

  if (requested?.length) {
    const unique = [...new Set(requested)];
    const scoped = allowlist
      ? unique.filter((id) => allowlist.includes(id))
      : unique;
    if (scoped.length === 0) return [];
    const rows = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(inArray(knowledgeBases.id, scoped));
    return rows.map((r) => r.id);
  }

  if (allowlist?.length) {
    const rows = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(inArray(knowledgeBases.id, allowlist));
    return rows.map((r) => r.id);
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
