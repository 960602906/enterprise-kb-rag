import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[db] DATABASE_URL is not set. Database calls will fail until configured.",
  );
}

/**
 * Use a single connection in serverless (Vercel) via prepare:false for
 * Neon/Supabase transaction poolers. Local docker uses the same client.
 */
const client = postgres(connectionString ?? "postgres://localhost:5432/kb_rag", {
  prepare: false,
  max: process.env.NODE_ENV === "production" ? 1 : 10,
});

export const db = drizzle(client, { schema });
export type Database = typeof db;
export { schema };

/** Close the postgres-js pool so tsx/node scripts can exit. */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
