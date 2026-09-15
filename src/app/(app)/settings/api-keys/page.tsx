"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { translateApiError, useI18n } from "@/lib/i18n";

type KbOption = { id: string; name: string };

type ApiKeyItem = {
  id: string;
  name: string;
  keyPrefix: string;
  enabled: boolean;
  rateLimitPerMin: number | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  knowledgeBases: KbOption[];
};

type ConfirmDialog =
  | { type: "revoke"; id: string }
  | { type: "rotate"; id: string }
  | null;

export default function ApiKeysSettingsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ApiKeyItem[]>([]);
  const [manageable, setManageable] = useState<KbOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/api-keys");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(true);
        toast.error(translateApiError(t, data.error, "apiKeys.loadFailed"));
        return;
      }
      setItems(data.items ?? []);
      setManageable(data.manageableKnowledgeBases ?? []);
    } catch {
      setLoadError(true);
      toast.error(t("apiKeys.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleKb(id: string) {
    setSelectedKbIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (selectedKbIds.length === 0) {
      toast.error(t("apiKeys.selectKb"));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          knowledgeBaseIds: selectedKbIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(translateApiError(t, data.error, "apiKeys.createFailed"));
        return;
      }
      toast.success(t("apiKeys.created"));
      setSecret(data.item.secret as string);
      setCreateOpen(false);
      setName("");
      setSelectedKbIds([]);
      await load();
    } catch {
      toast.error(t("apiKeys.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(item: ApiKeyItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/api-keys/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(translateApiError(t, data.error, "apiKeys.updateFailed"));
        return;
      }
      toast.success(t("apiKeys.updated"));
      await load();
    } catch {
      toast.error(t("apiKeys.updateFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function runConfirmedAction() {
    if (!confirmDialog || confirmBusy) return;
    setConfirmBusy(true);
    try {
      if (confirmDialog.type === "revoke") {
        const res = await fetch(`/api/api-keys/${confirmDialog.id}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(translateApiError(t, data.error, "apiKeys.revokeFailed"));
          return;
        }
        toast.success(t("apiKeys.revoked"));
        setConfirmDialog(null);
        await load();
        return;
      }

      const res = await fetch(`/api/api-keys/${confirmDialog.id}/rotate`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(translateApiError(t, data.error, "apiKeys.rotateFailed"));
        return;
      }
      toast.success(t("apiKeys.rotated"));
      setSecret(data.item.secret as string);
      setConfirmDialog(null);
      await load();
    } catch {
      toast.error(
        confirmDialog.type === "revoke"
          ? t("apiKeys.revokeFailed")
          : t("apiKeys.rotateFailed"),
      );
    } finally {
      setConfirmBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(t("apiKeys.copied"));
    } catch {
      toast.error(t("apiKeys.copy"));
    }
  }

  const confirmCopy =
    confirmDialog?.type === "revoke"
      ? {
          title: t("apiKeys.confirmRevokeTitle"),
          description: t("apiKeys.confirmRevoke"),
          action: t("apiKeys.confirmRevokeAction"),
        }
      : confirmDialog?.type === "rotate"
        ? {
            title: t("apiKeys.confirmRotateTitle"),
            description: t("apiKeys.confirmRotate"),
            action: t("apiKeys.confirmRotateAction"),
          }
        : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("apiKeys.title")}
        description={t("apiKeys.subtitle")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/settings">
              <ArrowLeft data-icon="inline-start" />
              {t("apiKeys.backToSettings")}
            </Link>
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={manageable.length === 0 && !loading}>
                <Plus data-icon="inline-start" />
                {t("apiKeys.new")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={(e) => void createKey(e)}>
                <DialogHeader>
                  <DialogTitle>{t("apiKeys.createTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("apiKeys.createDescription")}
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="api-key-name">{t("apiKeys.name")}</Label>
                    <Input
                      id="api-key-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("apiKeys.namePlaceholder")}
                      required
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("apiKeys.knowledgeBases")}</Label>
                    {manageable.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("apiKeys.noManageableKb")}
                      </p>
                    ) : (
                      <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                        {manageable.map((kb) => {
                          const checked = selectedKbIds.includes(kb.id);
                          return (
                            <label
                              key={kb.id}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={checked}
                                onChange={() => toggleKb(kb.id)}
                              />
                              <span>{kb.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button
                    type="submit"
                    disabled={
                      creating ||
                      manageable.length === 0 ||
                      !name.trim() ||
                      selectedKbIds.length === 0
                    }
                    aria-busy={creating}
                  >
                    {creating ? <Loader2 className="animate-spin" /> : null}
                    {creating ? t("apiKeys.creating") : t("apiKeys.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>
      <Separator className="my-2" />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("apiKeys.loading")}
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              {t("apiKeys.loadFailed")}
            </p>
            <Button variant="outline" onClick={() => void load()}>
              {t("apiKeys.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5" />
              {t("apiKeys.emptyTitle")}
            </CardTitle>
            <CardDescription>{t("apiKeys.emptyBody")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {t("apiKeys.prefix")}: {item.keyPrefix}…
                      </CardDescription>
                    </div>
                    <Badge variant={item.enabled ? "default" : "secondary"}>
                      {item.enabled
                        ? t("apiKeys.enabled")
                        : t("apiKeys.disabled")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">{t("apiKeys.boundKbs")}</p>
                      <p>
                        {item.knowledgeBases.length
                          ? item.knowledgeBases.map((kb) => kb.name).join(", ")
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("apiKeys.lastUsed")}</p>
                      <p>
                        {item.lastUsedAt
                          ? new Date(item.lastUsedAt).toLocaleString()
                          : t("apiKeys.neverUsed")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("apiKeys.createdAt")}</p>
                      <p>{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || confirmBusy}
                      aria-busy={busy}
                      onClick={() => void toggleEnabled(item)}
                    >
                      {busy ? (
                        <Loader2 className="animate-spin" />
                      ) : null}
                      {item.enabled ? t("apiKeys.disable") : t("apiKeys.enable")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || confirmBusy}
                      onClick={() => {
                        if (confirmBusy) return;
                        setConfirmDialog({ type: "rotate", id: item.id });
                      }}
                    >
                      <RefreshCw data-icon="inline-start" />
                      {t("apiKeys.rotate")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy || confirmBusy}
                      onClick={() => {
                        if (confirmBusy) return;
                        setConfirmDialog({ type: "revoke", id: item.id });
                      }}
                    >
                      <Trash2 data-icon="inline-start" />
                      {t("apiKeys.revoke")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={secret != null}
        onOpenChange={(open) => {
          if (!open) setSecret(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiKeys.secretTitle")}</DialogTitle>
            <DialogDescription>{t("apiKeys.secretWarning")}</DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertTitle>{t("apiKeys.secretWarning")}</AlertTitle>
            <AlertDescription>
              <code className="mt-2 block break-all rounded bg-muted px-2 py-2 font-mono text-xs">
                {secret}
              </code>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void copySecret()}>
              <Copy data-icon="inline-start" />
              {t("apiKeys.copy")}
            </Button>
            <Button type="button" onClick={() => setSecret(null)}>
              {t("apiKeys.secretClose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDialog != null}
        onOpenChange={(open) => {
          if (!open && !confirmBusy) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCopy?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={confirmBusy}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={confirmBusy}
              aria-busy={confirmBusy}
              onClick={(e) => {
                e.preventDefault();
                void runConfirmedAction();
              }}
            >
              {confirmBusy ? <Loader2 className="animate-spin" /> : null}
              {confirmCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
