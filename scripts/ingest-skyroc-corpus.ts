/**
 * One-off: ingest first-batch SkyRoc markdown into KB "SkyRoc Docs".
 * Corpus root: /workspace/skyroc-corpus (repo-relative paths preserved).
 */
import { config } from "dotenv";
import path from "path";
import { randomUUID } from "crypto";
import { readFile, writeFile, unlink } from "fs/promises";

// Load env BEFORE importing db (static ESM imports are hoisted — use dynamic).
config({ path: path.join(process.cwd(), ".env.local") });
config({ path: path.join(process.cwd(), ".env") });

type DocType = "flow" | "rule" | "faq";

type CorpusEntry = {
  sourcePath: string;
  docType: DocType;
};

const CORPUS_ROOT = "/workspace/skyroc-corpus";

const ENTRIES: CorpusEntry[] = [
  ...[
    "00-global.md",
    "01-dashboard.md",
    "02-goods.md",
    "03-customer.md",
    "04-order.md",
    "05-after-sales.md",
    "06-purchase.md",
    "07-storage.md",
    "08-delivery.md",
    "09-finance.md",
    "10-reports.md",
    "11-traceability.md",
    "12-system.md",
    "13-auth-personal-legacy.md",
    "99-main-business-flow.md",
  ].map((f) => ({
    sourcePath: `docs/frontend-admin/business-flows/${f}`,
    docType: "flow" as const,
  })),
  { sourcePath: "docs/单据变更流水推广任务.md", docType: "rule" },
  { sourcePath: "docs/ai-search-knowledge.md", docType: "rule" },
  { sourcePath: "docs/testing/前端联调数据说明.md", docType: "faq" },
  { sourcePath: "docs/testing/PostgreSQL自动业务测试.md", docType: "faq" },
];

