import { redirect } from "next/navigation";

import { PicklistDetailClient } from "@/components/picklist-detail-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canTouchPicklist } from "@/lib/picklist-server";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PicklistDetailPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  if (!canTouchPicklist(role)) redirect("/app");

  const { id } = await params;

  return (
    <div>
      <PageHeader
        title="Picklist"
        description="Pick with FEFO → manager issues unique gate pass → load-in returns."
      />
      <PicklistDetailClient
        picklistId={id}
        canPick={can(role, "scanPick")}
        canGatePass={can(role, "approveGatePass")}
        canLoadIn={can(role, "scanPick") || can(role, "approveGatePass")}
      />
    </div>
  );
}
