import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

function num(v: string | undefined) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "csvUpload")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
  }

  const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const dataRows = rows.slice(1);
  const supabase = createServiceClient();

  if (kind === "skus") {
    // Support both our template and PriceList2026-style headers
    const idx = (names: string[]) =>
      names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;

    const col = {
      product_code: idx(["product_code", "code", "46204"]),
      description: idx(["description", "product_description"]),
      barcode: idx(["barcode"]),
      packs_per_carton: idx(["packs_per_carton", "packs_/_cartoon", "packs_/_carton"]),
      gm_per_pack: idx(["gm_per_pack", "gm/pack"]),
      price_point: idx(["price_point"]),
      purchase_price_pack: idx(["purchase_price_pack", "purchase_price_/_pack"]),
      sale_price_pack: idx(["sale_price_pack", "sale_price_/_pack"]),
      purchase_price_ctn: idx(["purchase_price_ctn", "purchase_price_/_ctn"]),
      sale_price_ctn: idx(["sale_price_ctn", "sale_price_/_ctn"]),
      shelf: idx(["default_shelf_life_days", "shelf_life_days"]),
      brand: idx(["brand"]),
    };

    // PriceList2026 often has product code as first col without header name
    if (col.product_code < 0) col.product_code = 0;
    if (col.description < 0) col.description = 1;

    const brandCache = new Map<string, string>();
    let upserted = 0;

    for (const r of dataRows) {
      const product_code = (r[col.product_code] ?? "").trim();
      const description = (r[col.description] ?? "").trim();
      if (!product_code || !description || product_code === "46204") continue;

      let brand_id: string | null = null;
      const brandName = col.brand >= 0 ? r[col.brand]?.trim() : description.split(" ")[0];
      if (brandName) {
        if (brandCache.has(brandName)) {
          brand_id = brandCache.get(brandName)!;
        } else {
          const { data: existing } = await supabase
            .from("brands")
            .select("id")
            .eq("name", brandName)
            .maybeSingle();
          if (existing?.id) {
            brand_id = existing.id;
            brandCache.set(brandName, existing.id);
          } else {
            const { data: created } = await supabase
              .from("brands")
              .insert({ name: brandName })
              .select("id")
              .single();
            if (created?.id) {
              brand_id = created.id;
              brandCache.set(brandName, created.id);
            }
          }
        }
      }

      const payload = {
        product_code,
        description,
        brand_id,
        barcode: col.barcode >= 0 ? r[col.barcode] || null : product_code,
        packs_per_carton: Math.max(1, Math.round(num(r[col.packs_per_carton]) ?? 1)),
        gm_per_pack: num(r[col.gm_per_pack]),
        price_point: num(r[col.price_point]),
        purchase_price_pack: num(r[col.purchase_price_pack]),
        sale_price_pack: num(r[col.sale_price_pack]),
        purchase_price_ctn: num(r[col.purchase_price_ctn]),
        sale_price_ctn: num(r[col.sale_price_ctn]),
        default_shelf_life_days:
          col.shelf >= 0 ? (num(r[col.shelf]) as number | null) : null,
        is_active: true,
      };

      const { error } = await supabase
        .from("skus")
        .upsert(payload, { onConflict: "product_code" });
      if (error) {
        return NextResponse.json(
          { error: `SKU ${product_code}: ${error.message}` },
          { status: 400 },
        );
      }
      upserted += 1;
    }

    return NextResponse.json({
      ok: true,
      message: `Imported / updated ${upserted} SKUs`,
    });
  }

  if (kind === "customer_openings") {
    let upserted = 0;
    const col = {
      code: header.indexOf("customer_code"),
      name: header.indexOf("customer_name"),
      address: header.indexOf("address"),
      phone: header.indexOf("phone"),
      balance: header.indexOf("opening_balance"),
      route: header.indexOf("route_code"),
    };
    if (col.code < 0 || col.name < 0) {
      return NextResponse.json(
        { error: "Need customer_code and customer_name columns" },
        { status: 400 },
      );
    }

    for (const r of dataRows) {
      const code = r[col.code]?.trim();
      const name = r[col.name]?.trim();
      if (!code || !name) continue;

      let route_id: string | null = null;
      const routeCode = col.route >= 0 ? r[col.route]?.trim() : "";
      if (routeCode) {
        const { data: route } = await supabase
          .from("routes")
          .upsert({ code: routeCode, name: routeCode, route_type: "mixed" }, { onConflict: "code" })
          .select("id")
          .single();
        route_id = route?.id ?? null;
      }

      const { error } = await supabase.from("customers").upsert(
        {
          code,
          name,
          address: col.address >= 0 ? r[col.address] || null : null,
          phone: col.phone >= 0 ? r[col.phone] || null : null,
          opening_balance: num(r[col.balance]) ?? 0,
          route_id,
          is_active: true,
        },
        { onConflict: "code" },
      );
      if (error) {
        return NextResponse.json(
          { error: `Customer ${code}: ${error.message}` },
          { status: 400 },
        );
      }
      upserted += 1;
    }

    return NextResponse.json({
      ok: true,
      message: `Imported / updated ${upserted} customers`,
    });
  }

  if (kind === "opening_stock") {
    const required = [
      "product_code",
      "batch_code",
      "qty_units",
    ];
    for (const c of required) {
      if (!header.includes(c)) {
        return NextResponse.json(
          { error: `Missing column: ${c}` },
          { status: 400 },
        );
      }
    }

    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("id,code")
      .eq("code", "MAIN_WHS")
      .maybeSingle();

    if (!warehouse) {
      return NextResponse.json({ error: "MAIN_WHS missing" }, { status: 400 });
    }

    let upserted = 0;
    for (const r of dataRows) {
      const get = (name: string) => r[header.indexOf(name)] ?? "";
      const product_code = get("product_code").trim();
      const batch_code = get("batch_code").trim();
      const qty = num(get("qty_units")) ?? 0;
      if (!product_code || !batch_code || qty <= 0) continue;

      const { data: sku } = await supabase
        .from("skus")
        .select("id,purchase_price_pack")
        .eq("product_code", product_code)
        .maybeSingle();
      if (!sku) {
        return NextResponse.json(
          { error: `Unknown SKU ${product_code}` },
          { status: 400 },
        );
      }

      const mfg = get("mfg_date") || null;
      const expiry = get("expiry_date") || null;
      const condition = (get("condition") || "good") as
        | "good"
        | "near_expiry"
        | "damaged"
        | "hold";

      const { data: batch, error: batchError } = await supabase
        .from("batches")
        .upsert(
          {
            sku_id: sku.id,
            batch_code,
            mfg_date: mfg,
            expiry_date: expiry,
            is_unknown: false,
          },
          { onConflict: "sku_id,batch_code" },
        )
        .select("id")
        .single();
      if (batchError || !batch) {
        return NextResponse.json(
          { error: batchError?.message ?? "Batch failed" },
          { status: 400 },
        );
      }

      const purchase = num(get("purchase_price_pack")) ?? sku.purchase_price_pack;

      const { error: balError } = await supabase.from("stock_balances").upsert(
        {
          warehouse_id: warehouse.id,
          sku_id: sku.id,
          batch_id: batch.id,
          condition,
          qty_units: qty,
          finance_status: "posted",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict:
            "warehouse_id,sku_id,batch_id,condition,finance_status,coalesce(bin_id, '00000000-0000-0000-0000-000000000000')",
        },
      );

      // Fallback if upsert conflict target not supported via PostgREST
      if (balError) {
        const { data: existing } = await supabase
          .from("stock_balances")
          .select("id,qty_units")
          .eq("warehouse_id", warehouse.id)
          .eq("sku_id", sku.id)
          .eq("batch_id", batch.id)
          .eq("condition", condition)
          .eq("finance_status", "posted")
          .is("bin_id", null)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("stock_balances")
            .update({ qty_units: qty, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          const { error: insertError } = await supabase.from("stock_balances").insert({
            warehouse_id: warehouse.id,
            sku_id: sku.id,
            batch_id: batch.id,
            condition,
            qty_units: qty,
            finance_status: "posted",
          });
          if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 400 });
          }
        }
      }

      await supabase.from("stock_movements").insert({
        movement_type: "opening_in",
        warehouse_id: warehouse.id,
        sku_id: sku.id,
        batch_id: batch.id,
        condition,
        qty_units: qty,
        unit_purchase_price: purchase,
        finance_status: "posted",
        document_type: "opening_csv",
        document_no: file.name,
        created_by: profile!.id,
      });

      upserted += 1;
    }

    return NextResponse.json({
      ok: true,
      message: `Imported ${upserted} opening stock lines (finance posted)`,
    });
  }

  return NextResponse.json({ error: "Unknown import kind" }, { status: 400 });
}
