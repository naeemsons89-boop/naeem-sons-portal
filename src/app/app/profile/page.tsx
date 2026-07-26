import { redirect } from "next/navigation";

import { ProfileClient, type MfaFactor } from "@/components/profile-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const { profile } = await getSessionProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const initialMfaFactors: MfaFactor[] =
    factors?.totp.map((f) => ({
      id: f.id,
      status: f.status,
      friendly_name: f.friendly_name ?? undefined,
    })) ?? [];

  return (
    <div>
      <PageHeader
        title="My Profile"
      />
      <ProfileClient profile={profile} initialMfaFactors={initialMfaFactors} />
    </div>
  );
}
