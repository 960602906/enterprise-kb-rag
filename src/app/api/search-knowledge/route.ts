import { NextResponse } from "next/server";
import { z } from "zod";
import type { SearchApiKeyAuth } from "@/lib/api-keys/service";
import { DOC_TYPES } from "@/lib/rag/chunk-config";
import {
  authorizeSearchKnowledge,
  searchKnowledge,
} from "@/lib/rag/search-knowledge";
import {
  clientIp,
  envInt,
  hitRateLimit,
  rateLimitedResponse,
} from "@/lib/rate-limit";

const docTypeSchema = z.enum(DOC_TYPES);

const bodySchema = z.object({
  query: z.string().trim().min(1).max(4000),
  topK: z.coerce.number().int().min(1).max(50).optional(),
  docTypes: z.array(docTypeSchema).optional(),
  knowledgeBaseIds: z.array(z.string().uuid()).optional(),
});

function searchLimit(req: Request, auth: SearchApiKeyAuth) {
  if (auth.kind === "db") {
    return hitRateLimit({
      key: `search-knowledge:db:${auth.apiKeyId}`,
      limit: auth.rateLimitPerMin ?? envInt("SEARCH_RATE_LIMIT_PER_MIN", 60),
    });
  }
  return hitRateLimit({
    key: `search-knowledge:${clientIp(req)}`,
    limit: envInt("SEARCH_RATE_LIMIT_PER_MIN", 60),
  });
}

/**
 * SkyRoc read-only RAG bypass.
 * Auth: `x-api-key` — DB-issued key (preferred) or legacy SEARCH_KNOWLEDGE_API_KEY.
 */
export async function POST(req: Request) {
  const authz = await authorizeSearchKnowledge(req);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }
  const limited = searchLimit(req, authz.auth);
  if (!limited.ok) return rateLimitedResponse(limited);

  try {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = await searchKnowledge(parsed.data, authz.auth);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json(result.response);
  } catch (err) {
    console.error("[search-knowledge]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const authz = await authorizeSearchKnowledge(req);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }
  const limited = searchLimit(req, authz.auth);
  if (!limited.ok) return rateLimitedResponse(limited);

  try {
    const url = new URL(req.url);
    const docTypesRaw = url.searchParams.get("docTypes");
    const kbRaw = url.searchParams.get("knowledgeBaseIds");
    const parsed = bodySchema.safeParse({
      query: url.searchParams.get("query") ?? "",
      topK: url.searchParams.get("topK") ?? undefined,
      docTypes: docTypesRaw
        ? docTypesRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      knowledgeBaseIds: kbRaw
        ? kbRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = await searchKnowledge(parsed.data, authz.auth);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json(result.response);
  } catch (err) {
    console.error("[search-knowledge]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
