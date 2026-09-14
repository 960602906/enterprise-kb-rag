"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { Loader2, Send, BookMarked, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/states";
import type { CitationPayload } from "@/lib/db/schema";
import { translateApiError, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  role?: string;
};

function messageText(message: {
  parts?: Array<{ type: string; text?: string }>;
  content?: unknown;
}): string {
  if (typeof message.content === "string") return message.content;
  const parts = message.parts ?? [];
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function extractCitations(message: {
  metadata?: unknown;
  parts?: Array<{ type: string; data?: unknown }>;
}): CitationPayload[] {
  const meta = message.metadata as
    | { citations?: CitationPayload[] }
    | undefined;
  if (meta?.citations?.length) return meta.citations;

  const parts = message.parts ?? [];
  for (const part of parts) {
    if (part.type === "data-citations") {
      const data = part.data as
        | { citations?: CitationPayload[] }
        | CitationPayload[]
        | undefined;
      if (Array.isArray(data)) return data;
      if (data?.citations) return data.citations;
    }
  }
  return [];
}

export default function ChatPage() {
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbError, setKbError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [citations, setCitations] = useState<CitationPayload[]>([]);

  const selectedRef = useMemo(() => ({ current: selected }), []);
  selectedRef.current = selected;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          knowledgeBaseIds: selectedRef.current,
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- body reads selected via ref
    [],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
    onError: (err) => {
      toast.error(translateApiError(tRef.current, err.message, "chat.failed"));
    },
    onFinish: ({ message }) => {
      const next = extractCitations(message);
      if (next.length) setCitations(next);
    },
    onData: (dataPart) => {
      if (dataPart.type === "data-citations") {
        const data = dataPart.data as
          | { citations?: CitationPayload[] }
          | undefined;
        if (data?.citations) setCitations(data.citations);
      }
    },
  });

  const loadKbs = useCallback(async () => {
    setKbLoading(true);
    setKbError(null);
    try {
      const res = await fetch("/api/knowledge-bases");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          translateApiError(tRef.current, data.error, "errors.loadFailed"),
        );
      }
      const items = (data.items ?? []) as KnowledgeBase[];
      setKbs(items);
      setSelected((prev) =>
        prev.length ? prev.filter((id) => items.some((k) => k.id === id)) : [],
      );
    } catch (err) {
      setKbError(
        err instanceof Error
          ? err.message
          : tRef.current("errors.loadFailed"),
      );
    } finally {
      setKbLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKbs();
  }, [loadKbs]);

  function toggleKb(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "streaming" || status === "submitted") return;
    if (selected.length === 0) {
      toast.error(t("chat.selectKb"));
      return;
    }
    setInput("");
    setCitations([]);
    await sendMessage({ text });
  }

  const busy = status === "streaming" || status === "submitted";

  return (
    <div className="animate-fade-up flex min-h-[36rem] flex-1 flex-col gap-5 lg:flex-row lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="space-y-1.5">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {t("chat.title")}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("chat.subtitle")}
          </p>
        </div>

        <div className="surface rounded-2xl px-4 py-3.5">
          <p className="mb-2.5 text-xs font-medium tracking-wide text-muted-foreground">
            {t("chat.kbs")}
          </p>
          {kbLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("chat.loading")}
            </div>
          )}
          {!kbLoading && kbError && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{kbError}</span>
            </div>
          )}
          {!kbLoading && !kbError && kbs.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("chat.noKbs")}</p>
          )}
          {!kbLoading && !kbError && kbs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {kbs.map((kb) => {
                const on = selected.includes(kb.id);
                return (
                  <button
                    key={kb.id}
                    type="button"
                    onClick={() => toggleKb(kb.id)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      on
                        ? "border-foreground/15 bg-foreground text-background"
                        : "border-border/80 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    {kb.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
          <ScrollArea className="flex-1 px-5 py-5">
            {messages.length === 0 ? (
              <EmptyState
                icon={<BookMarked className="size-5" strokeWidth={1.75} />}
                title={t("chat.emptyTitle")}
                description={t("chat.emptyBody")}
                className="h-64 border-0 bg-transparent py-0"
              />
            ) : (
              <div className="space-y-5">
                {messages.map((m) => {
                  const text = messageText(m);
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        isUser ? "justify-end" : "justify-start",
                      )}
                    >
                      {isUser ? (
                        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">
                          {text}
                        </div>
                      ) : (
                        <div className="max-w-[90%] text-sm leading-7 whitespace-pre-wrap text-foreground">
                          {text || (busy ? "…" : "")}
                        </div>
                      )}
                    </div>
                  );
                })}
                {busy && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t("chat.retrieving")}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {error && (
            <p className="border-t border-border/50 px-5 py-2.5 text-xs text-destructive">
              {translateApiError(t, error.message, "chat.failed")}
            </p>
          )}

          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-2 border-t border-border/50 p-3.5 sm:flex-row sm:items-end"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chat.placeholder")}
              rows={2}
              className="min-h-[68px] flex-1 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSubmit(e);
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMessages([]);
                    setCitations([]);
                  }}
                >
                  {t("chat.clear")}
                </Button>
              )}
              <Button type="submit" disabled={busy || !input.trim()}>
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send data-icon="inline-start" />
                )}
                {t("chat.send")}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <aside className="surface flex w-full shrink-0 flex-col overflow-hidden rounded-2xl lg:w-80">
        <div className="border-b border-border/50 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            {t("chat.citations")}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t("chat.citationsSubtitle")}
          </p>
        </div>
        <ScrollArea className="flex-1 p-4">
          {citations.length === 0 ? (
            <p className="px-1 text-sm leading-relaxed text-muted-foreground">
              {t("chat.citationsEmpty")}
            </p>
          ) : (
            <ol className="space-y-3">
              {citations.map((c, i) => (
                <li
                  key={`${c.chunkId}-${i}`}
                  className="rounded-xl border border-border/50 bg-background/50 p-3.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">[{i + 1}]</Badge>
                    <span className="font-medium">{c.documentTitle}</span>
                    {c.pageNumber != null && (
                      <span className="text-xs text-muted-foreground">
                        {t("chat.page", { n: c.pageNumber })}
                      </span>
                    )}
                  </div>
                  {c.headingPath && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.headingPath}
                    </p>
                  )}
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {c.snippet}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>
      </aside>
    </div>
  );
}
