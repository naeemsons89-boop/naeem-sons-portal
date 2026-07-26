import { NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth-paths";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const type = searchParams.get("type");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      if (type === "recovery" || next.includes("reset-password")) {
        const url = new URL("/forgot-password", origin);
        url.searchParams.set("error", "recovery_failed");
        return NextResponse.redirect(url);
      }
      const url = new URL("/login", origin);
      url.searchParams.set("error", "auth_callback_failed");
      return NextResponse.redirect(url);
    }

    // After magic link / invite, enforce MFA if enrolled
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
      return NextResponse.redirect(
        `${origin}/mfa?next=${encodeURIComponent(next)}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
