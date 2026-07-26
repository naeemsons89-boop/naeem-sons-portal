import type { SupabaseClient } from "@supabase/supabase-js";

import { safeNextPath } from "@/lib/auth-paths";

type ProfileStatus = { status: string | null; role: string | null } | null;

/** After password/OTP login: MFA challenge if needed, else approved app or pending. */
export async function routeAfterSignIn(
  supabase: SupabaseClient,
  userId: string,
  nextParam: string | null,
): Promise<string> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
    const next = safeNextPath(nextParam);
    return `/mfa?next=${encodeURIComponent(next)}`;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status,role")
    .eq("id", userId)
    .maybeSingle();

  const row = profile as ProfileStatus;
  if (row?.status === "approved" && row.role) {
    return safeNextPath(nextParam);
  }
  if (row?.status === "rejected" || row?.status === "suspended") {
    return "/app";
  }
  return "/pending";
}
