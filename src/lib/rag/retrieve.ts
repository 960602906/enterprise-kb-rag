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

const CJK_STOP = new Set([
  "怎么",
  "怎样",
  "如何",
  "什么",
  "吗",
  "呢",
  "啊",
  "的",
  "了",
  "是",
  "否",
  "能否",
  "可以",
  "是否",
  "一下",
  "这个",
  "那个",
  "一个",
]);

/**
 * Keyword terms for hybrid retrieval.
 * ASCII: word tokens. CJK: overlapping bigrams (stopwords dropped) so
 * queries like「售后怎么查」still hit chunks containing「售后」.
 */
export function extractKeywordTerms(query: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    if (!t || CJK_STOP.has(t) || seen.has(t)) return;
    seen.add(t);
    terms.push(t);
  };

  for (const m of query.toLowerCase().matchAll(/[a-z0-9_]{2,}/g)) {
    add(m[0]!);
  }
  for (const m of query.matchAll(/[\u3400-\u9fff]+/g)) {
    const run = m[0]!;
    if (run.length === 1) {
      add(run);
      continue;
    }
    for (let i = 0; i + 1 < run.length; i++) {
      add(run.slice(i, i + 2));
    }
    // Also keep full run when short (2–6 chars) for exact phrase boost
    if (run.length >= 2 && run.length <= 6) add(run);
  }
  // Domain synonym expansion for short Chinese ops questions (SkyRoc corpus).
  const blob = query.replace(/\s+/g, "");
  const synonymBags: [RegExp, string[]][] = [
    [/审后|销售明细|改明细|修改明细/, ["修改商品明细", "订单修改", "审核后", "销售订单", "UpdateStatus"]],
    [/采购入库|入库草稿/, ["采购入库", "草稿", "审核", "入库"]],
    [/售后/, ["售后列表", "售后单", "查询"]],
  ];
  for (const [re, extras] of synonymBags) {
    if (re.test(blob)) for (const e of extras) add(e);
  }

  return terms;
}

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

  const keywordTerms = extractKeywordTerms(query);
  const termsLiteral = `{${keywordTerms.map((t) => JSON.stringify(t)).join(",")}}`;

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
      (
        COALESCE(ts_rank_cd(c.tsv, plainto_tsquery('english', ${query})), 0)
        + COALESCE((
            SELECT COUNT(*)::float
            FROM unnest(${termsLiteral}::text[]) AS t(term)
            WHERE length(t.term) > 0 AND c.content ILIKE ('%' || t.term || '%')
          ), 0)
        + CASE
            WHEN d.title ILIKE ('%' || ${query} || '%') THEN 2
            ELSE 0
          END
      )::float AS keyword_score
    FROM chunks c
    INNER JOIN documents d ON d.id = c.document_id
    WHERE c.knowledge_base_id = ANY(${kbArrayLiteral}::uuid[])
      AND d.status = 'ready'
      AND (
        c.tsv @@ plainto_tsquery('english', ${query})
        OR (
          cardinality(${termsLiteral}::text[]) > 0
          AND EXISTS (
            SELECT 1 FROM unnest(${termsLiteral}::text[]) AS t(term)
            WHERE length(t.term) > 0 AND c.content ILIKE ('%' || t.term || '%')
          )
        )
      )
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
