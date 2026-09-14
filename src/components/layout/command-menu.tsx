"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowRight, Laptop, Moon, Sun } from "lucide-react";
import { useSearch } from "@/components/layout/search-provider";
import { navGroups } from "@/components/layout/nav-config";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useI18n } from "@/lib/i18n";

export function CommandMenu() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { open, setOpen } = useSearch();
  const { t } = useI18n();

  const runCommand = useCallback(
    (command: () => unknown) => {
      setOpen(false);
      command();
    },
    [setOpen],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("command.title")}
      description={t("command.description")}
    >
      <CommandInput placeholder={t("command.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("command.empty")}</CommandEmpty>
        {navGroups.map((group) => (
          <CommandGroup key={group.titleKey} heading={t(group.titleKey)}>
            {group.items.map((item) => (
              <CommandItem
                key={item.url}
                value={`${t(group.titleKey)} ${t(item.titleKey)}`}
                onSelect={() => {
                  runCommand(() => router.push(item.url));
                }}
              >
                <div className="flex size-4 items-center justify-center">
                  <ArrowRight className="size-2 text-muted-foreground/80" />
                </div>
                {t(item.titleKey)}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading={t("command.theme")}>
          <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
            <Sun />
            <span>{t("theme.light")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
            <Moon className="scale-90" />
            <span>{t("theme.dark")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
            <Laptop />
            <span>{t("theme.system")}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
