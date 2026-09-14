/**
 * @ai-sdk/openai reads OPENAI_BASE_URL at import time and rejects "".
 * Treat blank env values as unset so mock/dev (no gateway URL) still loads.
 */
for (const key of ["OPENAI_BASE_URL", "AI_GATEWAY_BASE_URL"] as const) {
  if (process.env[key] === "") delete process.env[key];
}
