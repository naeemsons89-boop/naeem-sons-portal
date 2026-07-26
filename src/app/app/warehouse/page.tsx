import { redirect } from "next/navigation";

import { WarehouseClient } from "@/components/warehouse-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

export default async function WarehousePage() {
  const { profile } = await getSessionProfile();
  if (!profile) redirect("/login");

  return (
    <div>
      <PageHeader
        title="Warehouse structure"
      />
      <WarehouseClient
        canManage={can(profile.role as AppRole, "manageWarehouseStructure")}
      />
    </div>
  );
}
