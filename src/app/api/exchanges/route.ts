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
    .from("exchange_notes")
    .select(
      "id,exchange_no,status,posted_at,created_at,customer:customers(code,name),reason:reason_codes(code,label)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ exchanges: data });
}

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "focExchange")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    customer_id: string;
    reason_code?: string;
    lines: Array<{
      direction: "out" | "in";
      sku_id: string;
      batch_id?: string;
      batch_code?: string;
      condition?: "good" | "near_expiry" | "damaged" | "hold";
      qty_units: number;
    }>;
  };

  if (!body.customer_id || !body.lines?.length) {
    return NextResponse.json({ error: "Customer and lines required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const warehouseId = await ensureMainWarehouse(admin);

  let reasonId: string | null = null;
  if (body.reason_code) {
    const { data: reason } = await admin
      .from("reason_codes")
      .select("id")
      .eq("code", body.reason_code)
      .eq("kind", "exchange")
      .maybeSingle();
    reasonId = reason?.id ?? null;
  }

  const exchangeNo = await nextDocNo(admin, "exchange", "EX");
  const { data: note, error } = await admin
    .from("exchange_notes")
    .insert({
      exchange_no: exchangeNo,
      customer_id: body.customer_id,
      warehouse_id: warehouseId,
      reason_id: reasonId,
      status: "draft",
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !note) {
    return NextResponse.json({ error: error?.message ?? "Create failed" }, { status: 400 });
  }

  try {
    for (const line of body.lines) {
      const qty = Number(line.qty_units);
      if (qty <= 0) throw new Error("Qty must be > 0");
      const condition = line.condition ?? "good";

      let batchId = line.batch_id || null;
      if (!batchId && line.batch_code?.trim()) {
        const { data: batch, error: bErr } = await admin
          .from("batches")
          .upsert(
            {
              sku_id: line.sku_id,
              batch_code: line.batch_code.trim(),
              is_unknown: false,
            },
            { onConflict: "sku_id,batch_code" },
          )
          .select("id")
          .single();
        if (bErr || !batch) throw new Error(bErr?.message ?? "Batch failed");
        batchId = batch.id;
      }
      if (!batchId) throw new Error("Batch required on exchange line");

      await admin.from("exchange_lines").insert({
        exchange_id: note.id,
        direction: line.direction,
        sku_id: line.sku_id,
        batch_id: batchId,
        condition,
        qty_units: qty,
      });

      if (line.direction === "out") {
        await adjustStock(admin, {
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          batch_id: batchId,
          condition: "good",
          finance_status: "posted",
          qty_delta: -qty,
        });
        await admin.from("stock_movements").insert({
          movement_type: "exchange_out",
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          batch_id: batchId,
          condition: "good",
          qty_units: -qty,
          finance_status: "posted",
          document_type: "exchange",
          document_id: note.id,
          document_no: note.exchange_no,
          created_by: userId,
        });
      } else {
        await adjustStock(admin, {
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          batch_id: batchId,
          condition,
          finance_status: "posted",
          qty_delta: qty,
        });
        await admin.from("stock_movements").insert({
          movement_type: "exchange_in",
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          batch_id: batchId,
          condition,
          qty_units: qty,
          finance_status: "posted",
          document_type: "exchange",
          document_id: note.id,
          document_no: note.exchange_no,
          created_by: userId,
        });
      }
    }

    await admin
      .from("exchange_notes")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        posted_by: userId,
      })
      .eq("id", note.id);

    return NextResponse.json({ exchange: note, message: "Exchange posted" });
  } catch (e) {
    await admin.from("exchange_notes").delete().eq("id", note.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Exchange failed" },
      { status: 400 },
    );
  }
}
