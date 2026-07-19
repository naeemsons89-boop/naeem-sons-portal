import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, profile } = await getSessionProfile();

  if (!userId) {
    redirect("/login");
  }

  if (!profile || profile.status === "pending") {
    redirect("/pending");
  }

  if (profile.status === "rejected" || profile.status === "suspended") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <h1 className="text-xl font-bold">Access blocked</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Your account status is <strong>{profile.status}</strong>.
            {profile.rejection_reason
              ? ` Reason: ${profile.rejection_reason}`
              : " Contact Admin."}
          </p>
        </Card>
      </main>
    );
  }

  if (profile.status !== "approved" || !profile.role) {
    redirect("/pending");
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
