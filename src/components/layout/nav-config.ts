import {
  BookOpen,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

export type NavItem = {
  titleKey: MessageKey;
  url: string;
  icon: LucideIcon;
  match?: "exact" | "prefix";
};

export type NavGroup = {
  titleKey: MessageKey;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    titleKey: "nav.general",
    items: [
      {
        titleKey: "nav.overview",
        url: "/overview",
        icon: LayoutDashboard,
        match: "prefix",
      },
      {
        titleKey: "nav.knowledgeBases",
        url: "/knowledge-bases",
        icon: BookOpen,
        match: "prefix",
      },
      {
        titleKey: "nav.chat",
        url: "/chat",
        icon: MessagesSquare,
        match: "prefix",
      },
    ],
  },
  {
    titleKey: "nav.other",
    items: [
      {
        titleKey: "nav.settings",
        url: "/settings",
        icon: Settings,
        match: "prefix",
      },
    ],
  },
];

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.url;
  if (item.url === "/knowledge-bases") {
    return pathname === item.url || pathname.startsWith(`${item.url}/`);
  }
  return pathname === item.url || pathname.startsWith(`${item.url}/`);
}
