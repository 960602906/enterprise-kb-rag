import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { AppHeader } from "@/components/layout/app-header";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

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
      <AppHeader
        email={session.user.email ?? ""}
        signOutAction={signOutAction}
      />
      <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}
