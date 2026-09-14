import { createHmac, timingSafeEqual } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeBases } from "@/lib/db/schema";
import {
  isDocType,
  SKYROC_KNOWLEDGE_BASE_NAME,
  type DocType,
} from "./chunk-config";
import { hybridRetrieve, makeSnippet } from "./retrieve";

export type SearchKnowledgeRequest = {
  query: string;
  topK?: number;
  docTypes?: DocType[];
  knowledgeBaseIds?: string[];
};

export type SearchKnowledgeItem = {
  title: string;
  snippet: string;
  sourcePath: string;
  score: number;
  docType?: DocType;
};

export type SearchKnowledgeResponse = {
  items: SearchKnowledgeItem[];
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type AuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Service-to-service auth for SearchKnowledge.
 * Requires `x-api-key` === SEARCH_KNOWLEDGE_API_KEY when the env is set.
 * If unset: production refuses; development allows localhost only (with a warning).
 */
export function authorizeSearchKnowledge(req: Request): AuthResult {
  const expected = process.env.SEARCH_KNOWLEDGE_API_KEY?.trim() ?? "";
  const provided = req.headers.get("x-api-key")?.trim() ?? "";

  if (expected) {
    if (provided && apiKeysEqual(provided, expected)) return { ok: true };
    return {
      ok: false,
      status: 401,
      error: "Invalid or missing x-api-key",
    };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      status: 503,
      error: "SEARCH_KNOWLEDGE_API_KEY is not configured",
    };
  }

  if (isLocalRequest(req)) {
    console.warn(
      "[search-knowledge] SEARCH_KNOWLEDGE_API_KEY is unset; allowing localhost in development. Set the key before exposing this API.",
    );
    return { ok: true };
  }

  return {
    ok: false,
    status: 401,
    error:
      "SEARCH_KNOWLEDGE_API_KEY is unset; only localhost is allowed in development",
  };
}

function apiKeysEqual(a: string, b: string): boolean {
  const key = Buffer.from("atlas-search-knowledge-api-key");
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

function apiKeyKbAllowlist(): string[] | null {
  const raw = process.env.SEARCH_KNOWLEDGE_KB_IDS?.trim();
  if (!raw) return null;
  const ids = raw.split(/[,\s]+/).filter(Boolean);
  return ids.length ? ids : null;
}

/**
 * Resolve KBs the SearchKnowledge key may read.
 * Requested ids are intersected with the env allowlist (if set).
 * With no requested ids: dedicated "SkyRoc Docs" KB, else all KBs (MVP).
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

  const named = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(eq(knowledgeBases.name, SKYROC_KNOWLEDGE_BASE_NAME));
  if (named.length > 0) return named.map((r) => r.id);

  const all = await db.select({ id: knowledgeBases.id }).from(knowledgeBases);
  return all.map((r) => r.id);
}

export async function searchKnowledge(
  input: SearchKnowledgeRequest,
): Promise<SearchKnowledgeResponse> {
  const permittedKbIds = await resolveSearchKnowledgeBaseIds(
    input.knowledgeBaseIds,
  );
  if (permittedKbIds.length === 0) return { items: [] };

  const docTypes = input.docTypes?.filter(isDocType);

  const retrieved = await hybridRetrieve({
    query: input.query,
    permittedKbIds,
    topK: input.topK ?? 8,
    docTypes: docTypes?.length ? docTypes : undefined,
  });

  const items: SearchKnowledgeItem[] = retrieved.map((chunk) => {
    const item: SearchKnowledgeItem = {
      title: chunk.documentTitle,
      snippet: makeSnippet(chunk.content, 720),
      sourcePath: chunk.sourcePath || chunk.documentTitle,
      score: Math.round((chunk.score ?? chunk.hybridScore) * 10000) / 10000,
    };
    if (chunk.docType) item.docType = chunk.docType;
    return item;
  });

  return { items };
}
