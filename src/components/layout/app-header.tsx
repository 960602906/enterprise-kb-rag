"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand-mark";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function AppHeader({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const kbActive = pathname.startsWith("/knowledge-bases");
  const chatActive = pathname.startsWith("/chat");

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-7">
          <Link
            href="/knowledge-bases"
            className="flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-80"
          >
            <BrandMark size="sm" />
            <span className="font-heading text-[1.05rem] font-semibold tracking-tight sm:text-lg">
              {t("brand.name")}
            </span>
          </Link>
          <nav className="hidden items-center gap-0.5 sm:flex">
            <NavLink href="/knowledge-bases" active={kbActive}>
              {t("nav.knowledgeBases")}
            </NavLink>
            <NavLink href="/chat" active={chatActive}>
              {t("nav.chat")}
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <LanguageToggle />
          <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:inline">
            {email}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              {t("nav.signOut")}
            </Button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 border-t border-border/40 px-4 py-1.5 sm:hidden">
        <NavLink href="/knowledge-bases" active={kbActive}>
          {t("nav.knowledgeBases")}
        </NavLink>
        <NavLink href="/chat" active={chatActive}>
          {t("nav.chat")}
        </NavLink>
      </nav>
    </header>
  );
}
