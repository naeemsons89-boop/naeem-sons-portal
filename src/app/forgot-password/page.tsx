"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button, Card, Input, Label, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const linkFailed = searchParams.get("error") === "recovery_failed";
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      },
    );
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Forgot password
      </h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        We will email you a secure link to set a new password.
      </p>
      {linkFailed ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          That recovery link failed or expired. Request a new email below.
        </p>
      ) : null}

      {sent ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm text-[var(--brand-dark)]">
            If an account exists for <strong>{email.trim().toLowerCase()}</strong>, a
            recovery email is on the way. Check inbox and spam, then open the link.
          </p>
          <p className="text-center text-sm text-[var(--ink-muted)]">
            <TextLink href="/login">Back to log in</TextLink>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send recovery email"}
          </Button>
          <p className="text-center text-sm text-[var(--ink-muted)]">
            Remembered it? <TextLink href="/login">Log in</TextLink>
          </p>
        </form>
      )}
    </Card>
  );
}

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<Card className="w-full max-w-md">Loading…</Card>}>
        <ForgotPasswordForm />
      </Suspense>
    </main>
  );
}
