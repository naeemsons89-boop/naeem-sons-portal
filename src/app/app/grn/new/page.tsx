import { redirect } from "next/navigation";

import { GrnCreateForm } from "@/components/grn-create-form";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { canTouchGrn } from "@/lib/grn-server";
import { remainingUnits } from "@/lib/po";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

type Props = { searchParams: Promise<{ po_id?: string }> };

export default async function NewGrnPage({ searchParams }: Props) {
  const { profile } = await getSessionProfile();
  if (!canTouchGrn(profile?.role as AppRole)) redirect("/app");

  const { po_id: initialPoId } = await searchParams;
  const supabase = await createClient();

  const { data: openPosRaw } = await supabase
    .from("purchase_orders")
    .select(
      "id,po_no,status,order_date,supplier:suppliers(id,code,name),lines:purchase_order_lines(qty_ordered_units,qty_received_units)",
    )
    .in("status", ["pending", "partial"])
    .order("created_at", { ascending: false })
    .limit(100);

  const openPos = ((openPosRaw ?? []) as Array<{
    id: string;
    po_no: string;
    status: string;
    order_date: string;
    supplier: { id?: string; code?: string; name?: string } | null;
    lines: { qty_ordered_units: number; qty_received_units: number }[] | null;
  }>)
    .filter((po) => {
      const lines = po.lines ?? [];
      return lines.some((l) => remainingUnits(l) > 0);
    })
    .map((po) => ({
      id: po.id,
      po_no: po.po_no,
      status: po.status,
      order_date: po.order_date,
      supplier: po.supplier,
    }));

  let initialLines:
    | {
        id: string;
        line_no: number;
        sku_id: string;
        uom: string;
        qty_ordered: number;
        qty_ordered_units: number;
        qty_received_units: number;
        unit_price: number;
        sku: {
          id: string;
          product_code: string;
          description: string;
          packs_per_carton: number;
          default_shelf_life_days: number | null;
        } | null;
      }[]
    | undefined;

  const selectedId =
    initialPoId && openPos.some((p) => p.id === initialPoId)
      ? initialPoId
      : openPos[0]?.id;

  if (selectedId) {
    const { data: lines } = await supabase
      .from("purchase_order_lines")
      .select(
        "id,line_no,sku_id,uom,qty_ordered,qty_ordered_units,qty_received_units,unit_price,sku:skus(id,product_code,description,packs_per_carton,default_shelf_life_days)",
      )
      .eq("po_id", selectedId)
      .order("line_no");
    initialLines = (lines ?? []) as typeof initialLines;
  }

  return (
    <div>
      <PageHeader
        title="New GRN"
        description="Select a purchase order, enter batch/QC details, then receive into warehouse."
      />
      {openPos.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">
          No open purchase orders with remaining quantity. Create a PO first.
        </p>
      ) : (
        <GrnCreateForm
          openPos={openPos}
          initialPoId={selectedId}
          initialLines={initialLines}
        />
      )}
    </div>
  );
}
