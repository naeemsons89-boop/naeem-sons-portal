import { can } from "@/lib/permissions";
import {
  derivePoStatus,
  remainingUnits,
  uomToUnits,
  type PoLineInput,
  type PoStatus,
  type PoUom,
} from "@/lib/po";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export function canTouchPo(role: AppRole | null | undefined) {
  return can(role, "createPo") || can(role, "editPo") || can(role, "physicalReceive");
}

export async function isPoLocked(
  admin: ReturnType<typeof createServiceClient>,
  poId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("grns")
    .select("id")
    .eq("po_id", poId)
    .not("physical_posted_at", "is", null)
    .limit(1);
  return Boolean(data?.length);
}

export async function buildPoLineRows(
  admin: ReturnType<typeof createServiceClient>,
  _supplierId: string,
  lines: PoLineInput[],
) {
  if (!lines.length) throw new Error("Add at least one line");

  const skuIds = [...new Set(lines.map((l) => l.sku_id))];
  const { data: skus, error: skuError } = await admin
    .from("skus")
    .select("id, packs_per_carton, purchase_price_pack, is_active")
    .in("id", skuIds);
  if (skuError) throw new Error(skuError.message);
  const skuMap = new Map((skus ?? []).map((s) => [s.id, s]));

  return lines.map((line, idx) => {
    const sku = skuMap.get(line.sku_id);
    if (!sku || !sku.is_active) throw new Error(`Unknown or inactive SKU on line ${idx + 1}`);

    const uom = line.uom as PoUom;
    if (!["pcs", "pack", "carton"].includes(uom)) {
      throw new Error(`Line ${idx + 1}: invalid UOM`);
    }
    const qty = Number(line.qty_ordered);
    if (!(qty > 0)) throw new Error(`Line ${idx + 1}: quantity must be > 0`);

    const unit_price =
      line.unit_price != null && !Number.isNaN(Number(line.unit_price))
        ? Number(line.unit_price)
        : Number(sku.purchase_price_pack ?? 0);

    const qty_ordered_units = uomToUnits(qty, uom, sku.packs_per_carton || 1);
    const line_amount = Number((unit_price * qty).toFixed(2));

    return {
      line_no: idx + 1,
      sku_id: line.sku_id,
      uom,
      qty_ordered: qty,
      qty_ordered_units,
      qty_received_units: 0,
      unit_price,
      line_amount,
    };
  });
}

export async function applyPoReceive(
  admin: ReturnType<typeof createServiceClient>,
  poId: string,
  increments: { po_line_id: string; qty_units: number }[],
) {
  if (!increments.length) return;

  const { data: lines, error } = await admin
    .from("purchase_order_lines")
    .select("id, qty_ordered_units, qty_received_units")
    .eq("po_id", poId);
  if (error) throw new Error(error.message);
  if (!lines?.length) throw new Error("PO has no lines");

  const byId = new Map(lines.map((l) => [l.id, l]));

  for (const inc of increments) {
    if (!inc.po_line_id || !(inc.qty_units > 0)) continue;
    const line = byId.get(inc.po_line_id);
    if (!line) throw new Error(`PO line not found: ${inc.po_line_id}`);

    const rem = remainingUnits(line);
    if (inc.qty_units > rem + 1e-9) {
      throw new Error(
        `Receive qty exceeds remaining on PO line (${inc.qty_units} > ${rem})`,
      );
    }

    const nextReceived = Number(line.qty_received_units) + Number(inc.qty_units);
    const { error: updError } = await admin
      .from("purchase_order_lines")
      .update({ qty_received_units: nextReceived })
      .eq("id", line.id);
    if (updError) throw new Error(updError.message);

    line.qty_received_units = nextReceived;
  }

  const { data: po } = await admin
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .maybeSingle();

  const nextStatus = derivePoStatus(
    lines.map((l) => ({
      qty_ordered_units: Number(l.qty_ordered_units),
      qty_received_units: Number(l.qty_received_units),
    })),
    (po?.status as PoStatus) ?? "pending",
  );

  await admin
    .from("purchase_orders")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", poId);
}
