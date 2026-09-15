import { createHmac, timingSafeEqual } from "crypto";
import type { SearchApiKeyAuth } from "@/lib/api-keys/service";
import { findEnabledApiKeyBySecret } from "@/lib/api-keys/service";
import { isDocType, type DocType } from "./chunk-config";
import { getRetrievalConfig } from "./retrieval-config";
import { hybridRetrieve, makeSnippet } from "./retrieve";
import { resolveSearchKnowledgeBaseIds } from "./search-scope";

export { resolveSearchKnowledgeBaseIds } from "./search-scope";

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
  | { ok: true; auth: SearchApiKeyAuth }
  | { ok: false; status: number; error: string };

/**
 * Auth for `/api/search-knowledge`.
 *
 * Lookup order:
 * 1. Enabled DB API key (SHA-256 hash) → scoped to bound KBs
 * 2. Legacy env `SEARCH_KNOWLEDGE_API_KEY` (+ env KB allowlist / ALLOW_ALL)
 * 3. Development localhost when no env key is configured
 */
export async function authorizeSearchKnowledge(
  req: Request,
): Promise<AuthResult> {
  const provided = req.headers.get("x-api-key")?.trim() ?? "";

  if (provided) {
    try {
      const dbAuth = await findEnabledApiKeyBySecret(provided);
      if (dbAuth) return { ok: true, auth: dbAuth };
    } catch (err) {
      console.error("[search-knowledge] DB API key lookup failed", err);
    }

    const expected = process.env.SEARCH_KNOWLEDGE_API_KEY?.trim() ?? "";
    if (expected && apiKeysEqual(provided, expected)) {
      return { ok: true, auth: { kind: "legacy" } };
    }

    return {
      ok: false,
      status: 401,
      error: "Invalid or missing x-api-key",
    };
  }

  // Missing header: never treat as "unconfigured" once DB keys are in use —
  // always 401 except localhost-dev when the legacy env key is also unset.
  const expected = process.env.SEARCH_KNOWLEDGE_API_KEY?.trim() ?? "";
  if (expected) {
    return {
      ok: false,
      status: 401,
      error: "Invalid or missing x-api-key",
    };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      status: 401,
      error: "Invalid or missing x-api-key",
    };
  }

  if (isLocalRequest(req)) {
    console.warn(
      "[search-knowledge] no x-api-key; allowing localhost in development. Prefer a DB-issued key or SEARCH_KNOWLEDGE_API_KEY before exposing this API.",
    );
    return { ok: true, auth: { kind: "dev-localhost" } };
  }

  return {
    ok: false,
    status: 401,
    error:
      "x-api-key is required; only localhost is allowed without a key in development",
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

export async function searchKnowledge(
  input: SearchKnowledgeRequest,
  auth: SearchApiKeyAuth,
): Promise<SearchKnowledgeResponse> {
  const scope =
    auth.kind === "db"
      ? {
          allowlist: auth.knowledgeBaseIds,
          legacyEnvScope: false,
        }
      : {
          // legacy + localhost keep SEARCH_KNOWLEDGE_* behavior
          legacyEnvScope: true,
        };

  const permittedKbIds = await resolveSearchKnowledgeBaseIds(
    input.knowledgeBaseIds,
    scope,
  );
  if (permittedKbIds.length === 0) return { items: [] };

  const docTypes = input.docTypes?.filter(isDocType);
  const cfg = getRetrievalConfig();

  const retrieved = await hybridRetrieve({
    query: input.query,
    permittedKbIds,
    topK: input.topK ?? cfg.topK,
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
