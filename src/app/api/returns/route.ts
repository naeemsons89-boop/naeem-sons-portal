import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { ensureMainWarehouse, nextDocNo } from "@/lib/ops";
import { can } from "@/lib/permissions";
import { postReturn } from "@/lib/returns";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function GET() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "returns")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("return_receipts")
    .select(
      "id,return_no,status,invoice_no,requires_unknown_batch_approval,posted_at,created_at,customer:customers(code,name),reason:reason_codes(code,label)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ returns: data });
}

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "returns")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    customer_id: string;
    invoice_no?: string;
    reason_code?: string;
    picklist_id?: string;
    lines: Array<{
      sku_id: string;
      batch_code?: string;
      batch_id?: string;
      is_unknown_batch?: boolean;
      condition: "good" | "near_expiry" | "damaged" | "hold";
      qty_units: number;
    }>;
    post_now?: boolean;
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
      .maybeSingle();
    reasonId = reason?.id ?? null;
  }

  const needsUnknown = body.lines.some((l) => l.is_unknown_batch);
  const returnNo = await nextDocNo(admin, "return", "RET");

  const { data: receipt, error } = await admin
    .from("return_receipts")
    .insert({
      return_no: returnNo,
      customer_id: body.customer_id,
      warehouse_id: warehouseId,
      picklist_id: body.picklist_id || null,
      invoice_no: body.invoice_no || null,
      reason_id: reasonId,
      status: "draft",
      requires_unknown_batch_approval: needsUnknown,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !receipt) {
    return NextResponse.json({ error: error?.message ?? "Create failed" }, { status: 400 });
  }

  try {
    for (const line of body.lines) {
      if (Number(line.qty_units) <= 0) throw new Error("Qty must be > 0");

      let batchId = line.batch_id || null;
      if (line.is_unknown_batch) {
        const unknownCode = `UNKNOWN-${Date.now().toString().slice(-6)}`;
        const { data: batch, error: bErr } = await admin
          .from("batches")
          .insert({
            sku_id: line.sku_id,
            batch_code: unknownCode,
            is_unknown: true,
            notes: "Unknown batch return — pending manager approval",
          })
          .select("id")
          .single();
        if (bErr || !batch) throw new Error(bErr?.message ?? "Unknown batch failed");
        batchId = batch.id;
      } else if (line.batch_code?.trim()) {
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

      if (!batchId) throw new Error("Batch required (or mark unknown)");

      const { error: lErr } = await admin.from("return_lines").insert({
        return_id: receipt.id,
        sku_id: line.sku_id,
        batch_id: batchId,
        is_unknown_batch: Boolean(line.is_unknown_batch),
        condition: line.condition,
        qty_units: Number(line.qty_units),
      });
      if (lErr) throw new Error(lErr.message);
    }

    const canApproveUnknown = can(profile?.role as AppRole, "approveUnknownBatch");
    const shouldPost =
      body.post_now !== false && (!needsUnknown || canApproveUnknown);

    if (shouldPost) {
      await postReturn(admin, receipt.id as string, userId, canApproveUnknown);
    }

    return NextResponse.json({ return: receipt });
  } catch (e) {
    await admin.from("return_receipts").delete().eq("id", receipt.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
