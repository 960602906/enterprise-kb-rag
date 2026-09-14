import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { CitationPayload } from "@/lib/db/schema";
import { embedText } from "./embed";

export type RetrievedChunk = CitationPayload & {
  content: string;
  vectorScore?: number;
  keywordScore?: number;
  hybridScore: number;
};

/**
 * Hybrid retrieval: vector cosine + Postgres full-text (ts_rank).
 *
 * CRITICAL: `permittedKbIds` must already be ACL-filtered.
 * Never retrieve-then-post-filter — WHERE constrains KB ids.
 */
export async function hybridRetrieve(options: {
  query: string;
  permittedKbIds: string[];
  topK?: number;
  vectorWeight?: number;
  keywordWeight?: number;
}): Promise<RetrievedChunk[]> {
  const {
    query,
    permittedKbIds,
    topK = 8,
    vectorWeight = 0.65,
    keywordWeight = 0.35,
  } = options;

  if (permittedKbIds.length === 0) return [];

  const queryEmbedding = await embedText(query);
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;
  const kbArrayLiteral = `{${permittedKbIds.join(",")}}`;
  const candidateLimit = Math.max(topK * 3, 24);

  const vectorRows = await db.execute<{
    id: string;
    document_id: string;
    content: string;
    page_number: number | null;
    heading_path: string | null;
    document_title: string;
    vector_score: number;
  }>(sql`
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.page_number,
      c.heading_path,
      d.title AS document_title,
      (1 - (c.embedding <=> ${embeddingLiteral}::vector))::float AS vector_score
    FROM chunks c
    INNER JOIN documents d ON d.id = c.document_id
    WHERE c.knowledge_base_id = ANY(${kbArrayLiteral}::uuid[])
      AND c.embedding IS NOT NULL
      AND d.status = 'ready'
    ORDER BY c.embedding <=> ${embeddingLiteral}::vector
    LIMIT ${candidateLimit}
  `);

  const keywordRows = await db.execute<{
    id: string;
    document_id: string;
    content: string;
    page_number: number | null;
    heading_path: string | null;
    document_title: string;
    keyword_score: number;
  }>(sql`
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.page_number,
      c.heading_path,
      d.title AS document_title,
      ts_rank_cd(c.tsv, plainto_tsquery('english', ${query}))::float AS keyword_score
    FROM chunks c
    INNER JOIN documents d ON d.id = c.document_id
    WHERE c.knowledge_base_id = ANY(${kbArrayLiteral}::uuid[])
      AND c.tsv @@ plainto_tsquery('english', ${query})
      AND d.status = 'ready'
    ORDER BY keyword_score DESC
    LIMIT ${candidateLimit}
  `);

  const fused = new Map<string, RetrievedChunk>();
  const maxVec = Math.max(
    ...vectorRows.map((r) => Number(r.vector_score) || 0),
    1e-9,
  );
  const maxKw = Math.max(
    ...keywordRows.map((r) => Number(r.keyword_score) || 0),
    1e-9,
  );

  for (const row of vectorRows) {
    const vectorScore = Number(row.vector_score) || 0;
    fused.set(row.id, {
      chunkId: row.id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      snippet: makeSnippet(row.content),
      content: row.content,
      pageNumber: row.page_number,
      headingPath: row.heading_path,
      vectorScore,
      hybridScore: (vectorScore / maxVec) * vectorWeight,
      score: 0,
    });
  }

  for (const row of keywordRows) {
    const keywordScore = Number(row.keyword_score) || 0;
    const existing = fused.get(row.id);
    if (existing) {
      existing.keywordScore = keywordScore;
      existing.hybridScore += (keywordScore / maxKw) * keywordWeight;
    } else {
      fused.set(row.id, {
        chunkId: row.id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        snippet: makeSnippet(row.content),
        content: row.content,
        pageNumber: row.page_number,
        headingPath: row.heading_path,
        keywordScore,
        hybridScore: (keywordScore / maxKw) * keywordWeight,
        score: 0,
      });
    }
  }

  return [...fused.values()]
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK)
    .map((r) => ({ ...r, score: r.hybridScore }))
    .filter((r) => r.hybridScore >= 0.08);
}

function makeSnippet(content: string, maxLen = 240): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + "…";
}

export function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((c, i) => {
      const loc = [
        c.documentTitle,
        c.headingPath,
        c.pageNumber != null ? `p.${c.pageNumber}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `[${i + 1}] (${loc})\n${c.content}`;
    })
    .join("\n\n---\n\n");
}
