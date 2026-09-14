import { NextResponse } from "next/server";
import path from "path";
import { writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { AccessError, requireKbAccess, requireUserId } from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import {
  enqueueDocumentProcessing,
  ensureUploadDir,
  isAllowedUpload,
} from "@/lib/rag";

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

    const dir = await ensureUploadDir(knowledgeBaseId);
    const safeName = file.name.replace(/[^\w.\-()\s\u4e00-\u9fff]/g, "_");
    const storedName = `${randomUUID()}-${safeName}`;
    const storagePath = path.join(dir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    const title =
      (form.get("title") as string | null)?.trim() ||
      safeName.replace(/\.[^.]+$/, "");

    const [doc] = await db
      .insert(documents)
      .values({
        knowledgeBaseId,
        title,
        filename: safeName,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath,
        status: "pending",
        uploadedById: userId,
      })
      .returning();

    const processNow = form.get("process") !== "false";
    if (processNow) {
      enqueueDocumentProcessing(doc.id);
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
