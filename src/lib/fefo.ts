import type { SupabaseClient } from "@supabase/supabase-js";

export type FefoBatch = {
  batch_id: string;
  batch_code: string;
  mfg_date: string | null;
  expiry_date: string | null;
  qty_units: number;
};

/** FEFO: earliest expiry first among finance-posted good stock */
export async function suggestFefoBatch(
  admin: SupabaseClient,
  warehouseId: string,
  skuId: string,
  neededUnits: number,
): Promise<FefoBatch | null> {
  const { data, error } = await admin
    .from("stock_balances")
    .select(
      "qty_units,batch_id,batch:batches(id,batch_code,mfg_date,expiry_date)",
    )
    .eq("warehouse_id", warehouseId)
    .eq("sku_id", skuId)
    .eq("condition", "good")
    .eq("finance_status", "posted")
    .gt("qty_units", 0);

  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  const rows = data
    .map((r) => {
      const batch = r.batch as unknown as {
        id: string;
        batch_code: string;
        mfg_date: string | null;
        expiry_date: string | null;
      } | null;
      if (!batch?.id) return null;
      return {
        batch_id: batch.id,
        batch_code: batch.batch_code,
        mfg_date: batch.mfg_date,
        expiry_date: batch.expiry_date,
        qty_units: Number(r.qty_units),
      } satisfies FefoBatch;
    })
    .filter(Boolean) as FefoBatch[];

  rows.sort((a, b) => {
    const ae = a.expiry_date || "9999-12-31";
    const be = b.expiry_date || "9999-12-31";
    if (ae !== be) return ae.localeCompare(be);
    const am = a.mfg_date || "0000-01-01";
    const bm = b.mfg_date || "0000-01-01";
    return am.localeCompare(bm);
  });

  // Prefer a single batch that can cover need; else earliest expiry with any qty
  const cover = rows.find((r) => r.qty_units >= neededUnits);
  return cover ?? rows[0] ?? null;
}

export async function listPickableBatches(
  admin: SupabaseClient,
  warehouseId: string,
  skuId: string,
): Promise<FefoBatch[]> {
  const { data, error } = await admin
    .from("stock_balances")
    .select(
      "qty_units,batch:batches(id,batch_code,mfg_date,expiry_date)",
    )
    .eq("warehouse_id", warehouseId)
    .eq("sku_id", skuId)
    .eq("condition", "good")
    .eq("finance_status", "posted")
    .gt("qty_units", 0);

  if (error) throw new Error(error.message);

  const rows = (data ?? [])
    .map((r) => {
      const batch = r.batch as unknown as {
        id: string;
        batch_code: string;
        mfg_date: string | null;
        expiry_date: string | null;
      } | null;
      if (!batch?.id) return null;
      return {
        batch_id: batch.id,
        batch_code: batch.batch_code,
        mfg_date: batch.mfg_date,
        expiry_date: batch.expiry_date,
        qty_units: Number(r.qty_units),
      } satisfies FefoBatch;
    })
    .filter(Boolean) as FefoBatch[];

  rows.sort((a, b) =>
    (a.expiry_date || "9999-12-31").localeCompare(b.expiry_date || "9999-12-31"),
  );
  return rows;
}
