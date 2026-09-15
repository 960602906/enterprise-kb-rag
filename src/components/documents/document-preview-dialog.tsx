"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocumentPreviewPayload } from "@/lib/documents/preview";
import { translateApiError, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  documentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadingChange?: (loading: boolean) => void;
};

export function DocumentPreviewDialog({
  documentId,
  open,
  onOpenChange,
  onLoadingChange,
}: Props) {
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  const [preview, setPreview] = useState<DocumentPreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !documentId) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/preview`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            translateApiError(
              tRef.current,
              data.error,
              "docs.previewFailed",
            ),
          );
        }
        if (!cancelled) {
          setPreview(data.item as DocumentPreviewPayload);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : tRef.current("docs.previewFailed");
          setError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,880px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-4 pr-12">
          <DialogTitle className="truncate">
            {preview?.title ?? t("docs.preview")}
          </DialogTitle>
          <DialogDescription className="truncate">
            {preview?.filename ?? t("docs.previewSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <div
          className="min-h-0 flex-1 overflow-auto px-6 py-4"
          aria-busy={loading}
        >
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>{t("docs.previewLoading")}</span>
            </div>
          ) : error ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-destructive">
              {error}
            </div>
          ) : preview ? (
            <PreviewBody preview={preview} />
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t border-border/60 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {preview?.downloadUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={preview.downloadUrl} download={preview.filename}>
                  <Download data-icon="inline-start" />
                  {t("docs.download")}
                </a>
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ preview }: { preview: DocumentPreviewPayload }) {
  const { t } = useI18n();

  if (preview.kind === "pdf") {
    return (
      <iframe
        title={preview.title}
        src={preview.contentUrl}
        className="h-[min(65vh,640px)] w-full rounded-lg border bg-muted/20"
      />
    );
  }

  if (preview.kind === "unavailable") {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{t("docs.previewUnavailable")}</p>
        <p className="max-w-md text-xs text-muted-foreground">{preview.message}</p>
        <Button variant="outline" size="sm" asChild>
          <a href={preview.downloadUrl} download={preview.filename}>
            <Download data-icon="inline-start" />
            {t("docs.download")}
          </a>
        </Button>
      </div>
    );
  }

  if (preview.kind === "text" || preview.kind === "markdown") {
    return (
      <pre className="doc-preview-text whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-foreground">
        {preview.body}
      </pre>
    );
  }

  return (
    <div
      className={cn("doc-preview-html text-sm leading-relaxed text-foreground")}
      // HTML is produced server-side from the user's own uploaded file
      // (escaped markdown lite, or mammoth for DOCX).
      dangerouslySetInnerHTML={{ __html: preview.body }}
    />
  );
}

export function DocumentPreviewTrigger({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      <Eye data-icon="inline-start" />
      {label}
    </Button>
  );
}
