import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { getObjectStore, getUploadRoot, objectKey } from "@/lib/storage";
import { chunkText } from "./chunk";
import { buildChunkMetadata, DEFAULT_CHUNK } from "./chunk-config";
import { embedTexts } from "./embed";
import { parseFile } from "./parse";

export { getUploadRoot };

/** @deprecated Use getObjectStore().put — kept for corpus scripts. */
export async function ensureUploadDir(...parts: string[]) {
  const { mkdir } = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(getUploadRoot(), ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function processDocument(documentId: string): Promise<void> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc) throw new Error(`Document ${documentId} not found`);

  await db
    .update(documents)
    .set({
      status: "processing",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));

  try {
    const store = getObjectStore();
    const buffer = await store.get(doc.storagePath);
    const parsed = await parseFile(buffer, doc.mimeType, doc.filename);
    const chunkMeta = buildChunkMetadata(doc);
    const textChunks = chunkText(parsed.text, {
      minTokens: DEFAULT_CHUNK.minTokens,
      maxTokens: DEFAULT_CHUNK.maxTokens,
      overlapTokens: DEFAULT_CHUNK.overlapTokens,
      preferStepBoundaries: chunkMeta.docType === "flow",
    });

    if (textChunks.length === 0) {
      throw new Error("No extractable text found in document");
    }

    await db.delete(chunks).where(eq(chunks.documentId, documentId));
    const embeddings = await embedTexts(textChunks.map((c) => c.content));

    for (let i = 0; i < textChunks.length; i++) {
      const c = textChunks[i];
      const embeddingLiteral = `[${embeddings[i].join(",")}]`;
      await db.execute(sql`
        INSERT INTO chunks (
          id, document_id, knowledge_base_id, chunk_index, content,
          token_count, page_number, heading_path, embedding, tsv, metadata, created_at
        ) VALUES (
          gen_random_uuid(),
          ${documentId}::uuid,
          ${doc.knowledgeBaseId}::uuid,
          ${i},
          ${c.content},
          ${c.tokenCount},
          ${c.pageNumber ?? null},
          ${c.headingPath ?? null},
          ${embeddingLiteral}::vector,
          to_tsvector('english', ${c.content}),
          ${JSON.stringify(chunkMeta)}::jsonb,
          now()
        )
      `);
    }

    await db
      .update(documents)
      .set({
        status: "ready",
        chunkCount: textChunks.length,
        pageCount: parsed.pageCount ?? null,
        processedAt: new Date(),
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(documents.id, documentId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(documents)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
    throw err;
  }
}

/** Remove the stored object then the row (chunks / ingest_jobs cascade). */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return false;

  try {
    await getObjectStore().remove(doc.storagePath);
  } catch {
    /* locator already gone or unreadable */
  }

  await db.delete(documents).where(eq(documents.id, documentId));
  return true;
}

/** Best-effort object cleanup before a knowledge-base row delete. */
export async function deleteKnowledgeBaseObjects(
  knowledgeBaseId: string,
): Promise<void> {
  const rows = await db
    .select({ storagePath: documents.storagePath })
    .from(documents)
    .where(eq(documents.knowledgeBaseId, knowledgeBaseId));
  const store = getObjectStore();
  for (const row of rows) {
    try {
      await store.remove(row.storagePath);
    } catch {
      /* continue */
    }
  }
}

export { objectKey };
