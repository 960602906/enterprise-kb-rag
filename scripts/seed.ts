import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { defaultSearchKnowledgeBaseName } from "../src/lib/rag/chunk-config";
import {
  kbMembers,
  knowledgeBases,
  users,
} from "../src/lib/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123456";
  const memberEmail = process.env.SEED_MEMBER_EMAIL ?? "member@example.com";
  const memberPassword = process.env.SEED_MEMBER_PASSWORD ?? "member123456";

  const passwordHash = await bcrypt.hash(password, 10);
  const memberHash = await bcrypt.hash(memberPassword, 10);

  let [admin] = await db.select().from(users).where(eq(users.email, email));
  if (!admin) {
    [admin] = await db
      .insert(users)
      .values({ email, name: "Admin User", passwordHash })
      .returning();
    console.log(`Created admin: ${email} / ${password}`);
  } else {
    await db
      .update(users)
      .set({ passwordHash, name: admin.name ?? "Admin User" })
      .where(eq(users.id, admin.id));
    console.log(`Updated admin password: ${email}`);
  }

  let [member] = await db
    .select()
    .from(users)
    .where(eq(users.email, memberEmail));
  if (!member) {
    [member] = await db
      .insert(users)
      .values({
        email: memberEmail,
        name: "Read-only Member",
        passwordHash: memberHash,
      })
      .returning();
    console.log(`Created member: ${memberEmail} / ${memberPassword}`);
  }

  let [kb] = await db
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.name, "Employee Handbook"));

  if (!kb) {
    [kb] = await db
      .insert(knowledgeBases)
      .values({
        name: "Employee Handbook",
        description:
          "Sample internal handbook for MVP demos (休假政策 / PTO policies).",
        ownerId: admin.id,
      })
      .returning();

    await db.insert(kbMembers).values([
      { knowledgeBaseId: kb.id, userId: admin.id, role: "manage" },
      { knowledgeBaseId: kb.id, userId: member.id, role: "read" },
    ]);
    console.log(`Created knowledge base: ${kb.name}`);
  }

  const internalName = defaultSearchKnowledgeBaseName();
  let [internalKb] = await db
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.name, internalName));

  if (!internalKb) {
    [internalKb] = await db
      .insert(knowledgeBases)
      .values({
        name: internalName,
        description:
          "Default knowledge base for the service SearchKnowledge API when no KB ids are passed.",
        ownerId: admin.id,
      })
      .returning();

    await db.insert(kbMembers).values([
      { knowledgeBaseId: internalKb.id, userId: admin.id, role: "manage" },
      { knowledgeBaseId: internalKb.id, userId: member.id, role: "read" },
    ]);
    console.log(`Created knowledge base: ${internalKb.name}`);
  }

  console.log("\nSeed complete. Sign in with:");
  console.log(`  Admin:  ${email} / ${password}`);
  console.log(`  Member: ${memberEmail} / ${memberPassword}`);
  console.log(
    "\nNext: upload a Markdown/PDF to the KB and click Process, then Chat.",
  );

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
