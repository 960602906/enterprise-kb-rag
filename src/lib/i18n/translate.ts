import type { Dictionary } from "./messages";

type Join<K, P> = K extends string
  ? P extends string
    ? `${K}.${P}`
    : never
  : never;

export type MessageKey = {
  [K in keyof Dictionary & string]: Dictionary[K] extends string
    ? K
    : Dictionary[K] extends Record<string, unknown>
      ? Join<K, NestedKey<Dictionary[K]>>
      : never;
}[keyof Dictionary & string];

type NestedKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends Record<string, unknown>
      ? Join<K, NestedKey<T[K]>>
      : never;
}[keyof T & string];

export type TranslateVars = Record<string, string | number>;

export type TranslateFn = (key: MessageKey, vars?: TranslateVars) => string;

export function getMessage(dict: Dictionary, key: string): string {
  const parts = key.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : key;
}

export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : match,
  );
}

export function translate(
  dict: Dictionary,
  key: MessageKey,
  vars?: TranslateVars,
): string {
  return interpolate(getMessage(dict, key), vars);
}

/** Known API / ACL English messages → dictionary keys. */
const API_ERROR_MAP: Record<string, MessageKey> = {
  "Not found": "errors.notFound",
  "Internal error": "errors.internal",
  Unauthorized: "errors.unauthorized",
  "file is required": "errors.fileRequired",
  "Unsupported file type. Use PDF, Markdown, TXT, or DOCX.":
    "errors.unsupportedFile",
  "Upload failed": "errors.uploadFailed",
  "Processing failed": "errors.processFailed",
  "Process failed": "docs.processFailed",
  "Delete failed": "errors.deleteFailed",
  "Preview failed": "docs.previewFailed",
  "Content fetch failed": "docs.previewFailed",
  "User not found. They must sign up / be seeded first.": "errors.userNotFound",
  "Select at least one knowledge base": "errors.selectKb",
  "No accessible knowledge bases in selection": "errors.noAccessibleKb",
  "Empty question": "errors.emptyQuestion",
  "Chat failed": "errors.chatFailed",
  "Knowledge base not found or access denied": "errors.accessDenied",
  "Manage permission required": "errors.manageRequired",
  "Manage permission required for all bound knowledge bases":
    "errors.manageRequired",
  "At least one knowledge base is required": "apiKeys.selectKb",
  "API key not found": "errors.notFound",
  "API key not found or access denied": "errors.accessDenied",
  "Failed to load": "errors.loadFailed",
  "Failed to load KB": "errors.loadFailed",
  Failed: "errors.internal",
  "Create failed": "kb.createFailed",
  "Add failed": "members.addFailed",
  "Remove failed": "members.removeFailed",
};

export function translateApiError(
  t: TranslateFn,
  error: unknown,
  fallback: MessageKey,
): string {
  if (typeof error !== "string" || !error.trim()) return t(fallback);
  const mapped = API_ERROR_MAP[error];
  if (mapped) return t(mapped);
  const tooLarge = error.match(/^File too large \(max (\d+) bytes\)$/);
  if (tooLarge) return t("errors.fileTooLarge", { max: tooLarge[1] });
  return error;
}
