import { readFileSync } from "fs";
import path from "path";

export type SynonymBag = {
  id?: string;
  match: string;
  terms: string[];
};

type SynonymFile = {
  version?: number;
  bags?: SynonymBag[];
};

let cached: { path: string; bags: SynonymBag[]; compiled: CompiledBag[] } | null =
  null;

type CompiledBag = {
  id?: string;
  re: RegExp;
  terms: string[];
};

export function synonymConfigPath(): string {
  return (
    process.env.SYNONYM_CONFIG_PATH?.trim() ||
    path.join(process.cwd(), "config/retrieval-synonyms.json")
  );
}

export function loadSynonymBags(): CompiledBag[] {
  const filePath = synonymConfigPath();
  if (cached?.path === filePath) return cached.compiled;

  let bags: SynonymBag[] = [];
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as SynonymFile;
    if (Array.isArray(parsed.bags)) bags = parsed.bags;
  } catch {
    bags = [];
  }

  const compiled: CompiledBag[] = [];
  for (const bag of bags) {
    if (!bag?.match || !Array.isArray(bag.terms) || bag.terms.length === 0) {
      continue;
    }
    try {
      compiled.push({
        id: bag.id,
        re: new RegExp(bag.match, "i"),
        terms: bag.terms.filter((t) => typeof t === "string" && t.trim()),
      });
    } catch (err) {
      console.warn(
        `[synonyms] skipped bag ${bag.id ?? bag.match}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  cached = { path: filePath, bags, compiled };
  return compiled;
}

/** Expand a query blob with configured synonym terms (does not mutate query). */
export function expandSynonymTerms(queryBlob: string, add: (term: string) => void) {
  const compiled = loadSynonymBags();
  for (const bag of compiled) {
    if (bag.re.test(queryBlob)) {
      for (const term of bag.terms) add(term);
    }
  }
}
