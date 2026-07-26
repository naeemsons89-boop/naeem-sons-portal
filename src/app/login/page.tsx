"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button, Card, Input, Label, TextLink } from "@/components/ui";
import { safeNextPath } from "@/lib/auth-paths";
import { routeAfterSignIn } from "@/lib/post-login";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "magic";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";
  const magicSent = searchParams.get("magic") === "1";
  const callbackFailed = searchParams.get("error") === "auth_callback_failed";
  const nextParam = searchParams.get("next");

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    magicSent ? "Check your email for the sign-in link." : null,
  );
  const [loading, setLoading] = useState(false);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    let data: Awaited<
      ReturnType<typeof supabase.auth.signInWithPassword>
    >["data"];
    let authError: Awaited<
      ReturnType<typeof supabase.auth.signInWithPassword>
    >["error"];
    try {
      ({ data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      }));
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Sign in failed";
      setError(
        msg === "Failed to fetch"
          ? "Cannot reach Supabase (network/DNS). Check internet, or set DNS to 1.1.1.1 / 8.8.8.8, then retry."
          : msg,
      );
      return;
    }
    if (authError) {
      setLoading(false);
      setError(
        authError.message === "Failed to fetch"
          ? "Cannot reach Supabase (network/DNS). Check internet, or set DNS to 1.1.1.1 / 8.8.8.8, then retry."
          : authError.message,
      );
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setLoading(false);
      router.push(safeNextPath(nextParam));
      router.refresh();
      return;
    }

    const dest = await routeAfterSignIn(supabase, userId, nextParam);
    setLoading(false);
    router.push(dest);
    router.refresh();
  }

  async function onMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const next = safeNextPath(nextParam);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: false,
      },
    });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setMessage("If that email has an account, a sign-in link is on the way. Check inbox and spam.");
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Log in
      </h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Naeem & Sons warehouse portal
      </p>

      <div className="mt-4 flex rounded-full border border-[var(--line)] p-1 text-sm">
        <button
          type="button"
          className={`flex-1 rounded-full px-3 py-1.5 font-medium transition ${
            mode === "password"
              ? "bg-[var(--brand-ink)] text-white"
              : "text-[var(--ink-muted)]"
          }`}
          onClick={() => {
            setMode("password");
            setError(null);
          }}
        >
          Password
        </button>
        <button
          type="button"
          className={`flex-1 rounded-full px-3 py-1.5 font-medium transition ${
            mode === "magic"
              ? "bg-[var(--brand-ink)] text-white"
              : "text-[var(--ink-muted)]"
          }`}
          onClick={() => {
            setMode("magic");
            setError(null);
          }}
        >
          Email link
        </button>
      </div>

      {registered ? (
        <p className="mt-3 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm text-[var(--brand-dark)]">
          Account created. Log in with the same email and password.
        </p>
      ) : null}
      {callbackFailed ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          That sign-in link failed or expired. Try again with password or a new email link.
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm text-[var(--brand-dark)]">
          {message}
        </p>
      ) : null}

      {mode === "password" ? (
        <form onSubmit={onPasswordSubmit} className="mt-6 space-y-4">
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
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1.5 text-right text-sm">
              <TextLink href="/forgot-password">Forgot password?</TextLink>
            </p>
          </div>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : (
        <form onSubmit={onMagicSubmit} className="mt-6 space-y-4">
          <p className="text-sm text-[var(--ink-muted)]">
            We email a one-time link. No password needed for this sign-in.
          </p>
          <div>
            <Label htmlFor="magicEmail">Email</Label>
            <Input
              id="magicEmail"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send sign-in link"}
          </Button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-[var(--ink-muted)]">
        No account? <TextLink href="/signup">Sign up</TextLink>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<Card className="w-full max-w-md">Loading…</Card>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
