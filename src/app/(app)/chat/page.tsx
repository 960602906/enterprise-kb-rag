"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { Loader2, Send, BookMarked, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { CitationPayload } from "@/lib/db/schema";

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
      toast.error(err.message || "Chat failed / 对话失败");
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
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const items = (data.items ?? []) as KnowledgeBase[];
      setKbs(items);
      setSelected((prev) =>
        prev.length ? prev.filter((id) => items.some((k) => k.id === id)) : [],
      );
    } catch (err) {
      setKbError(err instanceof Error ? err.message : "Failed to load");
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
      toast.error("Select at least one knowledge base / 请至少选择一个知识库");
      return;
    }
    setInput("");
    setCitations([]);
    await sendMessage({ text });
  }

  const busy = status === "streaming" || status === "submitted";

  return (
    <div className="animate-fade-up flex h-[calc(100vh-8rem)] min-h-[520px] flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Chat
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            问答 · Ask with citations from selected knowledge bases
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card/80 p-4">
          <p className="mb-3 text-sm font-medium">Knowledge bases / 知识库</p>
          {kbLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          )}
          {!kbLoading && kbError && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{kbError}</span>
            </div>
          )}
          {!kbLoading && !kbError && kbs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No accessible knowledge bases. Create one first.
            </p>
          )}
          {!kbLoading && !kbError && kbs.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {kbs.map((kb) => (
                <label
                  key={kb.id}
                  className="inline-flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border accent-primary"
                    checked={selected.includes(kb.id)}
                    onChange={() => toggleKb(kb.id)}
                  />
                  <span>{kb.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/70">
          <ScrollArea className="flex-1 px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <BookMarked className="size-8 text-muted-foreground/60" />
                <p className="mt-4 font-heading text-lg font-semibold">
                  Ask your knowledge base
                </p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  选择知识库后提问 — answers cite source snippets and pages
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m) => {
                  const text = messageText(m);
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/80 text-foreground"
                        }`}
                      >
                        {text || (busy && !isUser ? "…" : "")}
                      </div>
                    </div>
                  );
                })}
                {busy && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Retrieving & answering…
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {error && (
            <p className="border-t border-border/60 px-4 py-2 text-xs text-destructive">
              {error.message}
            </p>
          )}

          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 border-t border-border/60 p-3"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question… / 输入问题…"
              rows={2}
              className="min-h-[64px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSubmit(e);
                }
              }}
            />
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={busy || !input.trim()} size="lg">
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send data-icon="inline-start" />
                )}
                Send
              </Button>
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
                  Clear
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/80 lg:w-80">
        <div className="border-b border-border/60 px-4 py-3">
          <h2 className="font-heading text-lg font-semibold">Citations / 引用</h2>
          <p className="text-xs text-muted-foreground">
            Source snippets for the latest answer
          </p>
        </div>
        <ScrollArea className="flex-1 p-4">
          {citations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Citations appear after you ask a question.
            </p>
          ) : (
            <ol className="space-y-4">
              {citations.map((c, i) => (
                <li key={`${c.chunkId}-${i}`} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">[{i + 1}]</Badge>
                    <span className="font-medium">{c.documentTitle}</span>
                    {c.pageNumber != null && (
                      <span className="text-xs text-muted-foreground">
                        p.{c.pageNumber}
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
                  {i < citations.length - 1 && <Separator className="mt-4" />}
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>
      </aside>
    </div>
  );
}
