"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();

    if (!email || !password) {
      toast.error("Email and password are required / 请填写邮箱和密码");
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            name: name || undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(
            typeof body.error === "string"
              ? body.error
              : "Registration failed / 注册失败",
          );
          return;
        }
        toast.success("Account created / 账号已创建");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Invalid email or password / 邮箱或密码错误");
        return;
      }

      router.push("/knowledge-bases");
      router.refresh();
    } catch {
      toast.error("Something went wrong / 出错了");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 animate-soft-pulse bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--atmosphere-to)_55%,transparent),transparent_70%)]"
      />

      <div className="relative z-10 w-full max-w-md animate-fade-up">
        <div className="mb-10 text-center">
          <p className="font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Atlas KB
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Enterprise knowledge Q&amp;A · 企业知识库问答
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
              Sign in / 登录
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
              Register / 注册
            </button>
          </div>

          <form
            key={mode}
            onSubmit={onSubmit}
            className="space-y-4"
            noValidate={false}
          >
            {mode === "register" && (
              <div className="space-y-2 animate-fade-in">
                <Label htmlFor="name">Name / 姓名</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Optional / 可选"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email / 邮箱</Label>
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
              <Label htmlFor="password">Password / 密码</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={mode === "register" ? 8 : 6}
                placeholder={
                  mode === "register" ? "At least 8 characters" : "••••••••"
                }
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading
                ? "Please wait… / 请稍候…"
                : mode === "login"
                  ? "Continue / 继续"
                  : "Create account / 创建账号"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Internal use only · 仅限企业内部使用
        </p>
      </div>
    </main>
  );
}
