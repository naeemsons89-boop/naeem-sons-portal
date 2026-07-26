import { redirect } from "next/navigation";

import { DownloadReportBar } from "@/components/download-report-bar";
import { StockOpsClient } from "@/components/stock-ops-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function StockOpsPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  if (!can(role, "writeOff")) redirect("/app");

  const supabase = await createClient();
  const admin = createServiceClient();

  const [{ data: warehouses }, { data: balances }] = await Promise.all([
    supabase.from("warehouses").select("id,code,name").eq("is_active", true).order("code"),
    admin
      .from("stock_balances")
      .select(
        "warehouse_id,sku_id,batch_id,condition,finance_status,qty_units,sku:skus(product_code),batch:batches(batch_code)",
      )
      .gt("qty_units", 0)
      .limit(800),
  ]);

  const stock = (balances ?? []).map((b) => {
    const sku = b.sku as unknown as { product_code?: string } | null;
    const batch = b.batch as unknown as { batch_code?: string } | null;
    return {
      warehouse_id: b.warehouse_id as string,
      sku_id: b.sku_id as string,
      batch_id: b.batch_id as string,
      condition: b.condition as string,
      finance_status: b.finance_status as string,
      qty_units: Number(b.qty_units),
      product_code: sku?.product_code ?? "",
      batch_code: batch?.batch_code ?? "",
    };
  });

  return (
    <div>
      <PageHeader
        title="Adjust / Transfer"
        download={
          <DownloadReportBar
            reportType="movements"
            documentType="adjustment,transfer"
            canExport={can(role, "exportPdfCsv")}
            title="Download report"
          />
        }
      />
      <StockOpsClient
        stock={stock}
        warehouses={(warehouses ?? []) as { id: string; code: string; name: string }[]}
      />
    </div>
  );
}
