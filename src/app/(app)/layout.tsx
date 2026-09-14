import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link
              href="/knowledge-bases"
              className="font-heading text-xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
            >
              Atlas KB
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                href="/knowledge-bases"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Knowledge Bases
              </Link>
              <Link
                href="/chat"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Chat
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground md:inline">
              {session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 border-t border-border/50 px-4 py-1 sm:hidden">
          <Link
            href="/knowledge-bases"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground"
          >
            Knowledge Bases
          </Link>
          <Link href="/chat" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground">
            Chat
          </Link>
        </nav>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
