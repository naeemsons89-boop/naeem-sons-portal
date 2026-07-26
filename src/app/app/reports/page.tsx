import { redirect } from "next/navigation";

import { ReportsClient } from "@/components/reports-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

export default async function ReportsPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "viewReports")) redirect("/app");

  return (
    <div>
      <PageHeader
        title="Reports"
      />
      <ReportsClient canExport={can(profile?.role as AppRole, "exportPdfCsv")} />
    </div>
  );
}
