"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useI18n, type MessageKey } from "@/lib/i18n";

type Crumb = {
  labelKey: MessageKey;
  href?: string;
};

export function AppBreadcrumb() {
  const pathname = usePathname();
  const { t } = useI18n();

  const crumbs = useMemo<Crumb[]>(() => {
    if (pathname.startsWith("/knowledge-bases/new")) {
      return [
        { labelKey: "nav.knowledgeBases", href: "/knowledge-bases" },
        { labelKey: "kb.new" },
      ];
    }
    if (
      pathname.startsWith("/knowledge-bases/") &&
      pathname !== "/knowledge-bases"
    ) {
      return [
        { labelKey: "nav.knowledgeBases", href: "/knowledge-bases" },
        { labelKey: "kb.detail" },
      ];
    }
    if (pathname.startsWith("/knowledge-bases")) {
      return [{ labelKey: "nav.knowledgeBases" }];
    }
    if (pathname.startsWith("/chat")) {
      return [{ labelKey: "nav.chat" }];
    }
    if (pathname.startsWith("/qa-logs")) {
      return [{ labelKey: "nav.logs" }];
    }
    if (pathname.startsWith("/settings")) {
      return [{ labelKey: "nav.settings" }];
    }
    return [{ labelKey: "nav.overview" }];
  }, [pathname]);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={`${crumb.labelKey}-${index}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{t(crumb.labelKey)}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{t(crumb.labelKey)}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
