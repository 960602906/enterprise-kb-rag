"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Upload,
  Play,
  Trash2,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { translateApiError, useI18n, type TranslateFn } from "@/lib/i18n";

type DocStatus = "pending" | "processing" | "ready" | "failed";

type DocumentItem = {
  id: string;
  title: string;
  filename: string;
  status: DocStatus;
  errorMessage?: string | null;
  pageCount?: number | null;
  chunkCount?: number | null;
};

type Member = {
  id: string;
  userId: string;
  role: "read" | "manage";
  email: string;
  name: string | null;
};

type KbDetail = {
  id: string;
  name: string;
  description: string | null;
  role: "read" | "manage";
};

const statusVariant: Record<
  DocStatus,
  "secondary" | "outline" | "default" | "destructive"
> = {
  pending: "secondary",
  processing: "outline",
  ready: "default",
  failed: "destructive",
};

function statusLabel(t: TranslateFn, status: DocStatus): string {
  switch (status) {
    case "pending":
      return t("docs.status.pending");
    case "processing":
      return t("docs.status.processing");
    case "ready":
      return t("docs.status.ready");
    case "failed":
      return t("docs.status.failed");
  }
}

export default function KnowledgeBaseDetailPage() {
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [kb, setKb] = useState<KbDetail | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"read" | "manage">("read");
  const [addingMember, setAddingMember] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canManage = kb?.role === "manage";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kbRes, membersRes] = await Promise.all([
        fetch(`/api/knowledge-bases/${id}`),
        fetch(`/api/knowledge-bases/${id}/members`),
      ]);
      const kbData = await kbRes.json();
      if (!kbRes.ok) {
        throw new Error(
          translateApiError(tRef.current, kbData.error, "errors.loadFailed"),
        );
      }
      setKb(kbData.item);
      setDocuments(kbData.documents ?? []);

      if (membersRes.ok) {
        const mData = await membersRes.json();
        setMembers(mData.members ?? []);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tRef.current("errors.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const busy = documents.some(
      (d) => d.status === "processing" || d.status === "pending",
    );
    if (!busy) return;
    const t = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(t);
  }, [documents, load]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || !canManage) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (title.trim()) form.append("title", title.trim());
      form.append("process", "false");

      const res = await fetch(`/api/knowledge-bases/${id}/documents`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(translateApiError(t, data.error, "docs.uploadFailed"));
        return;
      }
      toast.success(t("docs.uploaded"));
      setFile(null);
      setTitle("");
      await load();
    } catch {
      toast.error(t("docs.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function processDoc(docId: string) {
    if (!canManage) return;
    setProcessingId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}/process`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(translateApiError(t, data.error, "docs.processFailed"));
        return;
      }
      toast.success(t("docs.processed"));
      await load();
    } catch {
      toast.error(t("docs.processFailed"));
    } finally {
      setProcessingId(null);
    }
  }

  async function deleteDoc(docId: string) {
    if (!canManage) return;
    if (!confirm(t("docs.confirmDelete"))) return;
    try {
      const res = await fetch(`/api/documents/${docId}/process`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(translateApiError(t, data.error, "docs.deleteFailed"));
        return;
      }
      toast.success(t("docs.deleted"));
      await load();
    } catch {
      toast.error(t("docs.deleteFailed"));
    }
  }

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !memberEmail.trim()) return;
    setAddingMember(true);
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: memberEmail.trim(),
          role: memberRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(translateApiError(t, data.error, "members.addFailed"));
        return;
      }
      toast.success(t("members.added"));
      setMemberEmail("");
      await load();
    } catch {
      toast.error(t("members.addFailed"));
    } finally {
      setAddingMember(false);
    }
  }

  async function removeMember(userId: string) {
    if (!canManage) return;
    if (!confirm(t("members.confirmRemove"))) return;
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(translateApiError(t, data.error, "members.removeFailed"));
        return;
      }
      toast.success(t("members.removed"));
      await load();
    } catch {
      toast.error(t("members.removeFailed"));
    }
  }

  async function deleteKb() {
    if (!canManage) return;
    if (!confirm(t("kb.confirmDelete"))) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/knowledge-bases/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(translateApiError(t, data.error, "docs.deleteFailed"));
        return;
      }
      toast.success(t("kb.deleted"));
      router.push("/knowledge-bases");
    } catch {
      toast.error(t("docs.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("kb.loadingDetail")}
      </div>
    );
  }

  if (error || !kb) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <AlertCircle className="mt-0.5 size-4 text-destructive" />
        <div>
          <p className="font-medium text-destructive">{t("kb.loadFailed")}</p>
          <p className="mt-1 text-muted-foreground">
            {error ?? t("kb.notFound")}
          </p>
          <Button variant="outline" size="sm" className="mt-3" asChild>
            <Link href="/knowledge-bases">{t("kb.back")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-10">
      <div>
        <Link
          href="/knowledge-bases"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("nav.knowledgeBases")}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {kb.name}
            </h1>
            {kb.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {kb.description}
              </p>
            )}
            <Badge variant="secondary" className="mt-3">
              {t("kb.yourRole", {
                role: t(kb.role === "manage" ? "roles.manage" : "roles.read"),
              })}
            </Badge>
          </div>
          {canManage && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void deleteKb()}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {t("kb.deleteKb")}
            </Button>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-semibold">{t("docs.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("docs.subtitle")}</p>
        </div>

        {canManage && (
          <form
            onSubmit={onUpload}
            className="space-y-4 rounded-2xl border border-border/80 bg-card/80 p-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="file">{t("docs.file")}</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.md,.txt,.docx,application/pdf,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-title">{t("docs.titleOptional")}</Label>
                <Input
                  id="doc-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("docs.titlePlaceholder")}
                />
              </div>
            </div>
            <Button type="submit" disabled={uploading || !file}>
              {uploading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload data-icon="inline-start" />
              )}
              {t("docs.upload")}
            </Button>
          </form>
        )}

        {documents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("docs.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border/80 border-y border-border/80">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{doc.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {doc.filename}
                    {doc.chunkCount != null && doc.status === "ready"
                      ? ` · ${t("docs.chunks", { count: doc.chunkCount })}`
                      : ""}
                    {doc.pageCount != null
                      ? ` · ${t("docs.pages", { count: doc.pageCount })}`
                      : ""}
                  </p>
                  {doc.status === "failed" && doc.errorMessage && (
                    <p className="mt-1 text-xs text-destructive">
                      {doc.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant[doc.status]}>
                    {statusLabel(t, doc.status)}
                  </Badge>
                  {canManage &&
                    doc.status !== "ready" &&
                    doc.status !== "processing" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processingId === doc.id}
                        onClick={() => void processDoc(doc.id)}
                      >
                        {processingId === doc.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Play data-icon="inline-start" />
                        )}
                        {t("docs.process")}
                      </Button>
                    )}
                  {canManage && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void deleteDoc(doc.id)}
                      aria-label={t("docs.deleteAria")}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            {t("members.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("members.subtitle")}</p>
        </div>

        {canManage && (
          <form
            onSubmit={addMember}
            className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/80 bg-card/80 p-5"
          >
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label htmlFor="member-email">{t("members.email")}</Label>
              <Input
                id="member-email"
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder={t("members.emailPlaceholder")}
                required
              />
            </div>
            <div className="w-36 space-y-2">
              <Label>{t("members.role")}</Label>
              <Select
                value={memberRole}
                onValueChange={(v) => setMemberRole(v as "read" | "manage")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">{t("roles.read")}</SelectItem>
                  <SelectItem value="manage">{t("roles.manage")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={addingMember}>
              {addingMember ? (
                <Loader2 className="animate-spin" />
              ) : (
                <UserPlus data-icon="inline-start" />
              )}
              {t("members.add")}
            </Button>
          </form>
        )}

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("members.empty")}</p>
        ) : (
          <ul className="divide-y divide-border/80 border-y border-border/80">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{m.email}</p>
                  {m.name && (
                    <p className="text-xs text-muted-foreground">{m.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {t(m.role === "manage" ? "roles.manage" : "roles.read")}
                  </Badge>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeMember(m.userId)}
                    >
                      {t("members.remove")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
