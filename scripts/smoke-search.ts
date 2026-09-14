import { config } from "dotenv";
import path from "path";
config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const { hybridRetrieve, extractKeywordTerms } = await import(
    "../src/lib/rag/retrieve"
  );
  const { tokenizeForMockEmbed, mockEmbed } = await import(
    "../src/lib/rag/embed"
  );

  const kb = "7e96e392-b9b3-4b01-b32f-cc13abe48fbd";

  for (const q of ["审后改销售明细", "采购入库草稿能否改", "售后怎么查"]) {
    console.log("\n========", q, "========");
    console.log("terms", extractKeywordTerms(q));
    console.log(
      "mock tokens",
      tokenizeForMockEmbed(q).slice(0, 16),
      "nonzero",
      mockEmbed(q).filter((x) => x !== 0).length,
    );
    const rows = await hybridRetrieve({
      query: q,
      permittedKbIds: [kb],
      topK: 5,
    });
    console.log("item_count", rows.length);
    for (const r of rows) {
      console.log({
        score: Math.round(r.hybridScore * 10000) / 10000,
        v: r.vectorScore != null ? Math.round(r.vectorScore * 1000) / 1000 : null,
        k: r.keywordScore,
        title: r.documentTitle,
        sourcePath: r.sourcePath,
        snippet: (r.snippet || "").slice(0, 160),
      });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
