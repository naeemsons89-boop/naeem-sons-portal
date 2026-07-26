import { redirect } from "next/navigation";

import { UsersAdminClient } from "@/components/users-admin-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/types/database";

export default async function UsersAdminPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "approveUsers")) {
    redirect("/app");
  }

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="Users & invites"
      />
      <UsersAdminClient initialUsers={(users ?? []) as Profile[]} />
    </div>
  );
}
