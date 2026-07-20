import { redirect } from "next/navigation";

import { GrnDetailClient } from "@/components/grn-detail-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { canTouchGrn } from "@/lib/grn-server";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function GrnDetailPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  if (!canTouchGrn(role)) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: grn } = await admin
    .from("grns")
    .select(
      "*, supplier:suppliers(id,code,name), warehouse:warehouses(id,code,name), po:purchase_orders(id,po_no,status)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!grn) redirect("/app/grn");

  const { data: lines } = await admin
    .from("grn_lines")
    .select(
      "*, sku:skus(id,product_code,description,barcode,packs_per_carton,purchase_price_pack,purchase_price_ctn)",
    )
    .eq("grn_id", id)
    .order("line_no");

  return (
    <div>
      <PageHeader
        title={grn.grn_no as string}
        description={`DN ${(grn.supplier_delivery_no as string) || "—"} · ${grn.delivery_date as string}`}
      />
      <GrnDetailClient
        grn={grn as Record<string, unknown>}
        lines={(lines ?? []) as Record<string, unknown>[]}
        canPhysical={can(role, "physicalReceive")}
        canFinance={can(role, "postFinance")}
      />
    </div>
  );
}
