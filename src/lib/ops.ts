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

export { nextDocNo };
