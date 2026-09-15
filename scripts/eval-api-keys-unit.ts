/**
 * API key crypto + scope unit checks (no Postgres).
 *   pnpm eval:api-keys
 */
import {
  apiKeyDisplayPrefix,
  apiKeyHashesEqual,
  generateApiKeyPlaintext,
  hashApiKey,
} from "../src/lib/api-keys/crypto";

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

/** Pure scope intersection — mirrors DB-key path in resolveSearchKnowledgeBaseIds. */
function intersectScope(
  requested: string[] | undefined,
  allowlist: string[],
): string[] {
  if (allowlist.length === 0) return [];
  if (requested?.length) {
    const unique = [...new Set(requested)];
    return unique.filter((id) => allowlist.includes(id));
  }
  return [...allowlist];
}

const kbA = "11111111-1111-1111-1111-111111111111";
const kbB = "22222222-2222-2222-2222-222222222222";
const kbC = "33333333-3333-3333-3333-333333333333";

check(
  "scope-empty-bind",
  intersectScope([kbA], []).length === 0,
  "unbound key must not read any KB",
);
check(
  "scope-foreign-kb",
  intersectScope([kbC], [kbA, kbB]).length === 0,
  "foreign KB id must be filtered out",
);
check(
  "scope-intersection",
  intersectScope([kbA, kbC], [kbA, kbB]).join(",") === kbA,
);
check(
  "scope-default-bound",
  intersectScope(undefined, [kbA, kbB]).sort().join(",") ===
    [kbA, kbB].sort().join(","),
);

if (failed > 0) {
  console.error(`\n${failed} unit checks failed`);
  process.exit(1);
}
console.log("\napi-keys unit checks passed");
