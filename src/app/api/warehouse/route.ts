import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function GET() {
  const { profile } = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: warehouses, error } = await supabase
    .from("warehouses")
    .select("id,code,name,address,is_active,created_at")
    .order("code");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const ids = (warehouses ?? []).map((w) => w.id);
  const admin = createServiceClient();
  const { data: racks } = ids.length
    ? await admin.from("racks").select("*").in("warehouse_id", ids).order("code")
    : { data: [] };
  const rackIds = (racks ?? []).map((r) => r.id);
  const { data: bins } = rackIds.length
    ? await admin.from("bins").select("*").in("rack_id", rackIds).order("code")
    : { data: [] };

  return NextResponse.json({
    warehouses: warehouses ?? [],
    racks: racks ?? [],
    bins: bins ?? [],
  });
}

export async function POST(request: Request) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "manageWarehouseStructure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action: "create_warehouse" | "create_rack" | "create_bin" | "toggle";
    warehouse?: { code: string; name: string; address?: string };
    rack?: { warehouse_id: string; code: string; name?: string };
    bin?: { rack_id: string; code: string; name?: string };
    toggle?: { table: "warehouses" | "racks" | "bins"; id: string; is_active: boolean };
  };

  const admin = createServiceClient();

  try {
    if (body.action === "create_warehouse") {
      const w = body.warehouse;
      if (!w?.code?.trim() || !w?.name?.trim()) throw new Error("Code and name required");
      const { data: company } = await admin.from("companies").select("id").limit(1).maybeSingle();
      if (!company) throw new Error("Company missing");
      const { data, error } = await admin
        .from("warehouses")
        .insert({
          company_id: company.id,
          code: w.code.trim().toUpperCase(),
          name: w.name.trim(),
          address: w.address || null,
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ warehouse: data });
    }

    if (body.action === "create_rack") {
      const r = body.rack;
      if (!r?.warehouse_id || !r?.code?.trim()) throw new Error("Warehouse and rack code required");
      const { data, error } = await admin
        .from("racks")
        .insert({
          warehouse_id: r.warehouse_id,
          code: r.code.trim().toUpperCase(),
          name: r.name?.trim() || r.code.trim().toUpperCase(),
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ rack: data });
    }

    if (body.action === "create_bin") {
      const b = body.bin;
      if (!b?.rack_id || !b?.code?.trim()) throw new Error("Rack and bin code required");
      const { data, error } = await admin
        .from("bins")
        .insert({
          rack_id: b.rack_id,
          code: b.code.trim().toUpperCase(),
          name: b.name?.trim() || b.code.trim().toUpperCase(),
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ bin: data });
    }

    if (body.action === "toggle" && body.toggle) {
      const { table, id, is_active } = body.toggle;
      const { error } = await admin.from(table).update({ is_active }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
