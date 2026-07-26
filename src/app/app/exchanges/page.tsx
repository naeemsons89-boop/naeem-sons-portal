import { redirect } from "next/navigation";

import { DownloadReportBar } from "@/components/download-report-bar";
import { ExchangeClient } from "@/components/exchange-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function ExchangesPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  if (!can(role, "focExchange")) redirect("/app");

  const supabase = await createClient();
  const [{ data: customers }, { data: skus }, { data: exchanges }, { data: wh }] =
    await Promise.all([
      supabase.from("customers").select("id,code,name").eq("is_active", true).order("name"),
      supabase
        .from("skus")
        .select("id,product_code,description")
        .eq("is_active", true)
        .order("product_code")
        .limit(500),
      supabase
        .from("exchange_notes")
        .select("id,exchange_no,status")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("warehouses").select("id").eq("code", "MAIN_WHS").maybeSingle(),
    ]);

  if (!wh?.id) {
    return <PageHeader title="Exchange" />;
  }

  return (
    <div>
      <PageHeader
        title="Exchange"
        download={
          <DownloadReportBar
            reportType="exchanges"
            canExport={can(role, "exportPdfCsv")}
          />
        }
      />
      <ExchangeClient
        customers={(customers ?? []) as { id: string; code: string; name: string }[]}
        skus={(skus ?? []) as { id: string; product_code: string; description: string }[]}
        warehouseId={wh.id as string}
        initial={(exchanges ?? []) as Record<string, unknown>[]}
      />
    </div>
  );
}
