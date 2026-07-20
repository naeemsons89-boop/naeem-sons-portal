import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import type { GrnLineInput } from "@/lib/grn";
import { lineUnits } from "@/lib/grn";
import { canTouchGrn, insertGrnLines } from "@/lib/grn-server";
import { remainingUnits } from "@/lib/po";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

/** List GRNs */
export async function GET() {
  const { profile } = await getSessionProfile();
  if (!canTouchGrn(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grns")
    .select(
      "id,grn_no,po_id,supplier_delivery_no,delivery_date,status,finance_status,physical_posted_at,finance_posted_at,truck_no,created_at,supplier:suppliers(name),po:purchase_orders(po_no)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ grns: data });
}

/** Create draft GRN from a PO */
export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !canTouchGrn(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    po_id?: string;
    supplier_delivery_no?: string;
    delivery_date?: string;
    truck_no?: string;
    transporter_name?: string;
    remarks?: string;
    lines: GrnLineInput[];
  };

  if (!body.po_id) {
    return NextResponse.json({ error: "PO is required to create a GRN" }, { status: 400 });
  }
  if (!body.lines?.length) {
    return NextResponse.json({ error: "Add at least one line" }, { status: 400 });
  }

  const admin = createServiceClient();

  const { data: po, error: poError } = await admin
    .from("purchase_orders")
    .select(
      "id,supplier_id,warehouse_id,status,lines:purchase_order_lines(id,sku_id,qty_ordered_units,qty_received_units,unit_price)",
    )
    .eq("id", body.po_id)
    .maybeSingle();

  if (poError) return NextResponse.json({ error: poError.message }, { status: 400 });
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  if (!["pending", "partial"].includes(po.status)) {
    return NextResponse.json(
      { error: `Cannot receive against PO in status ${po.status}` },
      { status: 400 },
    );
  }

  const poLines = (po.lines as {
    id: string;
    sku_id: string;
    qty_ordered_units: number;
    qty_received_units: number;
    unit_price: number;
  }[]) ?? [];
  const poLineMap = new Map(poLines.map((l) => [l.id, l]));

  const skuIds = [...new Set(body.lines.map((l) => l.sku_id))];
  const { data: skus } = await admin
    .from("skus")
    .select("id,packs_per_carton")
    .in("id", skuIds);
  const skuMap = new Map((skus ?? []).map((s) => [s.id, s]));

  try {
    for (const [idx, line] of body.lines.entries()) {
      if (!line.po_line_id) {
        throw new Error(`Line ${idx + 1}: po_line_id required`);
      }
      const poLine = poLineMap.get(line.po_line_id);
      if (!poLine) throw new Error(`Line ${idx + 1}: invalid PO line`);
      if (poLine.sku_id !== line.sku_id) {
        throw new Error(`Line ${idx + 1}: SKU does not match PO line`);
      }

      const sku = skuMap.get(line.sku_id);
      const ppc = sku?.packs_per_carton || 1;
      const qty = lineUnits({
        qty_cases: line.qty_cases,
        qty_units: line.qty_units,
        packs_per_carton: ppc,
      });
      const rem = remainingUnits(poLine);
      if (qty > rem + 1e-9) {
        throw new Error(
          `Line ${idx + 1}: qty ${qty} exceeds remaining ${rem} on PO`,
        );
      }

      // Default purchase price from PO if not provided
      if (line.purchase_price_pack == null) {
        line.purchase_price_pack = Number(poLine.unit_price);
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid lines" },
      { status: 400 },
    );
  }

  let grnNo: string | null = null;
  const { data: seq, error: seqError } = await admin.rpc("next_doc_no", {
    p_doc_type: "grn",
  });
  if (!seqError && seq) grnNo = seq as string;
  else grnNo = `GRN${Date.now().toString().slice(-8)}`;

  const { data: grn, error } = await admin
    .from("grns")
    .insert({
      grn_no: grnNo,
      po_id: po.id,
      supplier_id: po.supplier_id,
      warehouse_id: po.warehouse_id,
      supplier_delivery_no: body.supplier_delivery_no || null,
      delivery_date:
        body.delivery_date ||
        new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
      truck_no: body.truck_no || null,
      transporter_name: body.transporter_name || null,
      remarks: body.remarks || null,
      status: "draft",
      finance_status: "pending",
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  try {
    await insertGrnLines(admin, grn.id, body.lines);
  } catch (e) {
    await admin.from("grns").delete().eq("id", grn.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save lines" },
      { status: 400 },
    );
  }

  return NextResponse.json({ grn });
}
