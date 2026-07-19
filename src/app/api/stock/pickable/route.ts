import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { listPickableBatches } from "@/lib/fefo";
import { createServiceClient } from "@/lib/supabase/middleware";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await getSessionProfile();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const skuId = searchParams.get("sku_id");
  const warehouseId = searchParams.get("warehouse_id");
  if (!skuId || !warehouseId) {
    return NextResponse.json({ error: "sku_id and warehouse_id required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const batches = await listPickableBatches(admin, warehouseId, skuId);
  return NextResponse.json({ batches });
}
