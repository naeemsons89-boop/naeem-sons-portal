import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { PoLineInput } from "@/lib/po";
import { buildPoLineRows, canTouchPo, isPoLocked } from "@/lib/po-server";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { profile } = await getSessionProfile();
  if (!canTouchPo(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();

  const { data: po, error } = await admin
    .from("purchase_orders")
    .select(
      "*, supplier:suppliers(id,code,name,phone,address), warehouse:warehouses(id,code,name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: lines, error: lineError } = await admin
    .from("purchase_order_lines")
    .select(
      "*, sku:skus(id,product_code,description,barcode,packs_per_carton,purchase_price_pack,default_shelf_life_days)",
    )
    .eq("po_id", id)
    .order("line_no");

  if (lineError) {
    return NextResponse.json({ error: lineError.message }, { status: 400 });
  }

  const locked = await isPoLocked(admin, id);
  const total = (lines ?? []).reduce((s, l) => s + Number(l.line_amount ?? 0), 0);

  return NextResponse.json({
    po,
    lines: lines ?? [],
    locked,
    total_amount: total,
  });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "editPo")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();
  const { data: po } = await admin
    .from("purchase_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (po.status === "cancelled" || po.status === "received") {
    return NextResponse.json({ error: "PO cannot be edited in this status" }, { status: 400 });
  }

  if (await isPoLocked(admin, id)) {
    return NextResponse.json(
      { error: "PO is locked after GRN receive (partial or full)" },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    expected_date?: string | null;
    remarks?: string | null;
    order_date?: string;
    warehouse_id?: string;
    lines?: PoLineInput[];
  };

  const { error: updError } = await admin
    .from("purchase_orders")
    .update({
      expected_date: body.expected_date ?? po.expected_date,
      remarks: body.remarks ?? po.remarks,
      order_date: body.order_date ?? po.order_date,
      warehouse_id: body.warehouse_id ?? po.warehouse_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updError) return NextResponse.json({ error: updError.message }, { status: 400 });

  if (body.lines) {
    try {
      const lineRows = await buildPoLineRows(admin, po.supplier_id, body.lines);
      await admin.from("purchase_order_lines").delete().eq("po_id", id);
      const { error: lineError } = await admin.from("purchase_order_lines").insert(
        lineRows.map((l) => ({ ...l, po_id: id })),
      );
      if (lineError) throw new Error(lineError.message);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Line save failed" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, ctx: Ctx) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "editPo")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await request.json()) as { action: "cancel" };
  const admin = createServiceClient();

  const { data: po } = await admin
    .from("purchase_orders")
    .select("*, lines:purchase_order_lines(qty_received_units)")
    .eq("id", id)
    .maybeSingle();
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "cancel") {
    const lines = (po.lines as { qty_received_units: number }[] | null) ?? [];
    const anyReceived = lines.some((l) => Number(l.qty_received_units) > 0);
    if (anyReceived || (await isPoLocked(admin, id))) {
      return NextResponse.json(
        { error: "Cannot cancel PO after any GRN receive" },
        { status: 400 },
      );
    }
    const { error } = await admin
      .from("purchase_orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
