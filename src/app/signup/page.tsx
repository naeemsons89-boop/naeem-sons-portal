"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Input, Label, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const emailNorm = email.trim().toLowerCase();
    const { data, error: authError } = await supabase.auth.signUp({
      email: emailNorm,
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });
    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    // If session exists, route by approval status
    if (data.session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status,role")
        .eq("id", data.session.user.id)
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

    // No session (email confirm required) — ask user to log in after confirming
    setLoading(false);
    router.push("/login?registered=1");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Request access
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Admin will approve your account and assign a role.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
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
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--ink-muted)]">
          Already registered? <TextLink href="/login">Log in</TextLink>
        </p>
      </Card>
    </main>
  );
}
