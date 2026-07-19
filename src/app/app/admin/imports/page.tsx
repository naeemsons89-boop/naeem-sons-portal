import { redirect } from "next/navigation";

import { ImportsClient } from "@/components/imports-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

export default async function ImportsPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "csvUpload")) {
    redirect("/app");
  }

  return (
    <div>
      <PageHeader
        title="CSV imports"
        description="Admin only. Upload SKU price list, opening inventory (with pricing), and customer opening balances."
      />
      <ImportsClient />
    </div>
  );
}
