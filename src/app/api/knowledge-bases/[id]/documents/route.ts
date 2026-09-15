import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { AccessError, requireKbAccess, requireUserId } from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import {
  enqueueDocumentProcessing,
  inferDocType,
  inferSourcePath,
  isAllowedUpload,
  isDocType,
  objectKey,
} from "@/lib/rag";
import { getObjectStore } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id: knowledgeBaseId } = await ctx.params;
    await requireKbAccess(userId, knowledgeBaseId, "manage");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!isAllowedUpload(file.name, file.type || "application/octet-stream")) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, Markdown, TXT, or DOCX." },
        { status: 400 },
      );
    }

    const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024);
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large (max ${maxBytes} bytes)` },
        { status: 400 },
      );
    }

    const explicitDocType = (form.get("docType") as string | null)?.trim();
    if (explicitDocType && !isDocType(explicitDocType)) {
      return NextResponse.json(
        { error: "docType must be flow, rule, or faq" },
        { status: 400 },
      );
    }

    const safeName = file.name.replace(/[^\w.\-()\s\u4e00-\u9fff]/g, "_");
    const storedName = `${randomUUID()}-${safeName}`;
    const key = objectKey(knowledgeBaseId, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await getObjectStore().put(
      key,
      buffer,
      file.type || "application/octet-stream",
    );

    const title =
      (form.get("title") as string | null)?.trim() ||
      safeName.replace(/\.[^.]+$/, "");

    const explicitSource = (form.get("sourcePath") as string | null)?.trim();
    const sourcePath =
      explicitSource || inferSourcePath(safeName, stored.locator);
    const docType = inferDocType({
      filename: safeName,
      sourcePath,
      title,
      explicit: explicitDocType,
    });

    const [doc] = await db
      .insert(documents)
      .values({
        knowledgeBaseId,
        title,
        filename: safeName,
        mimeType: file.type || "application/octet-stream",
        fileSize: stored.bytes,
        storagePath: stored.locator,
        status: "pending",
        uploadedById: userId,
        metadata: {
          ...(docType ? { docType } : {}),
          sourcePath,
        },
      })
      .returning();

    const processNow = form.get("process") !== "false";
    if (processNow) {
      await enqueueDocumentProcessing(doc.id);
      const [updated] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, doc.id))
        .limit(1);
      return NextResponse.json({ item: updated ?? doc }, { status: 201 });
    }

    return NextResponse.json({ item: doc }, { status: 201 });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
