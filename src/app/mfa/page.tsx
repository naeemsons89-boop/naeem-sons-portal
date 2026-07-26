"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button, Card, Input, Label, TextLink } from "@/components/ui";
import { safeNextPath } from "@/lib/auth-paths";
import { createClient } from "@/lib/supabase/client";

function MfaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setLoading(false);
      setError(listError.message);
      return;
    }

    const totp = factors.totp.find((f) => f.status === "verified") ?? factors.totp[0];
    if (!totp) {
      setLoading(false);
      setError("No authenticator found on this account. Sign in again or contact admin.");
      return;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: totp.id,
    });
    if (challengeError || !challenge) {
      setLoading(false);
      setError(challengeError?.message ?? "Could not start verification");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Two-factor verification
      </h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Enter the 6-digit code from your authenticator app.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="code">Authentication code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
          />
        </div>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
          {loading ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--ink-muted)]">
        <TextLink href="/login">Back to log in</TextLink>
      </p>
    </Card>
  );
}

export default function MfaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<Card className="w-full max-w-md">Loading…</Card>}>
        <MfaForm />
      </Suspense>
    </main>
  );
}
