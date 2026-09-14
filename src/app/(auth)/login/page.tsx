"use client";

import { useActionState, useState } from "react";
import { Command } from "lucide-react";
import { loginAction, registerAction, type AuthFormState } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const initialState: AuthFormState = {};

export default function LoginPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginState, loginFormAction, loginPending] = useActionState(
    loginAction,
    initialState,
  );
  const [registerState, registerFormAction, registerPending] = useActionState(
    registerAction,
    initialState,
  );

  const pending = mode === "login" ? loginPending : registerPending;
  const state = mode === "login" ? loginState : registerState;
  const action = mode === "login" ? loginFormAction : registerFormAction;

  return (
    <div className="container grid h-svh max-w-none items-center justify-center">
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 sm:top-6 sm:right-6">
        <LanguageToggle />
        <ThemeSwitch />
      </div>

      <div className="mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:p-8">
        <div className="mb-4 flex items-center justify-center">
          <div className="me-2 flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="size-4" />
          </div>
          <h1 className="text-xl font-medium">{t("brand.name")}</h1>
        </div>

        <Card className="mx-auto w-full max-w-sm gap-4">
          <CardHeader>
            <CardTitle className="text-lg tracking-tight">
              {mode === "login" ? t("auth.welcome") : t("auth.register")}
            </CardTitle>
            <CardDescription>
              {mode === "login" ? t("auth.welcomeBody") : t("auth.registerBody")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-0.5 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === "login"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("auth.signIn")}
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === "register"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("auth.register")}
              </button>
            </div>

            <form key={mode} action={action} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t("auth.name")}</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder={t("auth.namePlaceholder")}
                    autoComplete="name"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={mode === "register" ? 8 : 6}
                  placeholder={
                    mode === "register" ? t("auth.passwordMin") : "••••••••"
                  }
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                />
              </div>

              {state?.error ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
                >
                  {t(`auth.errors.${state.error}` as MessageKey)}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending
                  ? t("auth.wait")
                  : mode === "login"
                    ? t("auth.continue")
                    : t("auth.createAccount")}
              </Button>
            </form>
          </CardContent>
          <CardFooter>
            <p className="w-full px-2 text-center text-sm text-muted-foreground">
              {t("brand.internalUse")}
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
