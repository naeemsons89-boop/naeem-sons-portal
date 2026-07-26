import { redirect } from "next/navigation";

import { MastersClient } from "@/components/masters-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

export default async function MastersPage() {
  const { profile } = await getSessionProfile();
  if (!profile) redirect("/login");

  return (
    <div>
      <PageHeader
        title="Masters"
      />
      <MastersClient canEdit={can(profile.role as AppRole, "manageMasters")} />
    </div>
  );
}
