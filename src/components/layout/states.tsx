import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-dashed flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="font-heading text-lg font-semibold tracking-tight">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="font-medium text-destructive">{title}</p>
        {description ? (
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function LoadingState({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}
