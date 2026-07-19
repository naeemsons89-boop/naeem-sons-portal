import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { ensureMainWarehouse, nextDocNo } from "@/lib/ops";
import { can } from "@/lib/permissions";
import { adjustStock } from "@/lib/stock";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

type Condition = "good" | "near_expiry" | "damaged" | "hold";

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "writeOff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action: "adjust" | "transfer";
    warehouse_id?: string;
    from_warehouse_id?: string;
    to_warehouse_id?: string;
    reason_code?: string;
    notes?: string;
    lines: Array<{
      sku_id: string;
      batch_id: string;
      condition: Condition;
      finance_status?: "pending" | "posted";
      qty_units: number;
      direction?: "in" | "out";
    }>;
  };

  if (!body.lines?.length) {
    return NextResponse.json({ error: "Add lines" }, { status: 400 });
  }

  const admin = createServiceClient();

  try {
    if (body.action === "adjust") {
      const warehouseId = body.warehouse_id || (await ensureMainWarehouse(admin));
      const docNo = await nextDocNo(admin, "adjustment", "ADJ");

      for (const line of body.lines) {
        const qty = Math.abs(Number(line.qty_units));
        if (qty <= 0) throw new Error("Qty must be > 0");
        const direction = line.direction ?? "out";
        const delta = direction === "in" ? qty : -qty;
        const finance = line.finance_status ?? "posted";
        const condition = line.condition;

        await adjustStock(admin, {
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          batch_id: line.batch_id,
          condition,
          finance_status: finance,
          qty_delta: delta,
        });

        await admin.from("stock_movements").insert({
          movement_type: direction === "in" ? "adjustment_in" : "adjustment_out",
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          batch_id: line.batch_id,
          condition,
          qty_units: delta,
          finance_status: finance,
          document_type: "adjustment",
          document_no: docNo,
          notes: body.notes || body.reason_code || null,
          created_by: userId,
        });
      }

      return NextResponse.json({ message: `Adjustment ${docNo} posted`, document_no: docNo });
    }

    if (body.action === "transfer") {
      const fromId = body.from_warehouse_id || (await ensureMainWarehouse(admin));
      const toId = body.to_warehouse_id;
      if (!toId || toId === fromId) throw new Error("Select a different destination warehouse");

      const docNo = await nextDocNo(admin, "transfer", "TRF");

      for (const line of body.lines) {
        const qty = Math.abs(Number(line.qty_units));
        if (qty <= 0) throw new Error("Qty must be > 0");
        const finance = line.finance_status ?? "posted";
        const condition = line.condition;

        await adjustStock(admin, {
          warehouse_id: fromId,
          sku_id: line.sku_id,
          batch_id: line.batch_id,
          condition,
          finance_status: finance,
          qty_delta: -qty,
        });
        await adjustStock(admin, {
          warehouse_id: toId,
          sku_id: line.sku_id,
          batch_id: line.batch_id,
          condition,
          finance_status: finance,
          qty_delta: qty,
        });

        await admin.from("stock_movements").insert([
          {
            movement_type: "transfer_out",
            warehouse_id: fromId,
            sku_id: line.sku_id,
            batch_id: line.batch_id,
            condition,
            qty_units: -qty,
            finance_status: finance,
            document_type: "transfer",
            document_no: docNo,
            notes: body.notes || `to ${toId}`,
            created_by: userId,
          },
          {
            movement_type: "transfer_in",
            warehouse_id: toId,
            sku_id: line.sku_id,
            batch_id: line.batch_id,
            condition,
            qty_units: qty,
            finance_status: finance,
            document_type: "transfer",
            document_no: docNo,
            notes: body.notes || `from ${fromId}`,
            created_by: userId,
          },
        ]);
      }

      return NextResponse.json({ message: `Transfer ${docNo} posted`, document_no: docNo });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
