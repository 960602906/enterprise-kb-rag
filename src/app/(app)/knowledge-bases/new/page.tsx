"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewKnowledgeBasePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "Create failed",
        );
        return;
      }
      toast.success("Created / 已创建");
      router.push(`/knowledge-bases/${data.item.id}`);
    } catch {
      toast.error("Create failed / 创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg animate-fade-up space-y-6">
      <Link
        href="/knowledge-bases"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>
      <div>
        <h1 className="font-heading text-3xl font-semibold">New knowledge base</h1>
        <p className="mt-1 text-sm text-muted-foreground">新建知识库</p>
      </div>
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-border/80 bg-card/80 p-6"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name / 名称</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Description / 描述</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
          />
        </div>
        <Button type="submit" disabled={creating || !name.trim()}>
          {creating ? (
            <>
              <Loader2 className="animate-spin" />
              Creating…
            </>
          ) : (
            "Create / 创建"
          )}
        </Button>
      </form>
    </div>
  );
}
