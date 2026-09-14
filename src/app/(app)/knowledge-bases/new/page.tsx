"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { translateApiError, useI18n } from "@/lib/i18n";

export default function NewKnowledgeBasePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      router.push(`/knowledge-bases/${data.item.id}`);
    } catch {
      toast.error(t("kb.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <PageHeader title={t("kb.newTitle")} description={t("kb.newSubtitle")}>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/knowledge-bases">
            <ArrowLeft data-icon="inline-start" />
            {t("kb.back")}
          </Link>
        </Button>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>{t("kb.createTitle")}</CardTitle>
          <CardDescription>{t("kb.createDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("kb.name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">{t("kb.description")}</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </div>
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
