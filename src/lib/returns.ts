import type { SupabaseClient } from "@supabase/supabase-js";

import { adjustStock } from "@/lib/stock";

export async function postReturn(
  admin: SupabaseClient,
  returnId: string,
  userId: string,
  allowUnknown: boolean,
) {
  const { data: receipt } = await admin
    .from("return_receipts")
    .select("*")
    .eq("id", returnId)
    .maybeSingle();
  if (!receipt) throw new Error("Return not found");
  if (receipt.posted_at) throw new Error("Already posted");

  if (receipt.requires_unknown_batch_approval && !allowUnknown) {
    throw new Error("Manager approval required for unknown batch");
  }

  const { data: lines } = await admin
    .from("return_lines")
    .select("*")
    .eq("return_id", returnId);

  for (const line of lines ?? []) {
    if (!line.batch_id) throw new Error("Missing batch on return line");
    await adjustStock(admin, {
      warehouse_id: receipt.warehouse_id,
      sku_id: line.sku_id,
      batch_id: line.batch_id,
      condition: line.condition,
      finance_status: "posted",
      qty_delta: Number(line.qty_units),
    });
    await admin.from("stock_movements").insert({
      movement_type: "return_in",
      warehouse_id: receipt.warehouse_id,
      sku_id: line.sku_id,
      batch_id: line.batch_id,
      condition: line.condition,
      qty_units: Number(line.qty_units),
      finance_status: "posted",
      document_type: "return",
      document_id: returnId,
      document_no: receipt.return_no,
      created_by: userId,
    });
  }

  await admin
    .from("return_receipts")
    .update({
      status: "posted",
      posted_at: new Date().toISOString(),
      posted_by: userId,
      unknown_batch_approved_by: receipt.requires_unknown_batch_approval
        ? userId
        : null,
      requires_unknown_batch_approval: false,
    })
    .eq("id", returnId);
}
