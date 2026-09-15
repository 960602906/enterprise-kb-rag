"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n";

export default function SettingsPage() {
  const { t } = useI18n();
  const { data } = useSession();
  const email = data?.user?.email ?? "";
  const name = data?.user?.name ?? "";

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />
      <Separator className="my-2" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.language")}</CardTitle>
            <CardDescription>{t("settings.languageBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.appearance")}</CardTitle>
            <CardDescription>{t("settings.appearanceBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <ThemeSwitch />
            <span className="text-sm text-muted-foreground">
              {t("theme.toggle")}
            </span>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("settings.account")}</CardTitle>
            <CardDescription>{t("settings.signedInAs")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {name ? <p className="font-medium">{name}</p> : null}
            {email ? (
              <p className="text-muted-foreground">{email}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5" />
              {t("settings.apiKeys")}
            </CardTitle>
            <CardDescription>{t("settings.apiKeysBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/settings/api-keys">{t("settings.apiKeysLink")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
