import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/middleware";

export const runtime = "nodejs";

/** Lookup SKU / batch by barcode or product code for camera + bluetooth scanners */
export async function GET(request: Request) {
  const { profile } = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = new URL(request.url).searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const admin = createServiceClient();

  const { data: sku } = await admin
    .from("skus")
    .select(
      "id,product_code,description,barcode,packs_per_carton,purchase_price_pack,purchase_price_ctn,default_shelf_life_days",
    )
    .or(`barcode.eq.${code},product_code.eq.${code}`)
    .eq("is_active", true)
    .maybeSingle();

  if (sku) {
    return NextResponse.json({ kind: "sku", sku });
  }

  const { data: batch } = await admin
    .from("batches")
    .select("id,batch_code,mfg_date,expiry_date,sku_id,sku:skus(id,product_code,description,barcode)")
    .eq("batch_code", code)
    .limit(1)
    .maybeSingle();

  if (batch) {
    return NextResponse.json({ kind: "batch", batch });
  }

  // fuzzy product code
  const { data: skus } = await admin
    .from("skus")
    .select("id,product_code,description,barcode")
    .or(`product_code.ilike.%${code}%,barcode.ilike.%${code}%`)
    .eq("is_active", true)
    .limit(10);

  return NextResponse.json({ kind: "none", suggestions: skus ?? [] });
}
