import { redirect } from "next/navigation";

import { DownloadReportBar } from "@/components/download-report-bar";
import { PoListClient } from "@/components/po-list-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canTouchPo } from "@/lib/po-server";
import type { AppRole } from "@/types/database";

type Props = { searchParams: Promise<{ po_id?: string }> };

export default async function PurchaseOrdersPage({ searchParams }: Props) {
  const { profile } = await getSessionProfile();
  if (!canTouchPo(profile?.role as AppRole)) redirect("/app");

  const { po_id: initialPoId } = await searchParams;
  const role = profile?.role as AppRole;

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        download={
          <DownloadReportBar reportType="po" canExport={can(role, "exportPdfCsv")} />
        }
      />
      <PoListClient
        canCreate={can(role, "createPo")}
        initialPoId={initialPoId}
      />
    </div>
  );
}
