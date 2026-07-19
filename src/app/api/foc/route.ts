import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { ensureMainWarehouse, nextDocNo } from "@/lib/ops";
import { can } from "@/lib/permissions";
import { adjustStock } from "@/lib/stock";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function GET() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "focExchange")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foc_issues")
    .select(
      "id,foc_no,status,posted_at,created_at,customer:customers(code,name),reason:reason_codes(code,label)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ foc: data });
}

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "focExchange")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    customer_id?: string;
    reason_code?: string;
    picklist_id?: string;
    lines: Array<{ sku_id: string; batch_id: string; qty_units: number }>;
  };

  if (!body.lines?.length) {
    return NextResponse.json({ error: "Add FOC lines" }, { status: 400 });
  }

  const admin = createServiceClient();
  const warehouseId = await ensureMainWarehouse(admin);

  let reasonId: string | null = null;
  if (body.reason_code) {
    const { data: reason } = await admin
      .from("reason_codes")
      .select("id")
      .eq("code", body.reason_code)
      .maybeSingle();
    reasonId = reason?.id ?? null;
  }

  const focNo = await nextDocNo(admin, "foc", "FOC");
  const { data: foc, error } = await admin
    .from("foc_issues")
    .insert({
      foc_no: focNo,
      customer_id: body.customer_id || null,
      warehouse_id: warehouseId,
      picklist_id: body.picklist_id || null,
      reason_id: reasonId,
      status: "draft",
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !foc) {
    return NextResponse.json({ error: error?.message ?? "Create failed" }, { status: 400 });
  }

  try {
    for (const line of body.lines) {
      const qty = Number(line.qty_units);
      if (qty <= 0) throw new Error("Qty must be > 0");
      if (!line.batch_id) throw new Error("FEFO/posted batch required for FOC");

      await admin.from("foc_lines").insert({
        foc_id: foc.id,
        sku_id: line.sku_id,
        batch_id: line.batch_id,
        qty_units: qty,
      });

      await adjustStock(admin, {
        warehouse_id: warehouseId,
        sku_id: line.sku_id,
        batch_id: line.batch_id,
        condition: "good",
        finance_status: "posted",
        qty_delta: -qty,
      });

      await admin.from("stock_movements").insert({
        movement_type: "foc_out",
        warehouse_id: warehouseId,
        sku_id: line.sku_id,
        batch_id: line.batch_id,
        condition: "good",
        qty_units: -qty,
        finance_status: "posted",
        document_type: "foc",
        document_id: foc.id,
        document_no: foc.foc_no,
        created_by: userId,
      });
    }

    await admin
      .from("foc_issues")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        posted_by: userId,
      })
      .eq("id", foc.id);

    return NextResponse.json({ foc, message: "FOC issued and stock deducted" });
  } catch (e) {
    await admin.from("foc_issues").delete().eq("id", foc.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "FOC failed" },
      { status: 400 },
    );
  }
}
