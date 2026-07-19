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
  if (!can(profile?.role as AppRole, "writeOff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("write_offs")
    .select(
      "id,write_off_no,status,posted_at,created_at,reason:reason_codes(code,label),warehouse:warehouses(code,name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ write_offs: data });
}

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "writeOff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    reason_code?: string;
    warehouse_id?: string;
    lines: Array<{
      sku_id: string;
      batch_id: string;
      condition: "good" | "near_expiry" | "damaged" | "hold";
      qty_units: number;
    }>;
  };

  if (!body.lines?.length) {
    return NextResponse.json({ error: "Add write-off lines" }, { status: 400 });
  }

  const admin = createServiceClient();
  const warehouseId = body.warehouse_id || (await ensureMainWarehouse(admin));

  let reasonId: string | null = null;
  if (body.reason_code) {
    const { data: reason } = await admin
      .from("reason_codes")
      .select("id")
      .eq("code", body.reason_code)
      .maybeSingle();
    reasonId = reason?.id ?? null;
  }

  const writeOffNo = await nextDocNo(admin, "write_off", "WO");
  const { data: doc, error } = await admin
    .from("write_offs")
    .insert({
      write_off_no: writeOffNo,
      warehouse_id: warehouseId,
      reason_id: reasonId,
      status: "draft",
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !doc) {
    return NextResponse.json({ error: error?.message ?? "Create failed" }, { status: 400 });
  }

  try {
    for (const line of body.lines) {
      const qty = Number(line.qty_units);
      if (qty <= 0) throw new Error("Qty must be > 0");
      if (!line.batch_id) throw new Error("Batch required");

      await admin.from("write_off_lines").insert({
        write_off_id: doc.id,
        sku_id: line.sku_id,
        batch_id: line.batch_id,
        condition: line.condition,
        qty_units: qty,
      });

      // Prefer deducting from matching condition; finance posted first, then pending
      try {
        await adjustStock(admin, {
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          batch_id: line.batch_id,
          condition: line.condition,
          finance_status: "posted",
          qty_delta: -qty,
        });
      } catch {
        await adjustStock(admin, {
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          batch_id: line.batch_id,
          condition: line.condition,
          finance_status: "pending",
          qty_delta: -qty,
        });
      }

      await admin.from("stock_movements").insert({
        movement_type: "write_off",
        warehouse_id: warehouseId,
        sku_id: line.sku_id,
        batch_id: line.batch_id,
        condition: line.condition,
        qty_units: -qty,
        finance_status: "posted",
        document_type: "write_off",
        document_id: doc.id,
        document_no: doc.write_off_no,
        created_by: userId,
      });
    }

    await admin
      .from("write_offs")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        posted_by: userId,
      })
      .eq("id", doc.id);

    return NextResponse.json({
      write_off: doc,
      message: `Write-off ${doc.write_off_no} posted`,
    });
  } catch (e) {
    await admin.from("write_offs").delete().eq("id", doc.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Write-off failed" },
      { status: 400 },
    );
  }
}
