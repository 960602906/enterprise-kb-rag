import { eq, inArray } from "drizzle-orm";
import {
  AccessError,
  getKbRole,
  listKnowledgeBasesForUser,
} from "@/lib/auth/acl";
import { db } from "@/lib/db";
import {
  apiKeyKnowledgeBases,
  apiKeys,
  knowledgeBases,
} from "@/lib/db/schema";
import {
  apiKeyDisplayPrefix,
  generateApiKeyPlaintext,
  hashApiKey,
} from "./crypto";

export type ApiKeyListItem = {
  id: string;
  name: string;
  keyPrefix: string;
  enabled: boolean;
  rateLimitPerMin: number | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  knowledgeBases: { id: string; name: string }[];
};

export type ApiKeyCreated = ApiKeyListItem & {
  /** Plaintext secret — returned only on create/rotate. */
  secret: string;
};

export type SearchApiKeyAuth =
  | {
      kind: "db";
      apiKeyId: string;
      knowledgeBaseIds: string[];
      rateLimitPerMin: number | null;
    }
  | { kind: "legacy" }
  | { kind: "dev-localhost" };

/** Look up an enabled DB API key by plaintext. Updates last_used_at on hit. */
export async function findEnabledApiKeyBySecret(
  plaintext: string,
): Promise<SearchApiKeyAuth | null> {
  if (!plaintext) return null;
  const keyHash = hashApiKey(plaintext);
  const [row] = await db
    .select({
      id: apiKeys.id,
      enabled: apiKeys.enabled,
      rateLimitPerMin: apiKeys.rateLimitPerMin,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!row || !row.enabled) return null;

  const bindings = await db
    .select({ knowledgeBaseId: apiKeyKnowledgeBases.knowledgeBaseId })
    .from(apiKeyKnowledgeBases)
    .where(eq(apiKeyKnowledgeBases.apiKeyId, row.id));

  // Fire-and-forget last-used stamp; failures must not block auth.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch((err) => {
      console.warn("[api-keys] failed to update last_used_at", err);
    });

  return {
    kind: "db",
    apiKeyId: row.id,
    knowledgeBaseIds: bindings.map((b) => b.knowledgeBaseId),
    rateLimitPerMin: row.rateLimitPerMin,
  };
}

export async function requireManageableKbIds(
  userId: string,
  knowledgeBaseIds: string[],
): Promise<void> {
  const unique = [...new Set(knowledgeBaseIds)];
  if (unique.length === 0) {
    throw new AccessError("At least one knowledge base is required", 400);
  }
  for (const kbId of unique) {
    const role = await getKbRole(userId, kbId);
    if (role !== "manage") {
      throw new AccessError(
        "Manage permission required for all bound knowledge bases",
        403,
      );
    }
  }
}

/** KBs the user may bind to an API key. */
export async function listManageableKnowledgeBases(userId: string) {
  const all = await listKnowledgeBasesForUser(userId);
  return all.filter((kb) => kb.role === "manage");
}

async function loadKeyKnowledgeBases(
  apiKeyId: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
    })
    .from(apiKeyKnowledgeBases)
    .innerJoin(
      knowledgeBases,
      eq(apiKeyKnowledgeBases.knowledgeBaseId, knowledgeBases.id),
    )
    .where(eq(apiKeyKnowledgeBases.apiKeyId, apiKeyId));
}

function toListItem(
  row: typeof apiKeys.$inferSelect,
  kbs: { id: string; name: string }[],
): ApiKeyListItem {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    enabled: row.enabled,
    rateLimitPerMin: row.rateLimitPerMin,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    knowledgeBases: kbs,
  };
}

/**
 * List keys the user can see: created by them, or bound to a KB they manage.
 */
export async function listApiKeysForUser(
  userId: string,
): Promise<ApiKeyListItem[]> {
  const manageable = await listManageableKnowledgeBases(userId);
  const manageableIds = manageable.map((k) => k.id);

  const created = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.createdBy, userId));

  let viaKb: (typeof apiKeys.$inferSelect)[] = [];
  if (manageableIds.length > 0) {
    const linked = await db
      .select({ apiKeyId: apiKeyKnowledgeBases.apiKeyId })
      .from(apiKeyKnowledgeBases)
      .where(inArray(apiKeyKnowledgeBases.knowledgeBaseId, manageableIds));
    const linkedIds = [...new Set(linked.map((r) => r.apiKeyId))];
    if (linkedIds.length > 0) {
      viaKb = await db
        .select()
        .from(apiKeys)
        .where(inArray(apiKeys.id, linkedIds));
    }
  }

  const byId = new Map<string, typeof apiKeys.$inferSelect>();
  for (const row of [...created, ...viaKb]) byId.set(row.id, row);

  const items: ApiKeyListItem[] = [];
  for (const row of byId.values()) {
    const kbs = await loadKeyKnowledgeBases(row.id);
    // Hide keys whose bound KBs the user cannot manage (except own creations).
    const canSee =
      row.createdBy === userId ||
      kbs.some((kb) => manageableIds.includes(kb.id));
    if (!canSee) continue;
    items.push(toListItem(row, kbs));
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items;
}

