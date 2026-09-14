import { eq, sql } from "drizzle-orm";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { chunkText } from "./chunk";
import { buildChunkMetadata, SKYROC_CHUNK } from "./chunk-config";
import { embedTexts } from "./embed";
import { parseFile } from "./parse";

const UPLOAD_ROOT =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export function getUploadRoot() {
  return UPLOAD_ROOT;
}

export async function ensureUploadDir(...parts: string[]) {
  const dir = path.join(/* turbopackIgnore: true */ UPLOAD_ROOT, ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Ingest a document: parse → chunk → embed → store.
 * Safe for on-request local/dev; prefer a queue on Vercel for large files.
 */
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
    const buffer = await readFile(doc.storagePath);
    const parsed = await parseFile(buffer, doc.mimeType, doc.filename);
    const chunkMeta = buildChunkMetadata(doc);
    const textChunks = chunkText(parsed.text, {
      minTokens: SKYROC_CHUNK.minTokens,
      maxTokens: SKYROC_CHUNK.maxTokens,
      overlapTokens: SKYROC_CHUNK.overlapTokens,
      preferStepBoundaries: chunkMeta.docType === "flow",
    });

    if (textChunks.length === 0) {
      throw new Error("No extractable text found in document");
    }

    await db.delete(chunks).where(eq(chunks.documentId, documentId));

    const embeddings = await embedTexts(textChunks.map((c) => c.content));

    const batchSize = 32;
    for (let i = 0; i < textChunks.length; i += batchSize) {
      const slice = textChunks.slice(i, i + batchSize);
      const embSlice = embeddings.slice(i, i + batchSize);

      for (let j = 0; j < slice.length; j++) {
        const c = slice[j];
        const embeddingLiteral = `[${embSlice[j].join(",")}]`;

        await db.execute(sql`
          INSERT INTO chunks (
            id, document_id, knowledge_base_id, chunk_index, content,
            token_count, page_number, heading_path, embedding, tsv, metadata, created_at
          ) VALUES (
            gen_random_uuid(),
            ${documentId}::uuid,
            ${doc.knowledgeBaseId}::uuid,
            ${i + j},
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

/** Fire-and-forget processing for local/dev uploads. */
export function enqueueDocumentProcessing(documentId: string): void {
  void processDocument(documentId).catch((err) => {
    console.error(`[ingest] Failed to process ${documentId}:`, err);
  });
}
