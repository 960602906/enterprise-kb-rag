import "@/lib/env-sanitize";
import { createHash } from "crypto";
import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export const EMBEDDING_DIMENSIONS = 1536;

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
  const baseURL =
    process.env.OPENAI_BASE_URL ||
    process.env.AI_GATEWAY_BASE_URL ||
    undefined;
  return createOpenAI({
    apiKey: apiKey ?? "missing-key",
    baseURL,
  });
}

function useMockEmbeddings(): boolean {
  if (process.env.MOCK_EMBEDDINGS === "true") return true;
  if (process.env.MOCK_EMBEDDINGS === "false") return false;
  return !(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY);
}

/** Deterministic pseudo-embedding for local/dev without API keys. */
export function mockEmbed(text: string): number[] {
  const vec = new Array(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const token of tokens) {
    const h = createHash("sha256").update(token).digest();
    for (let i = 0; i < 16; i++) {
      const dim = (h[i] + h[i + 16] * 256) % EMBEDDING_DIMENSIONS;
      vec[dim] += ((h[i] % 13) - 6) / 6;
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function embedText(text: string): Promise<number[]> {
  if (useMockEmbeddings()) return mockEmbed(text);
  const openai = getOpenAI();
  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const { embedding } = await embed({
    model: openai.embedding(model),
    value: text.slice(0, 8000),
  });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (useMockEmbeddings()) return texts.map(mockEmbed);

  const openai = getOpenAI();
  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
    const { embeddings } = await embedMany({
      model: openai.embedding(model),
      values: batch,
    });
    out.push(...embeddings);
  }
  return out;
}
