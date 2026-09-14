/**
 * Lightweight retrieval regression harness.
 *   pnpm eval:retrieval
 *   EVAL_QUERIES_PATH=config/examples/skyroc-eval-queries.json pnpm eval:retrieval
 */
import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";

type EvalCase = { id: string; query: string; expectAny: string[] };
type EvalFile = {
  knowledgeBaseName?: string;
  knowledgeBaseId?: string;
  cases: EvalCase[];
};

async function main() {
  const { db } = await import("../src/lib/db");
  const { knowledgeBases } = await import("../src/lib/db/schema");
  const { hybridRetrieve } = await import("../src/lib/rag/retrieve");

  const filePath =
    process.env.EVAL_QUERIES_PATH?.trim() ||
    path.join(process.cwd(), "config/eval-queries.json");
  const spec = JSON.parse(readFileSync(filePath, "utf8")) as EvalFile;
  if (!spec.cases?.length) throw new Error(`No cases in ${filePath}`);

  let kbId = spec.knowledgeBaseId;
  if (!kbId && spec.knowledgeBaseName) {
    const [kb] = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.name, spec.knowledgeBaseName))
      .limit(1);
    kbId = kb?.id;
  }
  if (!kbId) {
    throw new Error(
      `Knowledge base not found (name=${spec.knowledgeBaseName ?? "?"})`,
    );
  }

  let failed = 0;
  for (const testCase of spec.cases) {
    const hits = await hybridRetrieve({
      query: testCase.query,
      permittedKbIds: [kbId],
      topK: 8,
    });
    const blob = hits
      .map((h) => `${h.documentTitle}\n${h.content}`)
      .join("\n")
      .toLowerCase();
    const ok = testCase.expectAny.some((needle) =>
      blob.includes(needle.toLowerCase()),
    );
    const preview = hits
      .slice(0, 3)
      .map((h) => `${h.documentTitle} (${h.score?.toFixed(3)})`)
      .join(" | ");
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${testCase.id}  hits=${hits.length}  ${preview}`,
    );
    if (!ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`\n${failed}/${spec.cases.length} cases failed`);
    process.exit(1);
  }
  console.log(`\n${spec.cases.length}/${spec.cases.length} cases passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
