import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, Card } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";

export default async function PendingPage() {
  const { userId, profile } = await getSessionProfile();

  if (userId && profile?.status === "approved" && profile.role) {
    redirect("/app");
  }

  const isLoggedIn = Boolean(userId);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          {isLoggedIn ? "Waiting for approval" : "Almost there"}
        </h1>
        <p className="mt-3 text-sm text-[var(--ink-muted)]">
          {isLoggedIn
            ? "Your signup is registered. An Admin must approve your account and assign a role before you can use the portal."
            : "Your account exists. Log in with your email and password to continue."}
        </p>
        {profile ? (
          <p className="mt-2 text-xs uppercase tracking-wide text-[var(--accent)]">
            Status: {profile.status}
            {profile.role ? ` · ${profile.role}` : ""}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/login">
            <Button variant="secondary">
              {isLoggedIn ? "Back to login" : "Log in"}
            </Button>
          </Link>
          {isLoggedIn ? (
            <Link href="/app">
              <Button>Check status</Button>
            </Link>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