function titleFromMarkdown(text: string, fallback: string): string {
  const m = text.match(/^#\s+(.+)$/m);
  if (m?.[1]) return m[1].trim().slice(0, 500);
  return fallback.replace(/\.[^.]+$/, "").slice(0, 500);
}

function basenameSafe(sourcePath: string): string {
  const base = path.basename(sourcePath);
  return base.replace(/[^\w.\-()\s\u4e00-\u9fff]/g, "_");
}

async function main() {
  const { eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { chunks, documents, knowledgeBases, users } = await import(
    "../src/lib/db/schema"
  );
  const { SKYROC_KNOWLEDGE_BASE_NAME } = await import(
    "../src/lib/rag/chunk-config"
  );
  const { processDocument, ensureUploadDir } = await import(
    "../src/lib/rag/ingest"
  );

  console.log(`Corpus: ${CORPUS_ROOT}`);
  console.log(`MOCK_EMBEDDINGS=${process.env.MOCK_EMBEDDINGS}`);
  console.log(`DATABASE_URL set: ${Boolean(process.env.DATABASE_URL)}`);

  const [kb] = await db
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.name, SKYROC_KNOWLEDGE_BASE_NAME))
    .limit(1);
  if (!kb) {
    throw new Error(
      `KB "${SKYROC_KNOWLEDGE_BASE_NAME}" not found — run seed first`,
    );
  }
  const kbId = kb.id;

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const adminId = admin?.id ?? null;

  console.log(`KB: ${SKYROC_KNOWLEDGE_BASE_NAME} (${kbId})`);
  console.log(`Admin: ${adminId ?? "(none)"}`);

  // Remove misplaced Employee Handbook from SkyRoc Docs
  const existingDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.knowledgeBaseId, kbId));
  for (const doc of existingDocs) {
    const meta = (doc.metadata ?? {}) as Record<string, unknown>;
    const sourcePath =
      typeof meta.sourcePath === "string" ? meta.sourcePath : "";
    const isHandbook =
      /employee.?handbook/i.test(doc.title) ||
      /employee.?handbook/i.test(doc.filename) ||
      /employee-handbook/i.test(sourcePath);
    if (!isHandbook) continue;
    console.log(
      `[cleanup] Removing misplaced Employee Handbook: ${doc.id} (${doc.title})`,
    );
    await db.delete(chunks).where(eq(chunks.documentId, doc.id));
    await db.delete(documents).where(eq(documents.id, doc.id));
    try {
      await unlink(doc.storagePath);
    } catch {
      /* ignore */
    }
  }

  async function findBySourcePath(sourcePath: string) {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.knowledgeBaseId, kbId));
    for (const doc of rows) {
      const meta = (doc.metadata ?? {}) as Record<string, unknown>;
      if (meta.sourcePath === sourcePath) return doc;
    }
    return null;
  }

  const results: {
    sourcePath: string;
    ok: boolean;
    documentId?: string;
    chunks?: number;
    error?: string;
  }[] = [];

  for (const entry of ENTRIES) {
    const abs = path.join(CORPUS_ROOT, entry.sourcePath);
    let buffer: Buffer;
    try {
      buffer = await readFile(abs);
    } catch (err) {
      results.push({
        sourcePath: entry.sourcePath,
        ok: false,
        error: `missing: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const text = buffer.toString("utf8");
    const safeName = basenameSafe(entry.sourcePath);
    const title = titleFromMarkdown(text, safeName);
    const existing = await findBySourcePath(entry.sourcePath);
    const dir = await ensureUploadDir(kbId);
    const storedName = `${randomUUID()}-${safeName}`;
    const storagePath = path.join(dir, storedName);
    await writeFile(storagePath, buffer);

    let documentId: string;
    if (existing) {
      const oldPath = existing.storagePath;
      await db.delete(chunks).where(eq(chunks.documentId, existing.id));
      await db
        .update(documents)
        .set({
          title,
          filename: safeName,
          mimeType: "text/markdown",
          fileSize: buffer.length,
          storagePath,
          status: "pending",
          errorMessage: null,
          chunkCount: 0,
          pageCount: null,
          processedAt: null,
          metadata: { docType: entry.docType, sourcePath: entry.sourcePath },
          updatedAt: new Date(),
          ...(adminId ? { uploadedById: adminId } : {}),
        })
        .where(eq(documents.id, existing.id));
      documentId = existing.id;
      if (oldPath && oldPath !== storagePath) {
        try {
          await unlink(oldPath);
        } catch {
          /* ignore */
        }
      }
      console.log(`[replace] ${entry.sourcePath} → ${documentId}`);
    } else {
      const [doc] = await db
        .insert(documents)
        .values({
          knowledgeBaseId: kbId,
          title,
          filename: safeName,
          mimeType: "text/markdown",
          fileSize: buffer.length,
          storagePath,
          status: "pending",
          uploadedById: adminId,
          metadata: { docType: entry.docType, sourcePath: entry.sourcePath },
        })
        .returning();
      documentId = doc.id;
      console.log(`[insert]  ${entry.sourcePath} → ${documentId}`);
    }

    try {
      await processDocument(documentId);
      const [ready] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
      results.push({
        sourcePath: entry.sourcePath,
        ok: true,
        documentId,
        chunks: ready?.chunkCount ?? 0,
      });
      console.log(`  ✓ chunks=${ready?.chunkCount ?? 0}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ sourcePath: entry.sourcePath, ok: false, documentId, error });
      console.error(`  ✗ ${error}`);
    }
  }

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  const docCount = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.knowledgeBaseId, kbId));
  const chunkCountRows = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM chunks WHERE knowledge_base_id = ${kbId}::uuid`,
  );
  const chunkTotal =
    (chunkCountRows as unknown as { n: number }[])[0]?.n ??
    (chunkCountRows as unknown as { rows?: { n: number }[] }).rows?.[0]?.n ??
    "?";

  console.log("\n=== SUMMARY ===");
  console.log(`Ingested OK: ${ok.length}/${ENTRIES.length}`);
  console.log(`Failed: ${failed.length}`);
  for (const f of failed) {
    console.log(`  - ${f.sourcePath}: ${f.error}`);
  }
  console.log(`SkyRoc Docs documents: ${docCount.length}`);
  console.log(`SkyRoc Docs chunks: ${chunkTotal}`);

  const allDocs = await db
    .select({
      title: documents.title,
      status: documents.status,
      chunkCount: documents.chunkCount,
      metadata: documents.metadata,
    })
    .from(documents)
    .where(eq(documents.knowledgeBaseId, kbId));
  console.log("\nDocuments in SkyRoc Docs:");
  for (const d of allDocs) {
    const m = (d.metadata ?? {}) as Record<string, unknown>;
    console.log(
      `  [${d.status}] chunks=${d.chunkCount} docType=${m.docType} sourcePath=${m.sourcePath} title=${d.title}`,
    );
  }

  if (failed.length > 0) process.exitCode = 1;
  // Force exit — postgres pool keeps event loop alive
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
