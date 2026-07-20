import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { PoLineInput } from "@/lib/po";
import { buildPoLineRows, canTouchPo } from "@/lib/po-server";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { profile } = await getSessionProfile();
  if (!canTouchPo(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab"); // pending | received | all
  const supplierId = url.searchParams.get("supplier_id");

  const supabase = await createClient();
  let query = supabase
    .from("purchase_orders")
    .select(
      "id,po_no,order_date,expected_date,status,remarks,created_at,supplier:suppliers(id,code,name),warehouse:warehouses(id,code,name),lines:purchase_order_lines(id,line_amount,qty_ordered_units,qty_received_units)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (tab === "pending") {
    query = query.in("status", ["pending", "partial", "draft"]);
  } else if (tab === "received") {
    query = query.eq("status", "received");
  }

  if (supplierId) query = query.eq("supplier_id", supplierId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const pos = ((data ?? []) as Array<{
    id: string;
    po_no: string;
    order_date: string;
    expected_date: string | null;
    status: string;
    remarks: string | null;
    created_at: string;
    supplier: { id?: string; code?: string; name?: string } | null;
    warehouse: { id?: string; code?: string; name?: string } | null;
    lines: { line_amount?: number; qty_ordered_units?: number; qty_received_units?: number }[] | null;
  }>).map((po) => {
    const lines = po.lines ?? [];
    const total = lines.reduce((s, l) => s + Number(l.line_amount ?? 0), 0);
    return {
      id: po.id,
      po_no: po.po_no,
      order_date: po.order_date,
      expected_date: po.expected_date,
      status: po.status,
      remarks: po.remarks,
      created_at: po.created_at,
      supplier: po.supplier,
      warehouse: po.warehouse,
      line_count: lines.length,
      total_amount: total,
    };
  });

  return NextResponse.json({ pos });
}

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "createPo")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    supplier_id?: string;
    warehouse_id?: string;
    order_date?: string;
    expected_date?: string | null;
    remarks?: string | null;
    lines?: PoLineInput[];
  };

  if (!body.supplier_id) {
    return NextResponse.json({ error: "supplier_id required" }, { status: 400 });
  }
  if (!body.lines?.length) {
    return NextResponse.json({ error: "Add at least one line" }, { status: 400 });
  }

  const admin = createServiceClient();

  let warehouseId = body.warehouse_id;
  if (!warehouseId) {
    const { data: wh } = await admin
      .from("warehouses")
      .select("id")
      .eq("code", "MAIN_WHS")
      .maybeSingle();
    warehouseId = wh?.id;
  }
  if (!warehouseId) {
    return NextResponse.json({ error: "MAIN_WHS not found" }, { status: 400 });
  }

  try {
    const lineRows = await buildPoLineRows(admin, body.supplier_id, body.lines);

    let poNo: string | null = null;
    const { data: seq, error: seqError } = await admin.rpc("next_doc_no", {
      p_doc_type: "po",
    });
    if (!seqError && seq) poNo = seq as string;
    else poNo = `PO${Date.now().toString().slice(-8)}`;

    const { data: po, error } = await admin
      .from("purchase_orders")
      .insert({
        po_no: poNo,
        supplier_id: body.supplier_id,
        warehouse_id: warehouseId,
        order_date:
          body.order_date ||
          new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
        expected_date: body.expected_date || null,
        remarks: body.remarks || null,
        status: "pending",
        created_by: userId,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const { error: lineError } = await admin.from("purchase_order_lines").insert(
      lineRows.map((l) => ({ ...l, po_id: po.id })),
    );
    if (lineError) {
      await admin.from("purchase_orders").delete().eq("id", po.id);
      throw new Error(lineError.message);
    }

    return NextResponse.json({ po });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create PO" },
      { status: 400 },
    );
  }
}
