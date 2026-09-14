import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { RetrievedChunk } from "./retrieve";

/** Drop retrieved rows whose chunk is no longer in a permitted KB. */
export async function assertChunksPermitted(
  retrieved: RetrievedChunk[],
  permittedKbIds: string[],
): Promise<RetrievedChunk[]> {
  if (retrieved.length === 0 || permittedKbIds.length === 0) return [];
  const ids = retrieved.map((r) => r.chunkId);
  const idLiteral = `{${ids.join(",")}}`;
  const kbLiteral = `{${permittedKbIds.join(",")}}`;
  const rows = await db.execute<{ id: string }>(sql`
    SELECT c.id
    FROM chunks c
    WHERE c.id = ANY(${idLiteral}::uuid[])
      AND c.knowledge_base_id = ANY(${kbLiteral}::uuid[])
  `);
  const allowed = new Set(rows.map((r) => r.id));
  return retrieved.filter((r) => allowed.has(r.chunkId));
}
