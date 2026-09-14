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
      className={cn(
        "inline-flex items-center rounded-full bg-muted/80 p-0.5 text-xs",
        className,
      )}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setLocale(opt.value)}
          aria-pressed={locale === opt.value}
          className={cn(
            "cursor-pointer rounded-full px-2.5 py-1 transition-colors",
            locale === opt.value
              ? "bg-background font-semibold text-foreground shadow-sm"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
