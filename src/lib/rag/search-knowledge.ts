import { createHmac, timingSafeEqual } from "crypto";
import { isDocType, type DocType } from "./chunk-config";
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
  | { ok: true }
  | { ok: false; status: number; error: string };

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
