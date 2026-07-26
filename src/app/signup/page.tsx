"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { PasswordStrength } from "@/components/password-strength";
import { Button, Card, Input, Label, TextLink } from "@/components/ui";
import { checkPassword, passwordsMatch } from "@/lib/password";
import { routeAfterSignIn } from "@/lib/post-login";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const strength = checkPassword(password);
    if (!strength.ok) {
      setError(strength.message);
      return;
    }
    if (!passwordsMatch(password, confirm)) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const emailNorm = email.trim().toLowerCase();
    const { data, error: authError } = await supabase.auth.signUp({
      email: emailNorm,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone: phone.trim() || undefined,
        },
      },
    });
    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    if (data.session?.user) {
      if (phone.trim()) {
        await supabase
          .from("profiles")
          .update({ phone: phone.trim() })
          .eq("id", data.session.user.id);
      }
      const dest = await routeAfterSignIn(supabase, data.session.user.id, null);
      setLoading(false);
      router.push(dest);
      router.refresh();
      return;
    }

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
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="03XX-XXXXXXX"
              autoComplete="tel"
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
            <PasswordStrength password={password} />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
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
