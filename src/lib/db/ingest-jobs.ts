import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { documents } from "./schema";

export const ingestJobStatusEnum = pgEnum("ingest_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const ingestJobs = pgTable(
  "ingest_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: ingestJobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    availableAt: timestamp("available_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { mode: "date" }),
    lockedBy: varchar("locked_by", { length: 120 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("ingest_jobs_document_idx").on(t.documentId),
    index("ingest_jobs_status_idx").on(t.status, t.availableAt),
  ],
);
