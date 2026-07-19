import { redirect } from "next/navigation";

import { ReturnDetailClient } from "@/components/return-detail-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function ReturnDetailPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "returns")) redirect("/app");
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Return detail" />
      <ReturnDetailClient
        id={id}
        canApprove={can(profile?.role as AppRole, "approveUnknownBatch")}
      />
    </div>
  );
}
