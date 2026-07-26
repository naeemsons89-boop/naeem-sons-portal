import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { Button, Card } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";

export default async function PendingPage() {
  const { userId, profile } = await getSessionProfile();

  if (userId && profile?.status === "approved" && profile.role) {
    redirect("/app");
  }

  const isLoggedIn = Boolean(userId);
  const blocked =
    profile?.status === "rejected" || profile?.status === "suspended";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          {blocked
            ? "Access blocked"
            : isLoggedIn
              ? "Waiting for approval"
              : "Almost there"}
        </h1>
        <p className="mt-3 text-sm text-[var(--ink-muted)]">
          {blocked
            ? `Your account is ${profile?.status}.${
                profile?.rejection_reason ? ` ${profile.rejection_reason}` : " Contact Admin."
              }`
            : isLoggedIn
              ? "Your signup is registered. An Admin must approve your account and assign a role before you can use the portal."
              : "Your account exists. Log in with your email and password to continue."}
        </p>
        {profile && !blocked ? (
          <p className="mt-2 text-xs uppercase tracking-wide text-[var(--accent)]">
            Status: {profile.status}
            {profile.role ? ` · ${profile.role}` : ""}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-2">
          {!isLoggedIn ? (
            <Link href="/login">
              <Button variant="secondary">Log in</Button>
            </Link>
          ) : null}
          {isLoggedIn && !blocked ? (
            <Link href="/app">
              <Button>Check status</Button>
            </Link>
          ) : null}
          {isLoggedIn ? (
            <form action={signOutAction}>
              <Button type="submit" variant={blocked ? "secondary" : "ghost"}>
                Sign out
              </Button>
            </form>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
