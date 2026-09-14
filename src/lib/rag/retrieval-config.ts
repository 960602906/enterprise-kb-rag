import { readFileSync } from "fs";
import path from "path";

export type RetrievalConfig = {
  topK: number;
  vectorWeight: number;
  keywordWeight: number;
  minHybridScore: number;
  candidateMultiplier: number;
  candidateMin: number;
};

const DEFAULTS: RetrievalConfig = {
  topK: 8,
  vectorWeight: 0.65,
  keywordWeight: 0.35,
  minHybridScore: 0.08,
  candidateMultiplier: 3,
  candidateMin: 24,
};

let cached: { path: string; value: RetrievalConfig } | null = null;

export function retrievalConfigPath(): string {
  return (
    process.env.RETRIEVAL_CONFIG_PATH?.trim() ||
    path.join(process.cwd(), "config/retrieval.json")
  );
}

export function getRetrievalConfig(): RetrievalConfig {
  const filePath = retrievalConfigPath();
  if (cached?.path === filePath) return applyEnvOverrides(cached.value);

  let fileCfg: Partial<RetrievalConfig> = {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<RetrievalConfig>;
    if (parsed && typeof parsed === "object") fileCfg = parsed;
  } catch {
    fileCfg = {};
  }

  const merged: RetrievalConfig = {
    topK: num(fileCfg.topK, DEFAULTS.topK),
    vectorWeight: num(fileCfg.vectorWeight, DEFAULTS.vectorWeight),
    keywordWeight: num(fileCfg.keywordWeight, DEFAULTS.keywordWeight),
    minHybridScore: num(fileCfg.minHybridScore, DEFAULTS.minHybridScore),
    candidateMultiplier: num(fileCfg.candidateMultiplier, DEFAULTS.candidateMultiplier),
    candidateMin: num(fileCfg.candidateMin, DEFAULTS.candidateMin),
  };
  cached = { path: filePath, value: merged };
  return applyEnvOverrides(merged);
}

function applyEnvOverrides(base: RetrievalConfig): RetrievalConfig {
  return {
    topK: envInt("RETRIEVAL_TOP_K", base.topK),
    vectorWeight: envFloat("RETRIEVAL_VECTOR_WEIGHT", base.vectorWeight),
    keywordWeight: envFloat("RETRIEVAL_KEYWORD_WEIGHT", base.keywordWeight),
    minHybridScore: envFloat("RETRIEVAL_MIN_HYBRID_SCORE", base.minHybridScore),
    candidateMultiplier: envInt("RETRIEVAL_CANDIDATE_MULTIPLIER", base.candidateMultiplier),
    candidateMin: envInt("RETRIEVAL_CANDIDATE_MIN", base.candidateMin),
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
