import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function getSessionProfile(): Promise<{
  userId: string | null;
  profile: Profile | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { userId: null, profile: null };

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  let profile = (data as Profile | null) ?? null;

  // Prefer live auth email until DB sync trigger has run.
  if (profile && user.email) {
    const authEmail = user.email.toLowerCase();
    if (profile.email !== authEmail) {
      profile = { ...profile, email: authEmail };
    }
  }

  return { userId: user.id, profile };
}
