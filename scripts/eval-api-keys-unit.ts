/**
 * API key crypto + multi-tenant scope unit checks (no Postgres).
 *   pnpm eval:api-keys
 */
import {
  apiKeyDisplayPrefix,
  apiKeyHashesEqual,
  generateApiKeyPlaintext,
  hashApiKey,
} from "../src/lib/api-keys/crypto";
import {
  allowAllKnowledgeBases,
  evaluateDbKeyScope,
} from "../src/lib/rag/search-scope-pure";

let failed = 0;

function check(id: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed += 1;
}

process.env.API_KEY_PEPPER = "unit-test-pepper";

const a = generateApiKeyPlaintext();
const b = generateApiKeyPlaintext();
check("generate-unique", a !== b);
check("generate-prefix", a.startsWith("atk_") && a.length > 20);

const ha = hashApiKey(a);
const hb = hashApiKey(b);
check("hash-stable", hashApiKey(a) === ha);
check("hash-differs", ha !== hb);
check("hash-hex-64", /^[a-f0-9]{64}$/.test(ha));
check("hash-equal", apiKeyHashesEqual(ha, hashApiKey(a)));
check("hash-not-equal", !apiKeyHashesEqual(ha, hb));

const prefix = apiKeyDisplayPrefix(a);
check(
  "display-prefix",
  prefix.startsWith("atk_") && prefix.length === "atk_".length + 8,
  prefix,
);
check("display-not-full", prefix !== a && !a.endsWith(prefix.slice(4)));

const kbA = "11111111-1111-1111-1111-111111111111";
const kbB = "22222222-2222-2222-2222-222222222222";
const kbC = "33333333-3333-3333-3333-333333333333";

const unbound = evaluateDbKeyScope([kbA], []);
check(
  "scope-unbound-403",
  !unbound.ok && unbound.status === 403,
  "zero bindings must 403",
);

const foreign = evaluateDbKeyScope([kbC], [kbA, kbB]);
check(
  "scope-all-foreign-403",
  !foreign.ok && foreign.status === 403,
  "all-foreign request must 403",
);

const mixed = evaluateDbKeyScope([kbA, kbC], [kbA, kbB]);
check(
  "scope-mixed-foreign-403",
  !mixed.ok && mixed.status === 403,
  "any foreign id must 403 (no silent drop)",
);

const okScope = evaluateDbKeyScope([kbA], [kbA, kbB]);
check(
  "scope-permitted-ok",
  okScope.ok && okScope.ids.join(",") === kbA,
);

const defaultBound = evaluateDbKeyScope(undefined, [kbA, kbB]);
check(
  "scope-default-bound",
  defaultBound.ok &&
    defaultBound.ids.sort().join(",") === [kbA, kbB].sort().join(","),
);

// ALLOW_ALL must not apply to DB keys (evaluateDbKeyScope never expands).
check(
  "db-key-never-allow-all",
  evaluateDbKeyScope(undefined, [kbA]).ok === true &&
    (evaluateDbKeyScope(undefined, [kbA]) as { ids: string[] }).ids.length ===
      1,
);

check(
  "allow-all-blocked-in-prod",
  allowAllKnowledgeBases({
    SEARCH_KNOWLEDGE_ALLOW_ALL: "true",
    NODE_ENV: "production",
  }) === false,
  "prod refuses ALLOW_ALL without override",
);

check(
  "allow-all-force-in-prod",
  allowAllKnowledgeBases({
    SEARCH_KNOWLEDGE_ALLOW_ALL: "true",
    NODE_ENV: "production",
    SEARCH_KNOWLEDGE_ALLOW_ALL_IN_PRODUCTION: "true",
  }) === true,
  "explicit override still works for legacy path",
);

check(
  "allow-all-dev-ok",
  allowAllKnowledgeBases({
    SEARCH_KNOWLEDGE_ALLOW_ALL: "true",
    NODE_ENV: "development",
  }) === true,
  "dev still allows ALLOW_ALL for legacy path",
);

check(
  "allow-all-off",
  allowAllKnowledgeBases({
    SEARCH_KNOWLEDGE_ALLOW_ALL: "false",
    NODE_ENV: "development",
  }) === false,
);

if (failed > 0) {
  console.error(`\n${failed} unit checks failed`);
  process.exit(1);
}
console.log("\napi-keys unit checks passed");
