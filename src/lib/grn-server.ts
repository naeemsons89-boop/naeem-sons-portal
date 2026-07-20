import { addDays, lineUnits, type GrnLineInput } from "@/lib/grn";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export function canTouchGrn(role: AppRole | null | undefined) {
  return (
    can(role, "physicalReceive") ||
    can(role, "postFinance") ||
    can(role, "createPicklist")
  );
}

export async function insertGrnLines(
  admin: ReturnType<typeof createServiceClient>,
  grnId: string,
  lines: GrnLineInput[],
) {
  const skuIds = [...new Set(lines.map((l) => l.sku_id))];
  const { data: skus, error: skuError } = await admin
    .from("skus")
    .select(
      "id,packs_per_carton,purchase_price_pack,purchase_price_ctn,default_shelf_life_days",
    )
    .in("id", skuIds);
  if (skuError) throw new Error(skuError.message);
  const skuMap = new Map((skus ?? []).map((s) => [s.id, s]));

  const rows = lines.map((line, idx) => {
    const sku = skuMap.get(line.sku_id);
    if (!sku) throw new Error(`Unknown SKU ${line.sku_id}`);
    if (!line.batch_code?.trim()) {
      throw new Error(`Line ${idx + 1}: batch code required`);
    }

    const ppc = sku.packs_per_carton || 1;
    const qty_units = lineUnits({
      qty_cases: line.qty_cases,
      qty_units: line.qty_units,
      packs_per_carton: ppc,
    });
    if (qty_units <= 0) throw new Error(`Line ${idx + 1}: quantity must be > 0`);

    let expiry = line.expiry_date || null;
    if (!expiry && line.mfg_date && sku.default_shelf_life_days) {
      expiry = addDays(line.mfg_date, sku.default_shelf_life_days);
    }

    const purchase_price_pack =
      line.purchase_price_pack ?? sku.purchase_price_pack ?? null;
    const purchase_price_ctn =
      line.purchase_price_ctn ?? sku.purchase_price_ctn ?? null;
    const line_amount =
      purchase_price_pack != null ? Number(purchase_price_pack) * qty_units : null;

    return {
      grn_id: grnId,
      line_no: idx + 1,
      sku_id: line.sku_id,
      po_line_id: line.po_line_id || null,
      batch_code: line.batch_code.trim(),
      mfg_date: line.mfg_date || null,
      expiry_date: expiry,
      qty_cases: line.qty_cases ?? 0,
      qty_units,
      shortage_units: line.shortage_units ?? 0,
      damage_units: line.damage_units ?? 0,
      purchase_price_pack,
      purchase_price_ctn,
      line_amount,
      finance_status: "pending" as const,
    };
  });

  const { error } = await admin.from("grn_lines").insert(rows);
  if (error) throw new Error(error.message);
}
