import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import type { GrnLineInput } from "@/lib/grn";
import { canTouchGrn, insertGrnLines } from "@/lib/grn-server";
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
      "id,grn_no,supplier_delivery_no,delivery_date,status,finance_status,physical_posted_at,finance_posted_at,truck_no,created_at,supplier:suppliers(name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ grns: data });
}

/** Create draft GRN with lines */
export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !canTouchGrn(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    supplier_id?: string | null;
    warehouse_id?: string;
    supplier_delivery_no?: string;
    delivery_date?: string;
    truck_no?: string;
    transporter_name?: string;
    remarks?: string;
    lines: GrnLineInput[];
  };

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
      supplier_id: body.supplier_id || null,
      warehouse_id: warehouseId,
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
