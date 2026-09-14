import { SKYROC_CHUNK } from "./chunk-config";

export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? [])
    .join("").length;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.5 + rest / 4);
}

export type TextChunk = {
  content: string;
  headingPath?: string;
  pageNumber?: number;
  tokenCount: number;
};

type Segment = {
  content: string;
  headingPath: string;
  pageNumber?: number;
};

/** Heading-aware chunking into ~400–800 token windows with overlap. */
export function chunkText(
  raw: string,
  options?: {
    minTokens?: number;
    maxTokens?: number;
    overlapTokens?: number;
    /** Split on 步骤 / Step N / numbered steps (business-flows). */
    preferStepBoundaries?: boolean;
  },
): TextChunk[] {
  const minTokens = options?.minTokens ?? SKYROC_CHUNK.minTokens;
  const maxTokens = options?.maxTokens ?? SKYROC_CHUNK.maxTokens;
  const overlapTokens = options?.overlapTokens ?? SKYROC_CHUNK.overlapTokens;

  const segments = splitIntoSegments(raw, {
    preferStepBoundaries: options?.preferStepBoundaries ?? false,
  });
  const chunks: TextChunk[] = [];

  let buffer = "";
  let headingPath = segments[0]?.headingPath ?? "";
  let pageNumber = segments[0]?.pageNumber;

  const flush = (force = false) => {
    if (!buffer.trim()) return;
    const tokens = estimateTokens(buffer);
    if (!force && tokens < minTokens) return;

    if (tokens > maxTokens) {
      for (const part of hardSplit(buffer, maxTokens, overlapTokens)) {
        chunks.push({
          content: part.trim(),
          headingPath: headingPath || undefined,
          pageNumber,
          tokenCount: estimateTokens(part),
        });
      }
    } else {
      chunks.push({
        content: buffer.trim(),
        headingPath: headingPath || undefined,
        pageNumber,
        tokenCount: tokens,
      });
    }
    buffer = takeOverlap(buffer, overlapTokens);
  };

  for (const seg of segments) {
    if (seg.headingPath !== headingPath && estimateTokens(buffer) >= minTokens) {
      flush(true);
      headingPath = seg.headingPath;
      pageNumber = seg.pageNumber;
    } else {
      headingPath = seg.headingPath || headingPath;
      pageNumber = seg.pageNumber ?? pageNumber;
    }

    const addition = (buffer ? "\n\n" : "") + seg.content;
    if (estimateTokens(buffer + addition) > maxTokens && buffer) {
      flush(true);
      headingPath = seg.headingPath;
      pageNumber = seg.pageNumber;
      buffer = seg.content;
    } else {
      buffer += addition;
    }

    if (estimateTokens(buffer) >= maxTokens) flush(true);
  }

  flush(true);
  return chunks.filter((c) => c.content.length > 0);
}

function splitIntoSegments(
  raw: string,
  options?: { preferStepBoundaries?: boolean },
): Segment[] {
  const withPages = raw.replace(/\f/g, "\n\n--- Page Break ---\n\n");
  const parts = withPages.split(/\n(?=#{1,6}\s)/);
  const segments: Segment[] = [];
  let headingStack: string[] = [];
  let pageNumber: number | undefined = 1;
  let sawPage = false;

  for (const part of parts) {
    let content = part.trim();
    if (!content) continue;

    const pageMatch = content.match(/---\s*Page(?:\s*Break|\s+(\d+))\s*---/i);
    if (pageMatch) {
      sawPage = true;
      if (pageMatch[1]) pageNumber = Number(pageMatch[1]);
      else if (pageNumber) pageNumber += 1;
      content = content
        .replace(/---\s*Page(?:\s*Break|\s+\d+)\s*---/gi, "")
        .trim();
      if (!content) continue;
    }

    const headingMatch = content.match(/^(#{1,6})\s+(.+?)(?:\n|$)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      headingStack = headingStack.slice(0, level - 1);
      headingStack[level - 1] = title;
      content = content.replace(/^#{1,6}\s+.+?(?:\n|$)/, "").trim();
    }

    if (!content) continue;

    const pieces = options?.preferStepBoundaries
      ? splitStepPieces(content)
      : [content];
    const headingPath = headingStack.filter(Boolean).join(" > ");
    for (const piece of pieces) {
      if (!piece.trim()) continue;
      segments.push({
        content: piece.trim(),
        headingPath,
        pageNumber: sawPage ? pageNumber : undefined,
      });
    }
  }

  if (segments.length === 0 && raw.trim()) {
    segments.push({ content: raw.trim(), headingPath: "" });
  }
  return segments;
}

/** Split business-flow markdown on 步骤 / Step N / numbered steps. */
function splitStepPieces(content: string): string[] {
  return content
    .split(
      /\n(?=(?:#{1,6}\s+)?(?:步骤|Step)\s*[:：.]?\s*\d+|(?:\d{1,3}[\.、]|[（(]\d+[）)])\s+\S)/,
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

function hardSplit(
  text: string,
  maxTokens: number,
  overlapTokens: number,
): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (estimateTokens(remaining) > maxTokens) {
    const targetChars = maxTokens * 4;
    let cut = remaining.lastIndexOf("\n", targetChars);
    if (cut < targetChars * 0.4) cut = remaining.lastIndexOf(" ", targetChars);
    if (cut < targetChars * 0.4) cut = targetChars;
    parts.push(remaining.slice(0, cut));
    remaining =
      takeOverlap(remaining.slice(0, cut), overlapTokens) +
      remaining.slice(cut);
    if (parts.length > 200) break;
  }
  if (remaining.trim()) parts.push(remaining);
  return parts;
}

function takeOverlap(text: string, overlapTokens: number): string {
  const chars = Math.max(0, overlapTokens * 4);
  if (text.length <= chars) return text;
  const slice = text.slice(-chars);
  const start = slice.indexOf(" ");
  return start > 0 ? slice.slice(start + 1) : slice;
}
