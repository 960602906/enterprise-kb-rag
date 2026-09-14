"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { translateApiError, useI18n } from "@/lib/i18n";

type QaLogItem = {
  id: string;
  question: string;
  answerPreview: string;
  latencyMs: number | null;
  model: string | null;
  chunkCount: number;
  createdAt: string;
};

export default function QaLogsPage() {
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [items, setItems] = useState<QaLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/qa-logs?limit=50");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          translateApiError(tRef.current, data.error, "errors.loadFailed"),
        );
      }
      setItems((data.items ?? []) as QaLogItem[]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tRef.current("errors.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("logs.title")} description={t("logs.subtitle")} />

      {error ? (
        <ErrorState title={t("kb.loadFailed")} description={error}>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void load()}
          >
            {t("kb.retry")}
          </Button>
        </ErrorState>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("chat.loading")}
        </div>
      ) : items.length === 0 && !error ? (
        <EmptyState title={t("logs.empty")} description={t("logs.emptyBody")} />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <Card key={row.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base leading-snug">
                  {row.question}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2">
                  <span>{formatWhen(row.createdAt)}</span>
                  {row.latencyMs != null ? (
                    <Badge variant="secondary">
                      {t("logs.latency", { ms: row.latencyMs })}
                    </Badge>
                  ) : null}
                  {row.model ? (
                    <Badge variant="outline">
                      {t("logs.model", { model: row.model })}
                    </Badge>
                  ) : null}
                  <Badge variant="outline">
                    {t("logs.chunks", { count: row.chunkCount })}
                  </Badge>
                </CardDescription>
              </CardHeader>
              {row.answerPreview ? (
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {row.answerPreview}
                  </p>
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
