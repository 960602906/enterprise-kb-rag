"use client";

import { useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "EN" },
];

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className={cn("inline-flex items-center gap-1.5 text-xs", className)}
    >
      {OPTIONS.map((opt, i) => (
        <span key={opt.value} className="inline-flex items-center gap-1.5">
          {i > 0 ? (
            <span className="text-muted-foreground/40" aria-hidden>
              |
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setLocale(opt.value)}
            aria-pressed={locale === opt.value}
            className={cn(
              "cursor-pointer rounded-md px-1 py-0.5 transition-colors",
              locale === opt.value
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        </span>
      ))}
    </div>
  );
}
