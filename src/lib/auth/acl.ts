import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { kbMembers, knowledgeBases } from "@/lib/db/schema";

export type KbAccessRole = "read" | "manage";

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AccessError";
    this.status = status;
  }
}

/** KB ids the user may access (owner or member). Use before retrieval. */
export async function getAccessibleKnowledgeBaseIds(
  userId: string,
): Promise<string[]> {
  const owned = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(eq(knowledgeBases.ownerId, userId));

  const memberOf = await db
    .select({ id: kbMembers.knowledgeBaseId })
    .from(kbMembers)
    .where(eq(kbMembers.userId, userId));

  return [
    ...new Set([
      ...owned.map((r) => r.id),
      ...memberOf.map((r) => r.id),
    ]),
  ];
}

export async function getKbRole(
  userId: string,
  knowledgeBaseId: string,
): Promise<KbAccessRole | null> {
  const [kb] = await db
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.id, knowledgeBaseId))
    .limit(1);
  if (!kb) return null;
  if (kb.ownerId === userId) return "manage";

  const [membership] = await db
    .select()
    .from(kbMembers)
    .where(
      and(
        eq(kbMembers.knowledgeBaseId, knowledgeBaseId),
        eq(kbMembers.userId, userId),
      ),
    )
    .limit(1);

  return membership?.role ?? null;
}

export async function requireKbAccess(
  userId: string,
  knowledgeBaseId: string,
  minRole: KbAccessRole = "read",
): Promise<KbAccessRole> {
  const role = await getKbRole(userId, knowledgeBaseId);
  if (!role) {
    throw new AccessError("Knowledge base not found or access denied", 404);
  }
  if (minRole === "manage" && role !== "manage") {
    throw new AccessError("Manage permission required");
  }
  return role;
}

/** Intersect requested KB ids with the user's permitted set. */
export async function filterPermittedKbIds(
  userId: string,
  requestedIds: string[],
): Promise<string[]> {
  if (requestedIds.length === 0) return [];
  const accessible = await getAccessibleKnowledgeBaseIds(userId);
  const allowed = new Set(accessible);
  return requestedIds.filter((id) => allowed.has(id));
}

export async function listKnowledgeBasesForUser(userId: string) {
  return db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
      ownerId: knowledgeBases.ownerId,
      createdAt: knowledgeBases.createdAt,
      updatedAt: knowledgeBases.updatedAt,
      role: sql<string>`case
        when ${knowledgeBases.ownerId} = ${userId} then 'manage'
        else coalesce(${kbMembers.role}::text, 'read')
      end`,
    })
    .from(knowledgeBases)
    .leftJoin(
      kbMembers,
      and(
        eq(kbMembers.knowledgeBaseId, knowledgeBases.id),
        eq(kbMembers.userId, userId),
      ),
    )
    .where(
      or(eq(knowledgeBases.ownerId, userId), eq(kbMembers.userId, userId)),
    )
    .orderBy(knowledgeBases.updatedAt);
}

export async function requireUserId(
  session: { user?: { id?: string } } | null,
): Promise<string> {
  const id = session?.user?.id;
  if (!id) throw new AccessError("Unauthorized", 401);
  return id;
}