async function assertCanAdminKey(
  userId: string,
  apiKeyId: string,
): Promise<typeof apiKeys.$inferSelect> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, apiKeyId))
    .limit(1);
  if (!row) throw new AccessError("API key not found", 404);

  const kbs = await loadKeyKnowledgeBases(apiKeyId);
  if (row.createdBy === userId) return row;

  if (kbs.length === 0) {
    throw new AccessError("API key not found or access denied", 404);
  }
  for (const kb of kbs) {
    const role = await getKbRole(userId, kb.id);
    if (role !== "manage") {
      throw new AccessError("Manage permission required", 403);
    }
  }
  return row;
}

export async function createApiKey(input: {
  userId: string;
  name: string;
  knowledgeBaseIds: string[];
  rateLimitPerMin?: number | null;
}): Promise<ApiKeyCreated> {
  await requireManageableKbIds(input.userId, input.knowledgeBaseIds);

  const secret = generateApiKeyPlaintext();
  const keyHash = hashApiKey(secret);
  const keyPrefix = apiKeyDisplayPrefix(secret);
  const uniqueKbIds = [...new Set(input.knowledgeBaseIds)];

  const [row] = await db
    .insert(apiKeys)
    .values({
      name: input.name,
      keyHash,
      keyPrefix,
      enabled: true,
      createdBy: input.userId,
      rateLimitPerMin: input.rateLimitPerMin ?? null,
    })
    .returning();

  await db.insert(apiKeyKnowledgeBases).values(
    uniqueKbIds.map((knowledgeBaseId) => ({
      apiKeyId: row.id,
      knowledgeBaseId,
    })),
  );

  const kbs = await loadKeyKnowledgeBases(row.id);
  return { ...toListItem(row, kbs), secret };
}

export async function updateApiKey(input: {
  userId: string;
  apiKeyId: string;
  name?: string;
  enabled?: boolean;
  knowledgeBaseIds?: string[];
  rateLimitPerMin?: number | null;
}): Promise<ApiKeyListItem> {
  await assertCanAdminKey(input.userId, input.apiKeyId);

  if (input.knowledgeBaseIds) {
    await requireManageableKbIds(input.userId, input.knowledgeBaseIds);
  }

  const patch: Partial<typeof apiKeys.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.rateLimitPerMin !== undefined) {
    patch.rateLimitPerMin = input.rateLimitPerMin;
  }

  const [row] = await db
    .update(apiKeys)
    .set(patch)
    .where(eq(apiKeys.id, input.apiKeyId))
    .returning();

  if (input.knowledgeBaseIds) {
    const uniqueKbIds = [...new Set(input.knowledgeBaseIds)];
    await db
      .delete(apiKeyKnowledgeBases)
      .where(eq(apiKeyKnowledgeBases.apiKeyId, input.apiKeyId));
    await db.insert(apiKeyKnowledgeBases).values(
      uniqueKbIds.map((knowledgeBaseId) => ({
        apiKeyId: input.apiKeyId,
        knowledgeBaseId,
      })),
    );
  }

  const kbs = await loadKeyKnowledgeBases(input.apiKeyId);
  return toListItem(row, kbs);
}

export async function deleteApiKey(
  userId: string,
  apiKeyId: string,
): Promise<void> {
  await assertCanAdminKey(userId, apiKeyId);
  await db.delete(apiKeys).where(eq(apiKeys.id, apiKeyId));
}

export async function rotateApiKey(
  userId: string,
  apiKeyId: string,
): Promise<ApiKeyCreated> {
  await assertCanAdminKey(userId, apiKeyId);

  const secret = generateApiKeyPlaintext();
  const keyHash = hashApiKey(secret);
  const keyPrefix = apiKeyDisplayPrefix(secret);

  const [row] = await db
    .update(apiKeys)
    .set({
      keyHash,
      keyPrefix,
      updatedAt: new Date(),
    })
    .where(eq(apiKeys.id, apiKeyId))
    .returning();

  const kbs = await loadKeyKnowledgeBases(apiKeyId);
  return { ...toListItem(row, kbs), secret };
}
