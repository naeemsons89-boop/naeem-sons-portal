import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

type Entity = "skus" | "customers" | "suppliers" | "categories" | "supplier_skus";

function entityFromUrl(url: URL): Entity | null {
  const e = url.searchParams.get("entity");
  if (
    e === "skus" ||
    e === "customers" ||
    e === "suppliers" ||
    e === "categories" ||
    e === "supplier_skus"
  ) {
    return e;
  }
  return null;
}

async function nextCode(
  admin: ReturnType<typeof createServiceClient>,
  docType: "supplier" | "customer",
) {
  const { data: seq, error } = await admin.rpc("next_doc_no", { p_doc_type: docType });
  if (!error && seq) return seq as string;
  const prefix = docType === "supplier" ? "SUP" : "CUS";
  return `${prefix}${Date.now().toString().slice(-6)}`;
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
        "id,product_code,description,barcode,packs_per_carton,purchase_price_pack,sale_price_pack,purchase_price_ctn,sale_price_ctn,default_shelf_life_days,is_active,category_id,brand:brands(name),category:categories(id,name)",
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

  if (entity === "categories") {
    let query = supabase
      .from("categories")
      .select("id,name,is_active")
      .order("name")
      .limit(500);
    if (q) query = query.ilike("name", `%${q}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rows: data });
  }

  if (entity === "supplier_skus") {
    const supplierId = url.searchParams.get("supplier_id");
    const skuId = url.searchParams.get("sku_id");
    let query = supabase
      .from("supplier_skus")
      .select(
        "supplier_id,sku_id,supplier_sku_code,default_purchase_price,is_active,supplier:suppliers(id,code,name),sku:skus(id,product_code,description,packs_per_carton,purchase_price_pack)",
      )
      .limit(500);
    if (supplierId) query = query.eq("supplier_id", supplierId);
    if (skuId) query = query.eq("sku_id", skuId);
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
    action: "create" | "update" | "toggle" | "upsert" | "deactivate";
    id?: string;
    data?: Record<string, unknown>;
    is_active?: boolean;
    supplier_id?: string;
    sku_id?: string;
  };

  if (!body.entity || !body.action) {
    return NextResponse.json({ error: "entity and action required" }, { status: 400 });
  }

  const admin = createServiceClient();

  try {
    if (body.entity === "supplier_skus") {
      if (body.action === "deactivate" && body.supplier_id && body.sku_id) {
        const { error } = await admin
          .from("supplier_skus")
          .update({ is_active: false })
          .eq("supplier_id", body.supplier_id)
          .eq("sku_id", body.sku_id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      if (body.action === "upsert") {
        const supplier_id = String(body.data?.supplier_id ?? body.supplier_id ?? "").trim();
        const sku_id = String(body.data?.sku_id ?? body.sku_id ?? "").trim();
        if (!supplier_id || !sku_id) throw new Error("supplier_id and sku_id required");

        const row = {
          supplier_id,
          sku_id,
          supplier_sku_code: body.data?.supplier_sku_code
            ? String(body.data.supplier_sku_code).trim()
            : null,
          default_purchase_price:
            body.data?.default_purchase_price !== "" &&
            body.data?.default_purchase_price != null
              ? Number(body.data.default_purchase_price)
              : null,
          is_active: body.data?.is_active !== false,
        };

        const { data, error } = await admin
          .from("supplier_skus")
          .upsert(row, { onConflict: "supplier_id,sku_id" })
          .select(
            "supplier_id,sku_id,supplier_sku_code,default_purchase_price,is_active,supplier:suppliers(id,code,name),sku:skus(id,product_code,description)",
          )
          .single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ row: data });
      }

      return NextResponse.json({ error: "Invalid supplier_skus action" }, { status: 400 });
    }

    const table = body.entity;

    if (body.action === "toggle" && body.id) {
      const { error } = await admin
        .from(table)
        .update({ is_active: Boolean(body.is_active) })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "create") {
      const row = (await sanitize(admin, table, body.data ?? {}, true)) as Record<
        string,
        unknown
      >;
      const { data, error } = await admin.from(table).insert(row).select("*").single();
      if (error) throw new Error(friendlyDbError(error.message, body.entity));
      return NextResponse.json({ row: data });
    }

    if (body.action === "update" && body.id) {
      const row = (await sanitize(admin, table, body.data ?? {}, false)) as Record<
        string,
        unknown
      >;
      const { data, error } = await admin
        .from(table)
        .update(row)
        .eq("id", body.id)
        .select("*")
        .single();
      if (error) throw new Error(friendlyDbError(error.message, body.entity));
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

async function sanitize(
  admin: ReturnType<typeof createServiceClient>,
  entity: Exclude<Entity, "supplier_skus">,
  data: Record<string, unknown>,
  creating: boolean,
) {
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
      category_id: data.category_id ? String(data.category_id) : null,
      packs_per_carton: Number(data.packs_per_carton || 1),
      purchase_price_pack:
        data.purchase_price_pack !== "" && data.purchase_price_pack != null
          ? Number(data.purchase_price_pack)
          : null,
      sale_price_pack:
        data.sale_price_pack !== "" && data.sale_price_pack != null
          ? Number(data.sale_price_pack)
          : null,
      purchase_price_ctn:
        data.purchase_price_ctn !== "" && data.purchase_price_ctn != null
          ? Number(data.purchase_price_ctn)
          : null,
      sale_price_ctn:
        data.sale_price_ctn !== "" && data.sale_price_ctn != null
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
    const name = String(data.name ?? "").trim();
    if (creating && !name) throw new Error("name required");
    const row: Record<string, unknown> = {
      ...(name ? { name } : {}),
      phone: data.phone ? String(data.phone).trim() : null,
      address: data.address ? String(data.address).trim() : null,
      opening_balance: Number(data.opening_balance ?? 0),
      is_active: data.is_active !== false,
    };
    if (creating) {
      row.code = await nextCode(admin, "customer");
    }
    return row;
  }

  if (entity === "categories") {
    const name = String(data.name ?? "").trim();
    if (creating && !name) throw new Error("name required");
    return {
      ...(name ? { name } : {}),
      is_active: data.is_active !== false,
    };
  }

  // suppliers
  const name = String(data.name ?? "").trim();
  if (creating && !name) throw new Error("name required");
  const row: Record<string, unknown> = {
    ...(name ? { name } : {}),
    phone: data.phone ? String(data.phone).trim() : null,
    address: data.address ? String(data.address).trim() : null,
    is_active: data.is_active !== false,
  };
  if (creating) {
    row.code = await nextCode(admin, "supplier");
  }
  return row;
}

function friendlyDbError(message: string, entity: Entity) {
  if (message.includes("categories_name_key") || message.includes("categories_name")) {
    return "A category with this name already exists.";
  }
  if (message.includes("skus_product_code") || message.includes("product_code_key")) {
    return "A SKU with this product code already exists.";
  }
  if (message.includes("customers_code") || message.includes("suppliers_code")) {
    return "This code is already in use.";
  }
  if (message.includes("duplicate key") || message.includes("unique constraint")) {
    if (entity === "categories") return "A category with this name already exists.";
    if (entity === "skus") return "A SKU with this product code already exists.";
    return "This record already exists.";
  }
  return message;
}
