/**
 * Fast retrieval unit checks (no Postgres).
 *   pnpm eval:unit
 */
import {
  extractKeywordTerms,
  isCjkHeavyQuery,
  reciprocalRankScore,
} from "../src/lib/rag/retrieve";

let failed = 0;

function check(id: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed += 1;
}

check("cjk-heavy-zh", isCjkHeavyQuery("病假有几天？") === true);
check("cjk-heavy-en", isCjkHeavyQuery("How many PTO days?") === false);
check("cjk-mixed-prefers-cjk", isCjkHeavyQuery("PTO 年假几天") === true);

const zhTerms = extractKeywordTerms("病假有几天？");
check(
  "zh-keeps-sick-leave",
  zhTerms.includes("病假"),
  `terms=${zhTerms.join(",")}`,
);
check(
  "zh-drops-stopword",
  !zhTerms.includes("有") && !zhTerms.includes("几天有"),
);

const enTerms = extractKeywordTerms("How many PTO days?");
check("en-keeps-pto", enTerms.includes("pto"), `terms=${enTerms.join(",")}`);

const rrf1 = reciprocalRankScore(1, 60, 0.65);
const rrf2 = reciprocalRankScore(2, 60, 0.65);
check("rrf-rank1-gt-rank2", rrf1 > rrf2, `${rrf1.toFixed(4)} > ${rrf2.toFixed(4)}`);
check("rrf-formula", Math.abs(rrf1 - 0.65 / 61) < 1e-12);

if (failed > 0) {
  console.error(`\n${failed} unit checks failed`);
  process.exit(1);
}
console.log("\nunit checks passed");
