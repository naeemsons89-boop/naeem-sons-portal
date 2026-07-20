import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { addDays, type GrnLineInput } from "@/lib/grn";
import { canTouchGrn, insertGrnLines } from "@/lib/grn-server";
import { can } from "@/lib/permissions";
import { applyPoReceive } from "@/lib/po-server";
import { adjustStock } from "@/lib/stock";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { profile } = await getSessionProfile();
  if (!canTouchGrn(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();

  const { data: grn, error } = await admin
    .from("grns")
    .select(
      "*, supplier:suppliers(id,code,name), warehouse:warehouses(id,code,name), po:purchase_orders(id,po_no,status)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!grn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: lines, error: lineError } = await admin
    .from("grn_lines")
    .select(
      "*, sku:skus(id,product_code,description,barcode,packs_per_carton,purchase_price_pack,purchase_price_ctn,default_shelf_life_days)",
    )
    .eq("grn_id", id)
    .order("line_no");

  if (lineError) {
    return NextResponse.json({ error: lineError.message }, { status: 400 });
  }

  return NextResponse.json({ grn, lines: lines ?? [] });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !canTouchGrn(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();
  const { data: grn } = await admin.from("grns").select("*").eq("id", id).maybeSingle();
  if (!grn) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (grn.physical_posted_at) {
    return NextResponse.json(
      { error: "Cannot edit lines after physical post" },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    supplier_id?: string | null;
    supplier_delivery_no?: string | null;
    delivery_date?: string;
    truck_no?: string | null;
    transporter_name?: string | null;
    remarks?: string | null;
    lines?: GrnLineInput[];
  };

  const { error: updError } = await admin
    .from("grns")
    .update({
      supplier_id: body.supplier_id ?? grn.supplier_id,
      supplier_delivery_no:
        body.supplier_delivery_no ?? grn.supplier_delivery_no,
      delivery_date: body.delivery_date ?? grn.delivery_date,
      truck_no: body.truck_no ?? grn.truck_no,
      transporter_name: body.transporter_name ?? grn.transporter_name,
      remarks: body.remarks ?? grn.remarks,
    })
    .eq("id", id);
  if (updError) return NextResponse.json({ error: updError.message }, { status: 400 });

  if (body.lines) {
    await admin.from("grn_lines").delete().eq("grn_id", id);
    try {
      await insertGrnLines(admin, id, body.lines);
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
  const role = profile?.role as AppRole | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await request.json()) as {
    action: "physical" | "finance";
    finance?: {
      supplier_invoice_no: string;
      supplier_invoice_date: string;
      invoice_tax_amount?: number;
      invoice_discount_amount?: number;
      invoice_total_amount?: number;
      lines?: {
        id: string;
        purchase_price_pack: number;
        purchase_price_ctn?: number | null;
      }[];
    };
  };

  const admin = createServiceClient();
  const { data: grn } = await admin.from("grns").select("*").eq("id", id).maybeSingle();
  if (!grn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "physical") {
    if (!can(role, "physicalReceive")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (grn.physical_posted_at) {
      return NextResponse.json({ error: "Already physically posted" }, { status: 400 });
    }

    const { data: lines, error: lineError } = await admin
      .from("grn_lines")
      .select("*")
      .eq("grn_id", id)
      .order("line_no");
    if (lineError) {
      return NextResponse.json({ error: lineError.message }, { status: 400 });
    }
    if (!lines?.length) {
      return NextResponse.json({ error: "No lines to receive" }, { status: 400 });
    }

    try {
      if (grn.po_id) {
        const { data: poLines, error: poLineErr } = await admin
          .from("purchase_order_lines")
          .select("id, qty_ordered_units, qty_received_units")
          .eq("po_id", grn.po_id);
        if (poLineErr) throw new Error(poLineErr.message);
        const remMap = new Map(
          (poLines ?? []).map((l) => [
            l.id,
            Math.max(0, Number(l.qty_ordered_units) - Number(l.qty_received_units)),
          ]),
        );
        for (const line of lines) {
          if (!line.po_line_id) continue;
          const need =
            Number(line.qty_units) - Number(line.shortage_units ?? 0);
          if (need <= 0) continue;
          const rem = remMap.get(line.po_line_id) ?? 0;
          if (need > rem + 1e-9) {
            throw new Error(
              `Line ${line.line_no}: exceeds PO remaining (${need} > ${rem})`,
            );
          }
          remMap.set(line.po_line_id, rem - need);
        }
      }

      for (const line of lines) {
        if (!line.batch_code) throw new Error(`Line ${line.line_no}: missing batch`);

        let expiry = line.expiry_date as string | null;
        if (!expiry && line.mfg_date) {
          const { data: sku } = await admin
            .from("skus")
            .select("default_shelf_life_days")
            .eq("id", line.sku_id)
            .maybeSingle();
          if (sku?.default_shelf_life_days) {
            expiry = addDays(line.mfg_date, sku.default_shelf_life_days);
          }
        }

        const { data: batch, error: batchError } = await admin
          .from("batches")
          .upsert(
            {
              sku_id: line.sku_id,
              batch_code: line.batch_code,
              mfg_date: line.mfg_date,
              expiry_date: expiry,
              is_unknown: false,
            },
            { onConflict: "sku_id,batch_code" },
          )
          .select("id")
          .single();
        if (batchError || !batch) {
          throw new Error(batchError?.message ?? "Batch failed");
        }

        await admin
          .from("grn_lines")
          .update({ batch_id: batch.id, expiry_date: expiry })
          .eq("id", line.id);

        const goodQty =
          Number(line.qty_units) -
          Number(line.shortage_units ?? 0) -
          Number(line.damage_units ?? 0);
        if (goodQty < 0) {
          throw new Error(`Line ${line.line_no}: shortage/damage exceed qty`);
        }

        if (goodQty > 0) {
          await adjustStock(admin, {
            warehouse_id: grn.warehouse_id,
            sku_id: line.sku_id,
            batch_id: batch.id,
            condition: "good",
            finance_status: "pending",
            qty_delta: goodQty,
            bin_id: line.bin_id,
          });
          await admin.from("stock_movements").insert({
            movement_type: "grn_in",
            warehouse_id: grn.warehouse_id,
            bin_id: line.bin_id,
            sku_id: line.sku_id,
            batch_id: batch.id,
            condition: "good",
            qty_units: goodQty,
            unit_purchase_price: line.purchase_price_pack,
            finance_status: "pending",
            document_type: "grn",
            document_id: grn.id,
            document_no: grn.grn_no,
            created_by: userId,
          });
        }

        const damage = Number(line.damage_units ?? 0);
        if (damage > 0) {
          await adjustStock(admin, {
            warehouse_id: grn.warehouse_id,
            sku_id: line.sku_id,
            batch_id: batch.id,
            condition: "damaged",
            finance_status: "pending",
            qty_delta: damage,
            bin_id: line.bin_id,
          });
          await admin.from("stock_movements").insert({
            movement_type: "grn_in",
            warehouse_id: grn.warehouse_id,
            sku_id: line.sku_id,
            batch_id: batch.id,
            condition: "damaged",
            qty_units: damage,
            finance_status: "pending",
            document_type: "grn",
            document_id: grn.id,
            document_no: grn.grn_no,
            notes: "Damaged on receive",
            created_by: userId,
          });
        }
      }

      await admin
        .from("grns")
        .update({
          status: "posted",
          physical_posted_at: new Date().toISOString(),
          physical_posted_by: userId,
        })
        .eq("id", id);

      if (grn.po_id) {
        const increments = lines
          .filter((line) => line.po_line_id)
          .map((line) => {
            const goodQty =
              Number(line.qty_units) -
              Number(line.shortage_units ?? 0) -
              Number(line.damage_units ?? 0);
            // Count good + damaged as received against PO; shortage does not
            const receivedAgainstPo =
              Number(line.qty_units) - Number(line.shortage_units ?? 0);
            return {
              po_line_id: line.po_line_id as string,
              qty_units: Math.max(0, receivedAgainstPo),
              _good: goodQty,
            };
          })
          .filter((i) => i.qty_units > 0)
          .map(({ po_line_id, qty_units }) => ({ po_line_id, qty_units }));

        await applyPoReceive(admin, grn.po_id, increments);
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Physical post failed" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "QC & receive posted. Stock is in warehouse but NOT pickable until finance is posted.",
    });
  }

  if (body.action === "finance") {
    if (!can(role, "postFinance")) {
      return NextResponse.json(
        { error: "Only Admin / Manager can post finance" },
        { status: 403 },
      );
    }
    if (!grn.physical_posted_at) {
      return NextResponse.json(
        { error: "Post physical receive before finance" },
        { status: 400 },
      );
    }
    if (grn.finance_status === "posted") {
      return NextResponse.json({ error: "Finance already posted" }, { status: 400 });
    }

    const fin = body.finance;
    if (!fin?.supplier_invoice_no?.trim() || !fin.supplier_invoice_date) {
      return NextResponse.json(
        { error: "Supplier invoice number and date are required" },
        { status: 400 },
      );
    }

    const { data: lines } = await admin
      .from("grn_lines")
      .select("*")
      .eq("grn_id", id)
      .order("line_no");

    try {
      for (const line of lines ?? []) {
        const pricePatch = fin.lines?.find((l) => l.id === line.id);
        const purchase_price_pack =
          pricePatch?.purchase_price_pack ?? Number(line.purchase_price_pack);
        if (purchase_price_pack == null || Number.isNaN(Number(purchase_price_pack))) {
          throw new Error(`Line ${line.line_no}: purchase price required`);
        }
        const purchase_price_ctn =
          pricePatch?.purchase_price_ctn ?? line.purchase_price_ctn;
        const line_amount = Number(purchase_price_pack) * Number(line.qty_units);

        await admin
          .from("grn_lines")
          .update({
            purchase_price_pack,
            purchase_price_ctn,
            line_amount,
            finance_status: "posted",
          })
          .eq("id", line.id);

        if (!line.batch_id) throw new Error(`Line ${line.line_no}: missing batch link`);

        const goodQty =
          Number(line.qty_units) -
          Number(line.shortage_units ?? 0) -
          Number(line.damage_units ?? 0);

        if (goodQty > 0) {
          await adjustStock(admin, {
            warehouse_id: grn.warehouse_id,
            sku_id: line.sku_id,
            batch_id: line.batch_id,
            condition: "good",
            finance_status: "pending",
            qty_delta: -goodQty,
            bin_id: line.bin_id,
          });
          await adjustStock(admin, {
            warehouse_id: grn.warehouse_id,
            sku_id: line.sku_id,
            batch_id: line.batch_id,
            condition: "good",
            finance_status: "posted",
            qty_delta: goodQty,
            bin_id: line.bin_id,
          });
        }

        const damage = Number(line.damage_units ?? 0);
        if (damage > 0) {
          await adjustStock(admin, {
            warehouse_id: grn.warehouse_id,
            sku_id: line.sku_id,
            batch_id: line.batch_id,
            condition: "damaged",
            finance_status: "pending",
            qty_delta: -damage,
            bin_id: line.bin_id,
          });
          await adjustStock(admin, {
            warehouse_id: grn.warehouse_id,
            sku_id: line.sku_id,
            batch_id: line.batch_id,
            condition: "damaged",
            finance_status: "posted",
            qty_delta: damage,
            bin_id: line.bin_id,
          });
        }

        await admin
          .from("stock_movements")
          .update({
            finance_status: "posted",
            unit_purchase_price: purchase_price_pack,
          })
          .eq("document_type", "grn")
          .eq("document_id", id)
          .eq("batch_id", line.batch_id);
      }

      const computedTotal =
        (lines ?? []).reduce((sum, line) => {
          const patch = fin.lines?.find((l) => l.id === line.id);
          const price =
            patch?.purchase_price_pack ?? Number(line.purchase_price_pack) ?? 0;
          return sum + Number(price) * Number(line.qty_units);
        }, 0) +
        Number(fin.invoice_tax_amount ?? 0) -
        Number(fin.invoice_discount_amount ?? 0);

      await admin
        .from("grns")
        .update({
          finance_status: "posted",
          finance_posted_at: new Date().toISOString(),
          finance_posted_by: userId,
          supplier_invoice_no: fin.supplier_invoice_no.trim(),
          supplier_invoice_date: fin.supplier_invoice_date,
          invoice_tax_amount: fin.invoice_tax_amount ?? 0,
          invoice_discount_amount: fin.invoice_discount_amount ?? 0,
          invoice_total_amount: fin.invoice_total_amount ?? computedTotal,
        })
        .eq("id", id);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Finance post failed" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Finance posted. Batches are now pickable / dispatchable.",
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
