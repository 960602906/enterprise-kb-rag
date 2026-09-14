"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getHelpGuide } from "@/lib/i18n/help-guide";
import { useI18n } from "@/lib/i18n";

export default function HelpPage() {
  const { locale, t } = useI18n();
  const guide = getHelpGuide(locale);

  return (
    <div className="space-y-4">
      <PageHeader title={guide.title} description={guide.subtitle}>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/knowledge-bases/new">{t("overview.createKb")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/chat">{t("overview.quickChat")}</Link>
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-3">
        {guide.sections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {section.body.map((line) => (
                <p key={line} className="text-sm leading-relaxed text-muted-foreground">
                  {line}
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("overview.inviteHint")}</CardTitle>
          <CardDescription>{t("kb.emptyBody")}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
