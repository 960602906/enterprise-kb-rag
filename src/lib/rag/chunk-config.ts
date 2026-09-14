/**
 * Generic chunking + document-type heuristics for Atlas KB.
 *
 * Domain-specific corpora (internal handbooks, ERP flows, etc.) should
 * set metadata on upload (`docType`, `sourcePath`) rather than hard-coding
 * product names in this module.
 */

export const DOC_TYPES = ["flow", "rule", "faq"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/**
 * KB used when the service search API is called without `knowledgeBaseIds`
 * and `SEARCH_KNOWLEDGE_KB_IDS` is unset.
 *
 * Override with SEARCH_KNOWLEDGE_DEFAULT_KB_NAME. Never fall back to
 * "every knowledge base in the database".
 */
export function defaultSearchKnowledgeBaseName(): string {
  return (
    process.env.SEARCH_KNOWLEDGE_DEFAULT_KB_NAME?.trim() || "Internal Docs"
  );
}

/** @deprecated Use defaultSearchKnowledgeBaseName() */
export const SKYROC_KNOWLEDGE_BASE_NAME = "Internal Docs";

/**
 * Target window for markdown / prose. Prefer heading and numbered-step
 * boundaries over mid-sentence cuts.
 */
export const DEFAULT_CHUNK = {
  minTokens: 400,
  maxTokens: 800,
  overlapTokens: 100,
} as const;

/** @deprecated Use DEFAULT_CHUNK */
export const SKYROC_CHUNK = DEFAULT_CHUNK;

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
  if (/rule|规则|policy|政策|制度|handbook/.test(blob)) return "rule";
  return undefined;
}

/**
 * Prefer an original corpus-relative path over a local uuid-prefixed
 * upload path when the filename already contains directories.
 */
export function inferSourcePath(
  filename: string,
  storagePath?: string | null,
): string {
  const normalizedName = filename.replace(/\\/g, "/").trim();
  if (normalizedName.includes("/")) return normalizedName;
  if (storagePath) {
    const posix = storagePath.replace(/\\/g, "/");
    const docsIdx = posix.toLowerCase().indexOf("docs/");
    if (docsIdx >= 0) return posix.slice(docsIdx);
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
