import { NextResponse } from "next/server";
import { z } from "zod";
import { DOC_TYPES } from "@/lib/rag/chunk-config";
import {
  authorizeSearchKnowledge,
  searchKnowledge,
} from "@/lib/rag/search-knowledge";

const docTypeSchema = z.enum(DOC_TYPES);

const bodySchema = z.object({
  query: z.string().trim().min(1).max(4000),
  topK: z.coerce.number().int().min(1).max(50).optional(),
  docTypes: z.array(docTypeSchema).optional(),
  knowledgeBaseIds: z.array(z.string().uuid()).optional(),
});

/**
 * SkyRoc read-only RAG bypass.
 * Auth: `x-api-key` matching SEARCH_KNOWLEDGE_API_KEY.
 */
export async function POST(req: Request) {
  const authz = authorizeSearchKnowledge(req);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  try {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = await searchKnowledge(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[search-knowledge]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const authz = authorizeSearchKnowledge(req);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

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
    const result = await searchKnowledge(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[search-knowledge]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
