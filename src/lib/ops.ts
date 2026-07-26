import type { SupabaseClient } from "@supabase/supabase-js";

import { nextDocNo } from "@/lib/picklist-server";

export async function ensureMainWarehouse(admin: SupabaseClient) {
  const { data } = await admin
    .from("warehouses")
    .select("id")
    .eq("code", "MAIN_WHS")
    .maybeSingle();
  if (!data?.id) throw new Error("MAIN_WHS missing");
  return data.id as string;
}

const CODE_PREFIX: Record<string, string> = {
  customer: "CUS",
  supplier: "SUP",
  sku: "SKU",
  warehouse: "WH",
  rack: "RK",
  bin: "BN",
  route: "RTE",
  batch: "BAT",
  vendor_sku: "VSKU",
};

/** Next auto code from doc_sequences (CUS000001, SKU000001, …). */
export async function nextCode(admin: SupabaseClient, docType: keyof typeof CODE_PREFIX) {
  return nextDocNo(admin, docType, CODE_PREFIX[docType]);
}

export { nextDocNo };
