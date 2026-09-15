import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/** pgvector column — float[] in app code */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    return `vector(${(config as { dimensions?: number })?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value !== "string") return value as unknown as number[];
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((v) => Number(v.trim()));
  },
});

/** Postgres tsvector — maintained via raw SQL / trigger */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const memberRoleEnum = pgEnum("member_role", ["read", "manage"]);
export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "queued",
  "processing",
  "ready",
  "failed",
]);

/* -------------------------------------------------------------------------- */
/* Auth.js tables                                                             */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* -------------------------------------------------------------------------- */
/* Knowledge bases & ACL                                                      */
/* -------------------------------------------------------------------------- */

export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const kbMembers = pgTable(
  "kb_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("read"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("kb_members_kb_user_idx").on(t.knowledgeBaseId, t.userId),
    index("kb_members_user_idx").on(t.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Documents & chunks                                                         */
/* -------------------------------------------------------------------------- */

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    filename: varchar("filename", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    fileSize: integer("file_size").notNull().default(0),
    storagePath: text("storage_path").notNull(),
    status: documentStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count").default(0),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { mode: "date" }),
  },
  (t) => [
    index("documents_kb_idx").on(t.knowledgeBaseId),
    index("documents_status_idx").on(t.status),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    pageNumber: integer("page_number"),
    headingPath: text("heading_path"),
    embedding: vector("embedding", { dimensions: 1536 }),
    tsv: tsvector("tsv"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("chunks_document_idx").on(t.documentId),
    index("chunks_kb_idx").on(t.knowledgeBaseId),
  ],
);

/* -------------------------------------------------------------------------- */
/* SearchKnowledge API keys                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Service API keys for `/api/search-knowledge`.
 * Plaintext is shown once on create/rotate; only `keyHash` is stored.
 * Hash: SHA-256(pepper || plaintext) — see `src/lib/api-keys/crypto.ts`.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rateLimitPerMin: integer("rate_limit_per_min"),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_idx").on(t.keyHash),
    index("api_keys_created_by_idx").on(t.createdBy),
  ],
);

export const apiKeyKnowledgeBases = pgTable(
  "api_key_knowledge_bases",
  {
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.apiKeyId, t.knowledgeBaseId] }),
    index("api_key_kbs_kb_idx").on(t.knowledgeBaseId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Chat & observability                                                       */
/* -------------------------------------------------------------------------- */

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 300 }),
  knowledgeBaseIds: jsonb("knowledge_base_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<CitationPayload[]>().default([]),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId)],
);

export const qaLogs = pgTable(
  "qa_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sessionId: uuid("session_id").references(() => chatSessions.id, {
      onDelete: "set null",
    }),
    question: text("question").notNull(),
    answer: text("answer"),
    knowledgeBaseIds: jsonb("knowledge_base_ids").$type<string[]>().default([]),
    retrievedChunkIds: jsonb("retrieved_chunk_ids")
      .$type<string[]>()
      .default([]),
    retrievalScores: jsonb("retrieval_scores")
      .$type<
        { chunkId: string; score: number; vector?: number; keyword?: number }[]
      >()
      .default([]),
    latencyMs: integer("latency_ms"),
    model: varchar("model", { length: 120 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("qa_logs_user_idx").on(t.userId)],
);

export type CitationPayload = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  snippet: string;
  pageNumber?: number | null;
  score?: number;
  headingPath?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  ownedKnowledgeBases: many(knowledgeBases),
  memberships: many(kbMembers),
  chatSessions: many(chatSessions),
  apiKeys: many(apiKeys),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
  knowledgeBases: many(apiKeyKnowledgeBases),
}));

export const apiKeyKnowledgeBasesRelations = relations(
  apiKeyKnowledgeBases,
  ({ one }) => ({
    apiKey: one(apiKeys, {
      fields: [apiKeyKnowledgeBases.apiKeyId],
      references: [apiKeys.id],
    }),
    knowledgeBase: one(knowledgeBases, {
      fields: [apiKeyKnowledgeBases.knowledgeBaseId],
      references: [knowledgeBases.id],
    }),
  }),
);

export const knowledgeBasesRelations = relations(
  knowledgeBases,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [knowledgeBases.ownerId],
      references: [users.id],
    }),
    members: many(kbMembers),
    documents: many(documents),
    chunks: many(chunks),
    apiKeys: many(apiKeyKnowledgeBases),
  }),
);

export const kbMembersRelations = relations(kbMembers, ({ one }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [kbMembers.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  user: one(users, {
    fields: [kbMembers.userId],
    references: [users.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [documents.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  document: one(documents, {
    fields: [chunks.documentId],
    references: [documents.id],
  }),
  knowledgeBase: one(knowledgeBases, {
    fields: [chunks.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
}));

export const chatSessionsRelations = relations(
  chatSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [chatSessions.userId],
      references: [users.id],
    }),
    messages: many(chatMessages),
  }),
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));
