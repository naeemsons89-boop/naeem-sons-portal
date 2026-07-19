import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

type Entity = "skus" | "customers" | "suppliers";

function entityFromUrl(url: URL): Entity | null {
  const e = url.searchParams.get("entity");
  if (e === "skus" || e === "customers" || e === "suppliers") return e;
  return null;
}

export async function GET(request: Request) {
  const { profile } = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const entity = entityFromUrl(url);
  if (!entity) return NextResponse.json({ error: "entity required" }, { status: 400 });

  const q = (url.searchParams.get("q") ?? "").trim();
  const supabase = await createClient();

  if (entity === "skus") {
    let query = supabase
      .from("skus")
      .select(
        "id,product_code,description,barcode,packs_per_carton,purchase_price_pack,sale_price_pack,purchase_price_ctn,sale_price_ctn,default_shelf_life_days,is_active,brand:brands(name),category:categories(name)",
      )
      .order("product_code")
      .limit(500);
    if (q) {
      query = query.or(
        `product_code.ilike.%${q}%,description.ilike.%${q}%,barcode.ilike.%${q}%`,
      );
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rows: data });
  }

  if (entity === "customers") {
    let query = supabase
      .from("customers")
      .select("id,code,name,phone,address,opening_balance,is_active,route:routes(code,name)")
      .order("code")
      .limit(500);
    if (q) {
      query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%,phone.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rows: data });
  }

  let query = supabase
    .from("suppliers")
    .select("id,code,name,phone,address,is_active")
    .order("name")
    .limit(200);
  if (q) {
    query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data });
}

export async function POST(request: Request) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "manageMasters")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    entity: Entity;
    action: "create" | "update" | "toggle";
    id?: string;
    data?: Record<string, unknown>;
    is_active?: boolean;
  };

  if (!body.entity || !body.action) {
    return NextResponse.json({ error: "entity and action required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const table = body.entity;

  try {
    if (body.action === "toggle" && body.id) {
      const { error } = await admin
        .from(table)
        .update({ is_active: Boolean(body.is_active) })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "create") {
      const row = sanitize(table, body.data ?? {}, true) as Record<string, unknown>;
      const { data, error } = await admin.from(table).insert(row).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ row: data });
    }

    if (body.action === "update" && body.id) {
      const row = sanitize(table, body.data ?? {}, false) as Record<string, unknown>;
      const { data, error } = await admin
        .from(table)
        .update(row)
        .eq("id", body.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ row: data });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}

function sanitize(entity: Entity, data: Record<string, unknown>, creating: boolean) {
  if (entity === "skus") {
    const product_code = String(data.product_code ?? "").trim();
    const description = String(data.description ?? "").trim();
    if (creating && (!product_code || !description)) {
      throw new Error("product_code and description required");
    }
    return {
      ...(product_code ? { product_code } : {}),
      ...(description ? { description } : {}),
      barcode: data.barcode ? String(data.barcode).trim() : null,
      packs_per_carton: Number(data.packs_per_carton || 1),
      purchase_price_pack: data.purchase_price_pack !== "" && data.purchase_price_pack != null
        ? Number(data.purchase_price_pack)
        : null,
      sale_price_pack: data.sale_price_pack !== "" && data.sale_price_pack != null
        ? Number(data.sale_price_pack)
        : null,
      purchase_price_ctn: data.purchase_price_ctn !== "" && data.purchase_price_ctn != null
        ? Number(data.purchase_price_ctn)
        : null,
      sale_price_ctn: data.sale_price_ctn !== "" && data.sale_price_ctn != null
        ? Number(data.sale_price_ctn)
        : null,
      default_shelf_life_days:
        data.default_shelf_life_days !== "" && data.default_shelf_life_days != null
          ? Number(data.default_shelf_life_days)
          : null,
      is_active: data.is_active !== false,
      updated_at: new Date().toISOString(),
    };
  }

  if (entity === "customers") {
    const code = String(data.code ?? "").trim();
    const name = String(data.name ?? "").trim();
    if (creating && (!code || !name)) throw new Error("code and name required");
    return {
      ...(code ? { code } : {}),
      ...(name ? { name } : {}),
      phone: data.phone ? String(data.phone).trim() : null,
      address: data.address ? String(data.address).trim() : null,
      opening_balance: Number(data.opening_balance ?? 0),
      is_active: data.is_active !== false,
    };
  }

  const name = String(data.name ?? "").trim();
  if (creating && !name) throw new Error("name required");
  return {
    ...(name ? { name } : {}),
    code: data.code ? String(data.code).trim() : null,
    phone: data.phone ? String(data.phone).trim() : null,
    address: data.address ? String(data.address).trim() : null,
    is_active: data.is_active !== false,
  };
}
