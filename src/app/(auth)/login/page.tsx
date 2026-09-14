"use client";

import { useActionState, useState } from "react";
import { loginAction, registerAction, type AuthFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useI18n, type MessageKey } from "@/lib/i18n";

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
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--atmosphere-to)_55%,transparent),transparent_70%)]"
      />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <LanguageToggle />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 text-center">
          <p className="font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("brand.name")}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("brand.tagline")}
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="mb-6 flex gap-1 rounded-lg bg-muted/80 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === "login"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("auth.signIn")}
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === "register"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("auth.register")}
            </button>
          </div>

          {/*
            Progressive enhancement: form action is a Server Action.
            Works even if client JS/hydration fails (native POST to RSC endpoint).
          */}
          <form key={mode} action={action} method="post" className="space-y-4">
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
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {t(`auth.errors.${state.error}` as MessageKey)}
              </p>
            ) : null}

            <Button type="submit" className="w-full" size="lg" disabled={pending}>
              {pending
                ? t("auth.wait")
                : mode === "login"
                  ? t("auth.continue")
                  : t("auth.createAccount")}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("brand.internalUse")}
        </p>
      </div>
    </main>
  );
}
