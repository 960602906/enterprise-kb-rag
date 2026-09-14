"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { translateApiError, useI18n } from "@/lib/i18n";

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  role?: "read" | "manage";
  createdAt?: string;
};

export default function KnowledgeBasesPage() {
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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
        err instanceof Error
          ? err.message
          : tRef.current("errors.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKb(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(translateApiError(t, data.error, "kb.createFailed"));
        return;
      }
      toast.success(t("kb.created"));
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/knowledge-bases/${data.item.id}`);
    } catch {
      toast.error(t("kb.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("kb.title")} description={t("kb.subtitle")}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus data-icon="inline-start" />
              {t("kb.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={createKb}>
              <DialogHeader>
                <DialogTitle>{t("kb.createTitle")}</DialogTitle>
                <DialogDescription>{t("kb.createDescription")}</DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="kb-name">{t("kb.name")}</Label>
                  <Input
                    id="kb-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("kb.namePlaceholder")}
                    required
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-desc">{t("kb.description")}</Label>
                  <Textarea
                    id="kb-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("kb.descriptionOptional")}
                    rows={3}
                    maxLength={2000}
                  />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="submit" disabled={creating || !name.trim()}>
                  {creating ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {t("kb.creating")}
                    </>
                  ) : (
                    t("kb.create")
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {loading && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Card>
                <CardHeader>
                  <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted/80" />
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {!loading && error && (
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
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={<BookOpen className="size-5" strokeWidth={1.75} />}
          title={t("kb.emptyTitle")}
          description={t("kb.emptyBody")}
        >
          <Button onClick={() => setOpen(true)}>
            <Plus data-icon="inline-start" />
            {t("kb.createFirst")}
          </Button>
        </EmptyState>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((kb) => (
            <li key={kb.id}>
              <Link href={`/knowledge-bases/${kb.id}`} className="block h-full">
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <CardTitle className="text-base">{kb.name}</CardTitle>
                    {kb.role && (
                      <Badge variant="secondary" className="shrink-0">
                        {t(
                          kb.role === "manage" ? "roles.manage" : "roles.read",
                        )}
                      </Badge>
                    )}
                  </CardHeader>
                  {kb.description ? (
                    <CardContent>
                      <CardDescription className="line-clamp-2">
                        {kb.description}
                      </CardDescription>
                    </CardContent>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
