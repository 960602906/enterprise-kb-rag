/**
 * Upload + process samples/employee-handbook.md into the eval KB.
 *   pnpm eval:ingest-sample
 */
import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";

async function main() {
  const { db, closeDb } = await import("../src/lib/db");
  const { documents, knowledgeBases } = await import("../src/lib/db/schema");
  const { objectKey, processDocument } = await import("../src/lib/rag/ingest");
  const { getObjectStore } = await import("../src/lib/storage");

  try {
    const kbName = process.env.EVAL_KB_NAME?.trim() || "Employee Handbook";
    const [kb] = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.name, kbName))
      .limit(1);
    if (!kb) throw new Error(`Knowledge base not found: ${kbName}`);

    const filePath = path.join(process.cwd(), "samples/employee-handbook.md");
    const buffer = readFileSync(filePath);
    const filename = "employee-handbook.md";
    const key = objectKey(kb.id, `eval-${filename}`);
    const stored = await getObjectStore().put(key, buffer, "text/markdown");

    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.filename, filename))
      .limit(1);

    let documentId = existing?.id;
    if (documentId) {
      await db
        .update(documents)
        .set({
          storagePath: stored.locator,
          status: "pending",
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
    } else {
      const [created] = await db
        .insert(documents)
        .values({
          knowledgeBaseId: kb.id,
          title: "Employee Handbook",
          filename,
          mimeType: "text/markdown",
          fileSize: stored.bytes,
          storagePath: stored.locator,
          status: "pending",
          metadata: { docType: "rule", sourcePath: filename },
        })
        .returning();
      documentId = created.id;
    }

    await processDocument(documentId);
    console.log(`Ingested sample handbook documentId=${documentId}`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
