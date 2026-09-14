import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { CitationPayload } from "@/lib/db/schema";
import {
  isDocType,
  type DocType,
} from "./chunk-config";
import { embedText } from "./embed";

export type RetrievedChunk = CitationPayload & {
  content: string;
  vectorScore?: number;
  keywordScore?: number;
  hybridScore: number;
  sourcePath?: string;
  docType?: DocType;
  metadata?: Record<string, unknown>;
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
  /** When set, prefer chunks whose metadata.docType matches; untagged chunks stay eligible. */
  docTypes?: DocType[];
}): Promise<RetrievedChunk[]> {
  const {
    query,
    permittedKbIds,
    topK = 8,
    vectorWeight = 0.65,
    keywordWeight = 0.35,
    docTypes,
  } = options;

  if (permittedKbIds.length === 0) return [];

  const queryEmbedding = await embedText(query);
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;
  const kbArrayLiteral = `{${permittedKbIds.join(",")}}`;
  const candidateLimit = Math.max(topK * 3, 24);
  const docTypeClause = docTypeFilterSql(docTypes);

  const vectorRows = await db.execute<RetrievalRow>(sql`
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.page_number,
      c.heading_path,
      d.title AS document_title,
      d.filename AS document_filename,
      d.storage_path AS document_storage_path,
      c.metadata AS metadata,
      (1 - (c.embedding <=> ${embeddingLiteral}::vector))::float AS vector_score
    FROM chunks c
    INNER JOIN documents d ON d.id = c.document_id
    WHERE c.knowledge_base_id = ANY(${kbArrayLiteral}::uuid[])
      AND c.embedding IS NOT NULL
      AND d.status = 'ready'
      ${docTypeClause}
    ORDER BY c.embedding <=> ${embeddingLiteral}::vector
    LIMIT ${candidateLimit}
  `);

  const keywordRows = await db.execute<RetrievalRow>(sql`
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.page_number,
      c.heading_path,
      d.title AS document_title,
      d.filename AS document_filename,
      d.storage_path AS document_storage_path,
      c.metadata AS metadata,
      ts_rank_cd(c.tsv, plainto_tsquery('english', ${query}))::float AS keyword_score
    FROM chunks c
    INNER JOIN documents d ON d.id = c.document_id
    WHERE c.knowledge_base_id = ANY(${kbArrayLiteral}::uuid[])
      AND c.tsv @@ plainto_tsquery('english', ${query})
      AND d.status = 'ready'
      ${docTypeClause}
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
      ...mapRetrievalRow(row),
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
        ...mapRetrievalRow(row),
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

type RetrievalRow = {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  heading_path: string | null;
  document_title: string;
  document_filename?: string | null;
  document_storage_path?: string | null;
  metadata?: unknown;
  vector_score?: number;
  keyword_score?: number;
};

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function mapRetrievalRow(
  row: RetrievalRow,
): Omit<RetrievedChunk, "hybridScore" | "score" | "vectorScore" | "keywordScore"> {
  const metadata = parseMetadata(row.metadata);
  const docType = isDocType(metadata.docType) ? metadata.docType : undefined;
  const sourcePath =
    (typeof metadata.sourcePath === "string" && metadata.sourcePath) ||
    row.document_filename ||
    row.document_storage_path ||
    undefined;
  const title =
    (typeof metadata.title === "string" && metadata.title) ||
    row.document_title;

  return {
    chunkId: row.id,
    documentId: row.document_id,
    documentTitle: title,
    snippet: makeSnippet(row.content),
    content: row.content,
    pageNumber: row.page_number,
    headingPath: row.heading_path,
    sourcePath,
    docType,
    metadata,
  };
}

/** Untagged chunks remain searchable until ingest backfill tags docType. */
function docTypeFilterSql(docTypes?: DocType[]) {
  if (!docTypes?.length) return sql``;
  const allowed = `{${docTypes.join(",")}}`;
  return sql`AND (
    c.metadata->>'docType' IS NULL
    OR c.metadata->>'docType' = ''
    OR c.metadata->>'docType' = ANY(${allowed}::text[])
  )`;
}

export function makeSnippet(content: string, maxLen = 240): string {
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
