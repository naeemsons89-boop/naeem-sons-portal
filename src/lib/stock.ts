import type { SupabaseClient } from "@supabase/supabase-js";

/** Adjust stock qty for a warehouse/sku/batch/condition/finance bucket */
export async function adjustStock(
  admin: SupabaseClient,
  args: {
    warehouse_id: string;
    sku_id: string;
    batch_id: string;
    condition: "good" | "near_expiry" | "damaged" | "hold";
    finance_status: "pending" | "posted";
    qty_delta: number;
    bin_id?: string | null;
  },
) {
  if (args.qty_delta === 0) return;

  let q = admin
    .from("stock_balances")
    .select("id,qty_units")
    .eq("warehouse_id", args.warehouse_id)
    .eq("sku_id", args.sku_id)
    .eq("batch_id", args.batch_id)
    .eq("condition", args.condition)
    .eq("finance_status", args.finance_status);

  if (args.bin_id) q = q.eq("bin_id", args.bin_id);
  else q = q.is("bin_id", null);

  const { data: existing, error: findError } = await q.maybeSingle();
  if (findError) throw new Error(findError.message);

  if (!existing) {
    if (args.qty_delta < 0) {
      throw new Error("Insufficient stock for adjustment");
    }
    const { error } = await admin.from("stock_balances").insert({
      warehouse_id: args.warehouse_id,
      bin_id: args.bin_id ?? null,
      sku_id: args.sku_id,
      batch_id: args.batch_id,
      condition: args.condition,
      qty_units: args.qty_delta,
      finance_status: args.finance_status,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const next = Number(existing.qty_units) + args.qty_delta;
  if (next < 0) throw new Error("Insufficient stock for adjustment");

  const { error } = await admin
    .from("stock_balances")
    .update({ qty_units: next, updated_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
}
