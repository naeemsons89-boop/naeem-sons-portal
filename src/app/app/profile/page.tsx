import { redirect } from "next/navigation";

import { ProfileClient } from "@/components/profile-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";

export default async function ProfilePage() {
  const { profile } = await getSessionProfile();
  if (!profile) redirect("/login");

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="Update your photo and personal information."
      />
      <ProfileClient profile={profile} />
    </div>
  );
}
