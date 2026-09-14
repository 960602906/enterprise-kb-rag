"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { Header } from "@/components/layout/header";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { Main } from "@/components/layout/main";
import { ProfileDropdown } from "@/components/layout/profile-dropdown";
import { Search } from "@/components/layout/search";
import { SearchProvider } from "@/components/layout/search-provider";
import { SkipToMain } from "@/components/layout/skip-to-main";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import type { AppUser } from "@/components/layout/types";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  user,
  defaultOpen,
}: {
  children: React.ReactNode;
  user: AppUser;
  defaultOpen: boolean;
}) {
  return (
    <SearchProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <SkipToMain />
        <AppSidebar user={user} />
        <SidebarInset
          className={cn(
            "@container/content min-h-svh",
            "has-data-[layout=fixed]:h-svh",
          )}
        >
          <Header>
            <AppBreadcrumb />
            <div className="ms-auto flex items-center gap-2 sm:gap-3">
              <Search />
              <LanguageToggle />
              <ThemeSwitch />
              <ProfileDropdown user={user} />
            </div>
          </Header>
          <Main>{children}</Main>
        </SidebarInset>
      </SidebarProvider>
    </SearchProvider>
  );
}
