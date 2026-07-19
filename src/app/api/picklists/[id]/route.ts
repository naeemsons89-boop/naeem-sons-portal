import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { listPickableBatches } from "@/lib/fefo";
import { can } from "@/lib/permissions";
import { canTouchPicklist, nextDocNo } from "@/lib/picklist-server";
import { adjustStock } from "@/lib/stock";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { profile } = await getSessionProfile();
  if (!canTouchPicklist(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();

  const { data: picklist, error } = await admin
    .from("picklists")
    .select("*, warehouse:warehouses(id,code,name)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!picklist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let psrRoute = null;
  let daRoute = null;
  if (picklist.psr_route_id) {
    const { data } = await admin
      .from("routes")
      .select("id,code,name")
      .eq("id", picklist.psr_route_id)
      .maybeSingle();
    psrRoute = data;
  }
  if (picklist.da_route_id) {
    const { data } = await admin
      .from("routes")
      .select("id,code,name")
      .eq("id", picklist.da_route_id)
      .maybeSingle();
    daRoute = data;
  }

  const { data: customers } = await admin
    .from("picklist_customers")
    .select("*, customer:customers(id,code,name,address)")
    .eq("picklist_id", id)
    .order("sequence_no");

  const { data: linesRaw } = await admin
    .from("picklist_lines")
    .select("*, sku:skus(id,product_code,description,barcode,packs_per_carton)")
    .eq("picklist_id", id)
    .order("line_no");

  const batchIds = [
    ...new Set(
      (linesRaw ?? [])
        .flatMap((l) => [
          l.suggested_batch_id,
          l.scanned_batch_id,
          l.approved_batch_id,
        ])
        .filter(Boolean) as string[],
    ),
  ];
  const batchMap = new Map<string, Record<string, unknown>>();
  if (batchIds.length) {
    const { data: batches } = await admin
      .from("batches")
      .select("id,batch_code,mfg_date,expiry_date")
      .in("id", batchIds);
    for (const b of batches ?? []) batchMap.set(b.id as string, b);
  }

  const lines = (linesRaw ?? []).map((l) => ({
    ...l,
    suggested_batch: l.suggested_batch_id
      ? batchMap.get(l.suggested_batch_id as string) ?? null
      : null,
    scanned_batch: l.scanned_batch_id
      ? batchMap.get(l.scanned_batch_id as string) ?? null
      : null,
    approved_batch: l.approved_batch_id
      ? batchMap.get(l.approved_batch_id as string) ?? null
      : null,
  }));

  const { data: gatePass } = await admin
    .from("gate_passes")
    .select("*")
    .eq("picklist_id", id)
    .maybeSingle();

  let gatePassLines: unknown[] = [];
  if (gatePass) {
    const { data: gpl } = await admin
      .from("gate_pass_lines")
      .select(
        "*, sku:skus(product_code,description), batch:batches(batch_code,expiry_date)",
      )
      .eq("gate_pass_id", gatePass.id);
    gatePassLines = gpl ?? [];
  }

  const skuIds = [...new Set(lines.map((l) => l.sku_id as string))];
  const batchesBySku: Record<string, unknown[]> = {};
  for (const skuId of skuIds) {
    batchesBySku[skuId] = await listPickableBatches(
      admin,
      picklist.warehouse_id as string,
      skuId,
    );
  }

  return NextResponse.json({
    picklist: { ...picklist, psr_route: psrRoute, da_route: daRoute },
    customers: customers ?? [],
    lines,
    gatePass: gatePass
      ? { ...gatePass, lines: gatePassLines }
      : null,
    batchesBySku,
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const { userId, profile } = await getSessionProfile();
  const role = profile?.role as AppRole | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await request.json()) as {
    action: "save_picks" | "issue_gate_pass" | "load_in";
    picks?: Array<{
      line_id: string;
      qty_picked_units: number;
      scanned_batch_id: string | null;
    }>;
    overrides?: Array<{
      line_id: string;
      approved_batch_id: string;
    }>;
    security_out_by_name?: string;
    load_in?: Array<{
      line_id: string;
      qty_load_in_good_units: number;
      qty_load_in_bad_units: number;
    }>;
  };

  const admin = createServiceClient();
  const { data: picklist } = await admin
    .from("picklists")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!picklist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "save_picks") {
    if (!can(role, "scanPick")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (picklist.load_out_at) {
      return NextResponse.json({ error: "Already loaded out" }, { status: 400 });
    }

    try {
      for (const pick of body.picks ?? []) {
        const { data: line } = await admin
          .from("picklist_lines")
          .select("*")
          .eq("id", pick.line_id)
          .eq("picklist_id", id)
          .maybeSingle();
        if (!line) throw new Error("Invalid pick line");

        const scanned = pick.scanned_batch_id || line.suggested_batch_id;
        const override =
          Boolean(scanned) &&
          Boolean(line.suggested_batch_id) &&
          scanned !== line.suggested_batch_id;

        const { error } = await admin
          .from("picklist_lines")
          .update({
            qty_picked_units: Number(pick.qty_picked_units || 0),
            scanned_batch_id: scanned,
            batch_override_pending: override,
          })
          .eq("id", pick.line_id);
        if (error) throw new Error(error.message);
      }

      await admin.from("picklists").update({ status: "submitted" }).eq("id", id);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Save picks failed" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, message: "Picks saved" });
  }

  if (body.action === "issue_gate_pass") {
    if (!can(role, "approveGatePass")) {
      return NextResponse.json(
        { error: "Only Admin / Manager can issue gate pass" },
        { status: 403 },
      );
    }
    if (picklist.load_out_at) {
      return NextResponse.json({ error: "Gate pass already issued" }, { status: 400 });
    }

    const { data: lines } = await admin
      .from("picklist_lines")
      .select("*")
      .eq("picklist_id", id)
      .order("line_no");

    if (!lines?.length) {
      return NextResponse.json({ error: "No lines" }, { status: 400 });
    }

    const overrideMap = new Map(
      (body.overrides ?? []).map((o) => [o.line_id, o.approved_batch_id]),
    );

    try {
      // Resolve final batches
      for (const line of lines) {
        const picked = Number(line.qty_picked_units || 0);
        if (picked <= 0) {
          throw new Error(`Line ${line.line_no}: pick qty required before gate pass`);
        }

        let finalBatch =
          overrideMap.get(line.id as string) ||
          (line.approved_batch_id as string | null) ||
          (line.scanned_batch_id as string | null) ||
          (line.suggested_batch_id as string | null);

        if (!finalBatch) {
          throw new Error(`Line ${line.line_no}: no batch available`);
        }

        const isOverride =
          Boolean(line.suggested_batch_id) &&
          finalBatch !== line.suggested_batch_id;

        if (line.batch_override_pending && !overrideMap.has(line.id as string) && isOverride) {
          // Manager must explicitly confirm override lines
          throw new Error(
            `Line ${line.line_no}: confirm batch override before issuing gate pass`,
          );
        }

        await admin
          .from("picklist_lines")
          .update({
            approved_batch_id: finalBatch,
            batch_override_pending: false,
            qty_delivered_units: picked,
          })
          .eq("id", line.id);
      }

      // Re-read with approved batches
      const { data: finalLines } = await admin
        .from("picklist_lines")
        .select("*")
        .eq("picklist_id", id)
        .order("line_no");

      const gpNo = await nextDocNo(admin, "gate_pass", "GP");
      const { data: gp, error: gpError } = await admin
        .from("gate_passes")
        .insert({
          gate_pass_no: gpNo,
          picklist_id: id,
          warehouse_id: picklist.warehouse_id,
          status: "posted",
          issued_at: new Date().toISOString(),
          issued_by: userId,
          manager_approved_at: new Date().toISOString(),
          manager_approved_by: userId,
          security_out_by_name: body.security_out_by_name || null,
        })
        .select("*")
        .single();
      if (gpError || !gp) throw new Error(gpError?.message ?? "Gate pass failed");

      for (const line of finalLines ?? []) {
        const qty = Number(line.qty_picked_units || 0);
        const batchId = line.approved_batch_id as string;
        const isOverride =
          Boolean(line.suggested_batch_id) &&
          batchId !== line.suggested_batch_id;

        await adjustStock(admin, {
          warehouse_id: picklist.warehouse_id,
          sku_id: line.sku_id,
          batch_id: batchId,
          condition: "good",
          finance_status: "posted",
          qty_delta: -qty,
        });

        await admin.from("stock_movements").insert({
          movement_type: "gate_pass_out",
          warehouse_id: picklist.warehouse_id,
          sku_id: line.sku_id,
          batch_id: batchId,
          condition: "good",
          qty_units: -qty,
          unit_sale_price: line.sale_price_pack,
          finance_status: "posted",
          document_type: "gate_pass",
          document_id: gp.id,
          document_no: gp.gate_pass_no,
          created_by: userId,
          notes: isOverride ? "Batch override approved" : null,
        });

        await admin.from("gate_pass_lines").insert({
          gate_pass_id: gp.id,
          picklist_line_id: line.id,
          sku_id: line.sku_id,
          batch_id: batchId,
          qty_units: qty,
          is_override: isOverride,
          override_approved_by: isOverride ? userId : null,
        });
      }

      await admin
        .from("picklists")
        .update({
          status: "posted",
          load_out_at: new Date().toISOString(),
          load_out_by: userId,
        })
        .eq("id", id);

      return NextResponse.json({
        ok: true,
        gate_pass_no: gp.gate_pass_no,
        message: `Gate pass ${gp.gate_pass_no} issued. Stock deducted.`,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Gate pass failed" },
        { status: 400 },
      );
    }
  }

  if (body.action === "load_in") {
    if (!can(role, "scanPick") && !can(role, "approveGatePass")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!picklist.load_out_at) {
      return NextResponse.json(
        { error: "Issue gate pass / load-out first" },
        { status: 400 },
      );
    }
    if (picklist.load_in_at) {
      return NextResponse.json({ error: "Load-in already posted" }, { status: 400 });
    }

    try {
      for (const row of body.load_in ?? []) {
        const { data: line } = await admin
          .from("picklist_lines")
          .select("*")
          .eq("id", row.line_id)
          .eq("picklist_id", id)
          .maybeSingle();
        if (!line) throw new Error("Invalid load-in line");

        const good = Number(row.qty_load_in_good_units || 0);
        const bad = Number(row.qty_load_in_bad_units || 0);
        const delivered = Number(line.qty_delivered_units || line.qty_picked_units || 0);
        if (good + bad > delivered) {
          throw new Error(
            `Line ${line.line_no}: load-in cannot exceed delivered (${delivered})`,
          );
        }

        const batchId =
          (line.approved_batch_id as string) ||
          (line.scanned_batch_id as string) ||
          (line.suggested_batch_id as string);
        if (!batchId) throw new Error(`Line ${line.line_no}: missing batch`);

        if (good > 0) {
          await adjustStock(admin, {
            warehouse_id: picklist.warehouse_id,
            sku_id: line.sku_id,
            batch_id: batchId,
            condition: "good",
            finance_status: "posted",
            qty_delta: good,
          });
          await admin.from("stock_movements").insert({
            movement_type: "load_in_good",
            warehouse_id: picklist.warehouse_id,
            sku_id: line.sku_id,
            batch_id: batchId,
            condition: "good",
            qty_units: good,
            finance_status: "posted",
            document_type: "picklist",
            document_id: id,
            document_no: picklist.picklist_no,
            created_by: userId,
          });
        }

        if (bad > 0) {
          await adjustStock(admin, {
            warehouse_id: picklist.warehouse_id,
            sku_id: line.sku_id,
            batch_id: batchId,
            condition: "damaged",
            finance_status: "posted",
            qty_delta: bad,
          });
          await admin.from("stock_movements").insert({
            movement_type: "load_in_bad",
            warehouse_id: picklist.warehouse_id,
            sku_id: line.sku_id,
            batch_id: batchId,
            condition: "damaged",
            qty_units: bad,
            finance_status: "posted",
            document_type: "picklist",
            document_id: id,
            document_no: picklist.picklist_no,
            created_by: userId,
          });
        }

        await admin
          .from("picklist_lines")
          .update({
            qty_load_in_good_units: good,
            qty_load_in_bad_units: bad,
          })
          .eq("id", line.id);
      }

      await admin
        .from("picklists")
        .update({
          status: "closed",
          load_in_at: new Date().toISOString(),
          load_in_by: userId,
        })
        .eq("id", id);

      return NextResponse.json({ ok: true, message: "Load-in posted" });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Load-in failed" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
