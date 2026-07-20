import { redirect } from "next/navigation";

import { PoListClient } from "@/components/po-list-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canTouchPo } from "@/lib/po-server";
import type { AppRole } from "@/types/database";

export default async function PurchaseOrdersPage() {
  const { profile } = await getSessionProfile();
  if (!canTouchPo(profile?.role as AppRole)) redirect("/app");

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Pending and received POs. Open a row for full details, PDF, or create GRN."
      />
      <PoListClient canCreate={can(profile?.role as AppRole, "createPo")} />
    </div>
  );
}
