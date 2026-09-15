"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  Eye,
  Loader2,
  Upload,
  Play,
  Trash2,
  UserPlus,
  FileText,
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
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/layout/states";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DocumentPreviewDialog,
} from "@/components/documents/document-preview-dialog";
import { prefersDownloadAction } from "@/lib/documents/preview";
import { translateApiError, useI18n, type TranslateFn } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

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
    return <LoadingState label={t("kb.loadingDetail")} />;
  }

  if (error || !kb) {
    return (
      <ErrorState
        title={t("kb.loadFailed")}
        description={error ?? t("kb.notFound")}
      >
        <Button variant="outline" size="sm" className="mt-3" asChild>
          <Link href="/knowledge-bases">{t("kb.back")}</Link>
        </Button>
      </ErrorState>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={kb.name} description={kb.description ?? undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {t("kb.yourRole", {
              role: t(kb.role === "manage" ? "roles.manage" : "roles.read"),
            })}
          </Badge>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/knowledge-bases">
              <ArrowLeft data-icon="inline-start" />
              {t("kb.back")}
            </Link>
          </Button>
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
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>{t("docs.title")}</CardTitle>
          <CardDescription>{t("docs.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
        {canManage && (
          <form
            onSubmit={onUpload}
            className="space-y-4 rounded-lg border border-dashed p-4"
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
                  className="h-auto cursor-pointer py-2 file:mr-3 file:rounded-lg file:bg-muted file:px-2.5"
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
          <EmptyState
            icon={<FileText className="size-5" strokeWidth={1.75} />}
            title={t("docs.empty")}
            className="py-12"
          />
        ) : (
          <ul className="overflow-hidden rounded-lg border">
            {documents.map((doc, i) => (
              <li
                key={doc.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-4 py-3.5",
                  i > 0 && "border-t",
                )}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewDocId(doc.id)}
                  >
                    <Eye data-icon="inline-start" />
                    {t("docs.preview")}
                  </Button>
                  {prefersDownloadAction(doc.filename) && (
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={`/api/documents/${doc.id}/content?download=1`}
                        download={doc.filename}
                        aria-label={t("docs.downloadAria")}
                      >
                        <Download data-icon="inline-start" />
                        {t("docs.download")}
                      </a>
                    </Button>
                  )}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("members.title")}</CardTitle>
          <CardDescription>{t("members.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
        {canManage && (
          <form
            onSubmit={addMember}
            className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
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
                <SelectTrigger className="w-full">
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
          <p className="px-1 text-sm text-muted-foreground">{t("members.empty")}</p>
        ) : (
          <ul className="overflow-hidden rounded-lg border">
            {members.map((m, i) => (
              <li
                key={m.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
                  i > 0 && "border-t",
                )}
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
        </CardContent>
      </Card>

      <DocumentPreviewDialog
        documentId={previewDocId}
        open={previewDocId != null}
        onOpenChange={(open) => {
          if (!open) setPreviewDocId(null);
        }}
      />
    </div>
  );
}
