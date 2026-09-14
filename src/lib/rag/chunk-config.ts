/**
 * SkyRoc / Atlas KB chunking + corpus rules.
 *
 * SearchKnowledge (POST /api/search-knowledge) is a read-only retrieval bypass
 * for SkyRoc. Callers must treat returned snippets as context only — never as
 * license to invent flows, field values, or DB writes.
 *
 * Corpus allowlist (ingest these; never source code or production DB dumps):
 *   - docs/frontend-admin/business-flows/*
 *   - 单据变更流水推广任务.md
 *   - testing/联调
 *
 * TODO: persist explicit docType/sourcePath on the document row for operators
 * who upload via the UI without SkyRoc-style paths (partially done via
 * documents.metadata). Re-process legacy chunks so metadata.docType is tagged.
 */

export const DOC_TYPES = ["flow", "rule", "faq"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Dedicated KB used when SearchKnowledge is called without knowledgeBaseIds. */
export const SKYROC_KNOWLEDGE_BASE_NAME = "SkyRoc Docs";

/**
 * Target window for SkyRoc markdown (business-flows, rules, FAQs).
 * Prefer heading / numbered-step boundaries over mid-sentence cuts.
 */
export const SKYROC_CHUNK = {
  /** Inclusive lower bound before a heading flush (~400–800 tokens). */
  minTokens: 400,
  maxTokens: 800,
  /** Overlap ~80–120 tokens between adjacent windows. */
  overlapTokens: 100,
} as const;

export type ChunkMetadata = {
  docType?: DocType;
  sourcePath: string;
  title: string;
};

export function isDocType(value: unknown): value is DocType {
  return (
    typeof value === "string" &&
    (DOC_TYPES as readonly string[]).includes(value)
  );
}

/** Map a filename / corpus path / title onto flow | rule | faq when possible. */
export function inferDocType(input: {
  filename?: string | null;
  sourcePath?: string | null;
  title?: string | null;
  explicit?: string | null;
}): DocType | undefined {
  if (isDocType(input.explicit)) return input.explicit;

  const blob = [input.sourcePath, input.filename, input.title]
    .filter(Boolean)
    .join(" ")
    .replace(/\\/g, "/")
    .toLowerCase();

  if (!blob.trim()) return undefined;

  if (/faq|常见问题|q\s*&\s*a|问答/.test(blob)) return "faq";
  if (
    /business-flows|\/flows\/|\bflow\b|流程|流水/.test(blob) ||
    /单据变更/.test(blob)
  ) {
    return "flow";
  }
  if (/rule|规则|policy|政策|制度/.test(blob)) return "rule";
  return undefined;
}

/**
 * Prefer the original corpus path (e.g. docs/frontend-admin/business-flows/x.md)
 * over the local uuid-prefixed upload path.
 */
export function inferSourcePath(
  filename: string,
  storagePath?: string | null,
): string {
  const normalizedName = filename.replace(/\\/g, "/").trim();
  if (normalizedName.includes("/")) return normalizedName;
  if (storagePath) {
    const posix = storagePath.replace(/\\/g, "/");
    const marker = "/business-flows/";
    const idx = posix.toLowerCase().indexOf("docs/");
    if (idx >= 0) return posix.slice(idx);
    const flowIdx = posix.toLowerCase().indexOf(marker.slice(1));
    if (flowIdx >= 0) return posix.slice(flowIdx);
  }
  return normalizedName;
}

export function buildChunkMetadata(doc: {
  title: string;
  filename: string;
  storagePath?: string | null;
  metadata?: Record<string, unknown> | null;
}): ChunkMetadata {
  const stored = doc.metadata ?? {};
  const storedSource =
    typeof stored.sourcePath === "string" && stored.sourcePath.trim()
      ? stored.sourcePath.trim()
      : null;
  const sourcePath =
    storedSource ?? inferSourcePath(doc.filename, doc.storagePath);
  const docType = inferDocType({
    filename: doc.filename,
    sourcePath,
    title: doc.title,
    explicit: typeof stored.docType === "string" ? stored.docType : null,
  });

  return {
    ...(docType ? { docType } : {}),
    sourcePath,
    title: doc.title,
  };
}
