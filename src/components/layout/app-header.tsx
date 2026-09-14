"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useI18n } from "@/lib/i18n";

export function AppHeader({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/knowledge-bases"
            className="font-heading text-xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
          >
            {t("brand.name")}
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              href="/knowledge-bases"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t("nav.knowledgeBases")}
            </Link>
            <Link
              href="/chat"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t("nav.chat")}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground md:inline">
            {email}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              {t("nav.signOut")}
            </Button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 border-t border-border/50 px-4 py-1 sm:hidden">
        <Link
          href="/knowledge-bases"
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground"
        >
          {t("nav.knowledgeBases")}
        </Link>
        <Link
          href="/chat"
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground"
        >
          {t("nav.chat")}
        </Link>
      </nav>
    </header>
  );
}
