"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button, Card, Input, Label, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status,role")
        .eq("id", userId)
        .maybeSingle();
      setLoading(false);
      if (profile?.status === "approved" && profile.role) {
        router.push("/app");
      } else {
        router.push("/pending");
      }
      router.refresh();
      return;
    }

    setLoading(false);
    router.push("/app");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Log in
      </h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Naeem & Sons warehouse portal
      </p>
      {registered ? (
        <p className="mt-3 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm text-[var(--brand-dark)]">
          Account created. Log in with the same email and password.
        </p>
      ) : null}
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
        </div>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
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
