"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Loader2,
  MessagesSquare,
  Plus,
  Shield,
  Eye,
} from "lucide-react";
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
import { ErrorState } from "@/components/layout/states";
import { translateApiError, useI18n } from "@/lib/i18n";

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  role?: "read" | "manage";
};

export default function OverviewPage() {
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-bases");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          translateApiError(tRef.current, data.error, "errors.loadFailed"),
        );
      }
      setItems(data.items ?? []);
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

  const manageCount = items.filter((kb) => kb.role === "manage").length;
  const readCount = items.filter((kb) => kb.role === "read").length;

  return (
    <div className="space-y-4">
      <PageHeader title={t("overview.title")} description={t("overview.subtitle")}>
        <Button asChild>
          <Link href="/knowledge-bases/new">
            <Plus data-icon="inline-start" />
            {t("overview.createKb")}
          </Link>
        </Button>
      </PageHeader>

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("overview.knowledgeBases")}
          value={loading ? "—" : String(items.length)}
          icon={<BookOpen className="size-4 text-muted-foreground" />}
          loading={loading}
        />
        <StatCard
          title={t("overview.manageRole")}
          value={loading ? "—" : String(manageCount)}
          icon={<Shield className="size-4 text-muted-foreground" />}
          loading={loading}
        />
        <StatCard
          title={t("overview.readRole")}
          value={loading ? "—" : String(readCount)}
          icon={<Eye className="size-4 text-muted-foreground" />}
          loading={loading}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("overview.askDocs")}
            </CardTitle>
            <MessagesSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t("overview.askDocsBody")}
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/chat">{t("overview.quickChat")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>{t("overview.recentKbs")}</CardTitle>
              <CardDescription>{t("overview.recentKbsBody")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/knowledge-bases">{t("overview.viewAll")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("kb.loading")}
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">
                {t("overview.noKbs")}
              </p>
            ) : (
              <ul className="divide-y">
                {items.slice(0, 6).map((kb) => (
                  <li key={kb.id}>
                    <Link
                      href={`/knowledge-bases/${kb.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-primary"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{kb.name}</p>
                        {kb.description ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {kb.description}
                          </p>
                        ) : null}
                      </div>
                      {kb.role ? (
                        <Badge variant="secondary" className="shrink-0">
                          {t(
                            kb.role === "manage"
                              ? "roles.manage"
                              : "roles.read",
                          )}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("nav.chat")}</CardTitle>
            <CardDescription>{t("chat.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("chat.emptyBody")}</p>
            <Button asChild className="w-full">
              <Link href="/chat">
                <MessagesSquare data-icon="inline-start" />
                {t("overview.quickChat")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {loading ? (
            <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted" />
          ) : (
            value
          )}
        </div>
      </CardContent>
    </Card>
  );
}
