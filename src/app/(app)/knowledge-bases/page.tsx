"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, AlertCircle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  role?: "read" | "manage";
  createdAt?: string;
};

export default function KnowledgeBasesPage() {
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-bases");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKb(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
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
      toast.success("Knowledge base created / 知识库已创建");
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/knowledge-bases/${data.item.id}`);
    } catch {
      toast.error("Create failed / 创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Knowledge Bases
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            知识库 · Create, share, and ground answers in your docs
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus data-icon="inline-start" />
              New / 新建
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={createKb}>
              <DialogHeader>
                <DialogTitle>Create knowledge base / 创建知识库</DialogTitle>
                <DialogDescription>
                  You will be the manage-role owner.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="kb-name">Name / 名称</Label>
                  <Input
                    id="kb-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Employee Handbook"
                    required
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-desc">Description / 描述</Label>
                  <Textarea
                    id="kb-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional"
                    rows={3}
                    maxLength={2000}
                  />
                </div>
              </div>
              <DialogFooter className="mt-6">
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
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading knowledge bases…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-4 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Could not load / 加载失败</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground/70" />
          <p className="mt-4 font-heading text-xl font-semibold">No knowledge bases yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            还没有知识库 · Create one to upload docs and start chatting
          </p>
          <Button className="mt-6" onClick={() => setOpen(true)}>
            <Plus data-icon="inline-start" />
            Create first KB
          </Button>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="divide-y divide-border/80 border-y border-border/80">
          {items.map((kb) => (
            <li key={kb.id}>
              <Link
                href={`/knowledge-bases/${kb.id}`}
                className="group flex items-start justify-between gap-4 py-5 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-lg"
              >
                <div className="min-w-0">
                  <p className="font-heading text-lg font-semibold group-hover:text-primary">
                    {kb.name}
                  </p>
                  {kb.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {kb.description}
                    </p>
                  )}
                </div>
                {kb.role && (
                  <Badge variant="secondary" className="shrink-0 capitalize">
                    {kb.role}
                  </Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
