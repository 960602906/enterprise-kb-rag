import "@/lib/env-sanitize";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  AccessError,
  filterPermittedKbIds,
  requireUserId,
} from "@/lib/auth/acl";
import { db } from "@/lib/db";
import {
  chatMessages,
  chatSessions,
  qaLogs,
  type CitationPayload,
} from "@/lib/db/schema";
import {
  assertChunksPermitted,
  buildContextBlock,
  hybridRetrieve,
} from "@/lib/rag";
import { envInt, hitRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

function getModel() {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
  const baseURL =
    process.env.OPENAI_BASE_URL || process.env.AI_GATEWAY_BASE_URL || undefined;
  const openai = createOpenAI({
    apiKey: apiKey ?? "missing-key",
    baseURL,
  });
  const modelId = process.env.CHAT_MODEL ?? "gpt-4o-mini";
  return { model: openai(modelId), modelId, hasKey: Boolean(apiKey) };
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const limited = hitRateLimit({
      key: `chat:${userId}`,
      limit: envInt("CHAT_RATE_LIMIT_PER_MIN", 20),
    });
    if (!limited.ok) return rateLimitedResponse(limited);
    const body = await req.json();

    const messages = (body.messages ?? []) as UIMessage[];
    const knowledgeBaseIds = (body.knowledgeBaseIds ??
      body.body?.knowledgeBaseIds ??
      []) as string[];
    const sessionId = (body.sessionId ?? body.body?.sessionId) as
      | string
      | undefined;

    if (!Array.isArray(knowledgeBaseIds) || knowledgeBaseIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one knowledge base" },
        { status: 400 },
      );
    }

    const permitted = await filterPermittedKbIds(userId, knowledgeBaseIds);
    if (permitted.length === 0) {
      return NextResponse.json(
        { error: "No accessible knowledge bases in selection" },
        { status: 403 },
      );
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const question = extractText(lastUser);
    if (!question.trim()) {
      return NextResponse.json({ error: "Empty question" }, { status: 400 });
    }

    const retrievedRaw = await hybridRetrieve({
      query: question,
      permittedKbIds: permitted,
    });
    const retrieved = await assertChunksPermitted(retrievedRaw, permitted);

    const citations: CitationPayload[] = retrieved.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      snippet: r.snippet,
      pageNumber: r.pageNumber,
      headingPath: r.headingPath,
      score: r.score,
    }));

    let activeSessionId = sessionId;
    if (activeSessionId) {
      await requireOwnedChatSession(userId, activeSessionId);
    } else {
      const [created] = await db
        .insert(chatSessions)
        .values({
          userId,
          title: question.slice(0, 80),
          knowledgeBaseIds: permitted,
        })
        .returning();
      activeSessionId = created.id;
    }

    await db.insert(chatMessages).values({
      sessionId: activeSessionId,
      role: "user",
      content: question,
    });

    const context = buildContextBlock(retrieved);
    const systemPrompt = buildSystemPrompt(context, retrieved.length === 0);

    const { model, modelId, hasKey } = getModel();

    if (!hasKey || process.env.MOCK_CHAT === "true") {
      const answer = mockAnswer(question, citations);
      await persistAssistant({
        sessionId: activeSessionId,
        userId,
        question,
        answer,
        permitted,
        citations,
        modelId: "mock-local",
        started,
      });

      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          const id = crypto.randomUUID();
          writer.write({ type: "start", messageId: id });
          writer.write({ type: "text-start", id: "t1" });
          writer.write({ type: "text-delta", id: "t1", delta: answer });
          writer.write({ type: "text-end", id: "t1" });
          writer.write({
            type: "data-citations",
            data: { citations, sessionId: activeSessionId },
          });
          writer.write({ type: "finish" });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      temperature: 0.2,
      onFinish: async ({ text }) => {
        await persistAssistant({
          sessionId: activeSessionId!,
          userId,
          question,
          answer: text,
          permitted,
          citations,
          modelId,
          started,
        });
      },
    });

    return result.toUIMessageStreamResponse({
      messageMetadata: () => ({
        citations,
        sessionId: activeSessionId,
      }),
      headers: {
        "X-Session-Id": activeSessionId!,
        "X-Citation-Count": String(citations.length),
      },
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[chat]", err);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}

async function requireOwnedChatSession(userId: string, sessionId: string) {
  const [row] = await db
    .select({ id: chatSessions.id, userId: chatSessions.userId })
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .limit(1);
  if (!row || row.userId !== userId) {
    throw new AccessError("Chat session not found", 404);
  }
  return row;
}

function extractText(message?: UIMessage): string {
  if (!message) return "";
  const legacy = message as unknown as { content?: unknown };
  if (typeof legacy.content === "string") {
    return legacy.content;
  }
  const parts = message.parts ?? [];
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function buildSystemPrompt(context: string, empty: boolean): string {
  if (empty) {
    return `You are an internal enterprise knowledge assistant.\nNo relevant documents were retrieved for this question.\nClearly tell the user you could not find supporting material in the selected knowledge bases,\nand suggest refining the question or uploading documents. Do not invent company policies.`;
  }

  return `You are an internal enterprise knowledge assistant (企业知识库助手).\nAnswer ONLY using the retrieved context below. Cite sources inline like [1], [2] matching the context numbering.\nIf the context is insufficient, say so clearly in Chinese or English matching the user's language.\nDo not invent policies, numbers, or procedures that are not in the context.\n\nRetrieved context:\n${context}`;
}

function mockAnswer(question: string, citations: CitationPayload[]): string {
  if (citations.length === 0) {
    return (
      "I could not find relevant material in the selected knowledge bases for this question.\n" +
      "未在所选知识库中找到相关内容。请尝试换个问法，或确认文档已处理完成（status=ready）。\n\n" +
      `Question / 问题: ${question}`
    );
  }

  const lines = citations.map(
    (c, i) =>
      `[${i + 1}] ${c.documentTitle}${c.pageNumber != null ? ` (p.${c.pageNumber})` : ""}: ${c.snippet}`,
  );

  return (
    `Based on the retrieved knowledge base excerpts (本地 Mock 模式，未配置 OPENAI_API_KEY):\n\n` +
    lines.join("\n\n") +
    `\n\n请配置 OPENAI_API_KEY 或 AI Gateway 以获得完整流式 LLM 回答。`
  );
}

async function persistAssistant(opts: {
  sessionId: string;
  userId: string;
  question: string;
  answer: string;
  permitted: string[];
  citations: CitationPayload[];
  modelId: string;
  started: number;
}) {
  await db.insert(chatMessages).values({
    sessionId: opts.sessionId,
    role: "assistant",
    content: opts.answer,
    citations: opts.citations,
  });

  await db.insert(qaLogs).values({
    userId: opts.userId,
    sessionId: opts.sessionId,
    question: opts.question,
    answer: opts.answer,
    knowledgeBaseIds: opts.permitted,
    retrievedChunkIds: opts.citations.map((c) => c.chunkId),
    retrievalScores: opts.citations.map((c) => ({
      chunkId: c.chunkId,
      score: c.score ?? 0,
    })),
    latencyMs: Date.now() - opts.started,
    model: opts.modelId,
  });
}
