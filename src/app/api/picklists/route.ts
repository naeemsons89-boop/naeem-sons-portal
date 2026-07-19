import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { suggestFefoBatch } from "@/lib/fefo";
import { can } from "@/lib/permissions";
import { canTouchPicklist, nextDocNo } from "@/lib/picklist-server";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function GET() {
  const { profile } = await getSessionProfile();
  if (!canTouchPicklist(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("picklists")
    .select(
      "id,picklist_no,delivery_date,status,load_out_at,load_in_at,created_at,warehouse:warehouses(code,name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ picklists: data });
}

type CreateBody = {
  delivery_date: string;
  psr_route_code?: string;
  da_route_code?: string;
  warehouse_id?: string;
  customers: Array<{
    customer_id?: string;
    customer_code?: string;
    customer_name?: string;
    invoice_no?: string;
    lines: Array<{
      sku_id: string;
      qty_ordered_units: number;
      qty_foc_units?: number;
    }>;
  }>;
};

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "createPicklist")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as CreateBody;
  if (!body.delivery_date || !body.customers?.length) {
    return NextResponse.json(
      { error: "Delivery date and at least one customer required" },
      { status: 400 },
    );
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
    return NextResponse.json({ error: "MAIN_WHS missing" }, { status: 400 });
  }

  async function upsertRoute(code?: string, type: "psr" | "da" | "mixed" = "mixed") {
    if (!code?.trim()) return null;
    const c = code.trim();
    const { data, error } = await admin
      .from("routes")
      .upsert({ code: c, name: c, route_type: type }, { onConflict: "code" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  try {
    const psrId = await upsertRoute(body.psr_route_code, "psr");
    const daId = await upsertRoute(body.da_route_code, "da");
    const picklistNo = await nextDocNo(admin, "picklist", "PL");

    const { data: picklist, error: plError } = await admin
      .from("picklists")
      .insert({
        picklist_no: picklistNo,
        warehouse_id: warehouseId,
        delivery_date: body.delivery_date,
        psr_route_id: psrId,
        da_route_id: daId,
        status: "draft",
        created_by: userId,
      })
      .select("*")
      .single();
    if (plError || !picklist) throw new Error(plError?.message ?? "Picklist create failed");

    let lineNo = 0;
    for (let i = 0; i < body.customers.length; i++) {
      const c = body.customers[i];
      let customerId = c.customer_id;

      if (!customerId) {
        if (!c.customer_code?.trim() || !c.customer_name?.trim()) {
          throw new Error(`Customer ${i + 1}: code and name required`);
        }
        const { data: cust, error: custError } = await admin
          .from("customers")
          .upsert(
            {
              code: c.customer_code.trim(),
              name: c.customer_name.trim(),
              route_id: daId || psrId,
              is_active: true,
            },
            { onConflict: "code" },
          )
          .select("id")
          .single();
        if (custError || !cust) throw new Error(custError?.message ?? "Customer failed");
        customerId = cust.id;
      }

      const { data: pc, error: pcError } = await admin
        .from("picklist_customers")
        .insert({
          picklist_id: picklist.id,
          customer_id: customerId,
          invoice_no: c.invoice_no || null,
          sequence_no: i + 1,
        })
        .select("id")
        .single();
      if (pcError || !pc) throw new Error(pcError?.message ?? "Picklist customer failed");

      if (!c.lines?.length) throw new Error(`Customer ${i + 1}: add lines`);

      for (const line of c.lines) {
        lineNo += 1;
        const qty = Number(line.qty_ordered_units || 0);
        if (qty <= 0) throw new Error(`Line ${lineNo}: qty must be > 0`);

        const { data: sku } = await admin
          .from("skus")
          .select("id,sale_price_pack")
          .eq("id", line.sku_id)
          .maybeSingle();
        if (!sku) throw new Error(`Unknown SKU on line ${lineNo}`);

        const suggested = await suggestFefoBatch(admin, warehouseId, line.sku_id, qty);

        const { error: lineError } = await admin.from("picklist_lines").insert({
          picklist_id: picklist.id,
          picklist_customer_id: pc.id,
          line_no: lineNo,
          sku_id: line.sku_id,
          suggested_batch_id: suggested?.batch_id ?? null,
          qty_ordered_units: qty,
          qty_foc_units: Number(line.qty_foc_units || 0),
          qty_picked_units: 0,
          sale_price_pack: sku.sale_price_pack,
          line_sale_amount:
            sku.sale_price_pack != null
              ? Number(sku.sale_price_pack) * qty
              : null,
        });
        if (lineError) throw new Error(lineError.message);
      }
    }

    return NextResponse.json({ picklist });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create failed" },
      { status: 400 },
    );
  }
}
