import { NextResponse } from "next/server";

import type { createServiceClient } from "@/lib/supabase/middleware";

type Admin = ReturnType<typeof createServiceClient>;

type ProfileLite = { id: string; full_name: string | null; email: string };

const CSV_LIMIT = 10000;

export function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

export function csvResponse(filename: string, headers: string[], rows: Array<Record<string, unknown>>) {
  const body = toCsv(
    headers,
    rows.map((r) => headers.map((h) => r[h])),
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function karachiFrom(from: string | null) {
  return from ? `${from}T00:00:00+05:00` : null;
}

function karachiTo(to: string | null) {
  return to ? `${to}T23:59:59+05:00` : null;
}

async function fetchProfiles(admin: Admin, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, ProfileLite>();
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data } = await admin.from("profiles").select("id,full_name,email").in("id", chunk);
    for (const p of data ?? []) {
      map.set(String(p.id), p as ProfileLite);
    }
  }
  return map;
}

function actorCols(prefix: string, id: string | null | undefined, profiles: Map<string, ProfileLite>) {
  const p = id ? profiles.get(id) : undefined;
  return {
    [`${prefix}_user_id`]: id ?? "",
    [`${prefix}_user_name`]: p?.full_name ?? "",
    [`${prefix}_user_email`]: p?.email ?? "",
  };
}

function asObj<T>(v: unknown): T | null {
  return v && typeof v === "object" ? (v as T) : null;
}

/** Flatten one row's keys in header order — missing keys become "". */
export function rowValues(headers: string[], row: Record<string, unknown>) {
  return headers.map((h) => row[h] ?? "");
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export async function exportStock(admin: Admin, showFinance: boolean) {
  const { data, error } = await admin
    .from("stock_balances")
    .select(
      "id,qty_units,condition,finance_status,updated_at,bin_id,warehouse_id,sku_id,batch_id,sku:skus(id,product_code,description,barcode,purchase_price_pack,sale_price_pack,packs_per_carton,category:categories(name),brand:brands(name)),batch:batches(id,batch_code,mfg_date,expiry_date,is_unknown,notes,created_at),warehouse:warehouses(id,code,name),bin:bins(id,code)",
    )
    .gt("qty_units", 0)
    .order("updated_at", { ascending: false })
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => {
    const sku = asObj<{
      id?: string;
      product_code?: string;
      description?: string;
      barcode?: string | null;
      purchase_price_pack?: number | null;
      sale_price_pack?: number | null;
      packs_per_carton?: number | null;
      category?: { name?: string } | null;
      brand?: { name?: string } | null;
    }>(r.sku);
    const batch = asObj<{
      id?: string;
      batch_code?: string;
      mfg_date?: string | null;
      expiry_date?: string | null;
      is_unknown?: boolean;
      notes?: string | null;
      created_at?: string;
    }>(r.batch);
    const wh = asObj<{ id?: string; code?: string; name?: string }>(r.warehouse);
    const bin = asObj<{ id?: string; code?: string }>(r.bin);
    const qty = Number(r.qty_units);
    const purchase = Number(sku?.purchase_price_pack ?? 0);
    const sale = Number(sku?.sale_price_pack ?? 0);
    return {
      stock_balance_id: r.id,
      warehouse_id: r.warehouse_id,
      warehouse_code: wh?.code ?? "",
      warehouse_name: wh?.name ?? "",
      bin_id: r.bin_id ?? "",
      bin_code: bin?.code ?? "",
      sku_id: r.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      brand: sku?.brand?.name ?? "",
      category: sku?.category?.name ?? "",
      packs_per_carton: sku?.packs_per_carton ?? "",
      batch_id: r.batch_id,
      batch_code: batch?.batch_code ?? "",
      mfg_date: batch?.mfg_date ?? "",
      expiry_date: batch?.expiry_date ?? "",
      batch_is_unknown: batch?.is_unknown ?? "",
      batch_notes: batch?.notes ?? "",
      batch_created_at: batch?.created_at ?? "",
      condition: r.condition,
      finance_status: r.finance_status,
      qty_units: qty,
      purchase_price_pack: showFinance ? purchase : "",
      sale_price_pack: showFinance ? sale : "",
      inventory_value: showFinance ? qty * purchase : "",
      sale_value: showFinance ? qty * sale : "",
      updated_at: r.updated_at,
    };
  });

  const headers = [
    "stock_balance_id",
    "warehouse_id",
    "warehouse_code",
    "warehouse_name",
    "bin_id",
    "bin_code",
    "sku_id",
    "product_code",
    "description",
    "barcode",
    "brand",
    "category",
    "packs_per_carton",
    "batch_id",
    "batch_code",
    "mfg_date",
    "expiry_date",
    "batch_is_unknown",
    "batch_notes",
    "batch_created_at",
    "condition",
    "finance_status",
    "qty_units",
    ...(showFinance
      ? ["purchase_price_pack", "sale_price_pack", "inventory_value", "sale_value"]
      : []),
    "updated_at",
  ];
  return csvResponse("stock-report-detail.csv", headers, rows);
}

// ─── Movements ───────────────────────────────────────────────────────────────

export async function exportMovements(
  admin: Admin,
  opts: { from: string | null; to: string | null; q: string; documentTypes: string[]; showFinance: boolean },
) {
  let query = admin
    .from("stock_movements")
    .select(
      "id,movement_type,qty_units,condition,finance_status,unit_purchase_price,unit_sale_price,document_type,document_id,document_no,notes,created_by,created_at,warehouse_id,bin_id,sku_id,batch_id,sku:skus(product_code,description,barcode),batch:batches(batch_code,mfg_date,expiry_date),warehouse:warehouses(code,name),bin:bins(code)",
    )
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  const fromTs = karachiFrom(opts.from);
  const toTs = karachiTo(opts.to);
  if (fromTs) query = query.gte("created_at", fromTs);
  if (toTs) query = query.lte("created_at", toTs);
  if (opts.documentTypes.length === 1) query = query.eq("document_type", opts.documentTypes[0]);
  else if (opts.documentTypes.length > 1) query = query.in("document_type", opts.documentTypes);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).map((m) => m.created_by as string | null),
  );

  let rows: Array<Record<string, unknown>> = (data ?? []).map((m) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(m.sku);
    const batch = asObj<{ batch_code?: string; mfg_date?: string | null; expiry_date?: string | null }>(
      m.batch,
    );
    const wh = asObj<{ code?: string; name?: string }>(m.warehouse);
    const bin = asObj<{ code?: string }>(m.bin);
    return {
      movement_id: m.id,
      created_at: m.created_at,
      ...actorCols("created_by", m.created_by as string | null, profiles),
      movement_type: m.movement_type,
      warehouse_id: m.warehouse_id,
      warehouse_code: wh?.code ?? "",
      warehouse_name: wh?.name ?? "",
      bin_id: m.bin_id ?? "",
      bin_code: bin?.code ?? "",
      sku_id: m.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      batch_id: m.batch_id,
      batch_code: batch?.batch_code ?? "",
      mfg_date: batch?.mfg_date ?? "",
      expiry_date: batch?.expiry_date ?? "",
      condition: m.condition,
      finance_status: m.finance_status,
      qty_units: Number(m.qty_units),
      unit_purchase_price: opts.showFinance ? (m.unit_purchase_price ?? "") : "",
      unit_sale_price: opts.showFinance ? (m.unit_sale_price ?? "") : "",
      document_type: m.document_type ?? "",
      document_id: m.document_id ?? "",
      document_no: m.document_no ?? "",
      notes: m.notes ?? "",
    };
  });

  if (opts.q) {
    const s = opts.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        String(r.product_code).toLowerCase().includes(s) ||
        String(r.batch_code).toLowerCase().includes(s) ||
        String(r.document_no).toLowerCase().includes(s) ||
        String(r.movement_type).toLowerCase().includes(s) ||
        String(r.created_by_user_name).toLowerCase().includes(s) ||
        String(r.created_by_user_email).toLowerCase().includes(s),
    );
  }

  const headers = [
    "movement_id",
    "created_at",
    "created_by_user_id",
    "created_by_user_name",
    "created_by_user_email",
    "movement_type",
    "warehouse_id",
    "warehouse_code",
    "warehouse_name",
    "bin_id",
    "bin_code",
    "sku_id",
    "product_code",
    "description",
    "barcode",
    "batch_id",
    "batch_code",
    "mfg_date",
    "expiry_date",
    "condition",
    "finance_status",
    "qty_units",
    ...(opts.showFinance ? ["unit_purchase_price", "unit_sale_price"] : []),
    "document_type",
    "document_id",
    "document_no",
    "notes",
  ];
  const filename =
    opts.documentTypes.length > 0
      ? `${opts.documentTypes.join("-")}-movements-detail.csv`
      : "movements-report-detail.csv";
  return csvResponse(filename, headers, rows);
}

// ─── Batch recall ────────────────────────────────────────────────────────────

export async function exportRecall(admin: Admin, q: string) {
  if (!q) throw new Error("Enter batch code or barcode / SKU");

  const { data: byCode } = await admin
    .from("batches")
    .select("id,batch_code,mfg_date,expiry_date,sku_id,is_unknown,notes,created_at,sku:skus(product_code,description,barcode)")
    .ilike("batch_code", `%${q}%`)
    .limit(50);

  const { data: skusByBarcode } = await admin
    .from("skus")
    .select("id")
    .or(`barcode.eq.${q},product_code.ilike.%${q}%`)
    .limit(20);
  const skuIds = (skusByBarcode ?? []).map((s) => s.id as string);
  let bySku: NonNullable<typeof byCode> = [];
  if (skuIds.length) {
    const { data } = await admin
      .from("batches")
      .select(
        "id,batch_code,mfg_date,expiry_date,sku_id,is_unknown,notes,created_at,sku:skus(product_code,description,barcode)",
      )
      .in("sku_id", skuIds)
      .limit(50);
    bySku = data ?? [];
  }

  const batchMap = new Map<string, (typeof byCode extends (infer T)[] | null ? T : never)>();
  for (const b of [...(byCode ?? []), ...bySku]) batchMap.set(b.id as string, b);
  const batches = [...batchMap.values()];
  const batchIds = batches.map((b) => b.id as string);
  if (!batchIds.length) {
    return csvResponse(
      "batch-recall-detail.csv",
      ["note"],
      [{ note: "No batches matched" }],
    );
  }

  const [{ data: balances }, { data: movements }, { data: gpLines }] = await Promise.all([
    admin
      .from("stock_balances")
      .select(
        "id,qty_units,condition,finance_status,updated_at,batch_id,sku:skus(product_code,description),batch:batches(batch_code),warehouse:warehouses(code,name)",
      )
      .in("batch_id", batchIds),
    admin
      .from("stock_movements")
      .select(
        "id,movement_type,qty_units,condition,finance_status,document_type,document_id,document_no,notes,created_by,created_at,batch_id,sku:skus(product_code),batch:batches(batch_code),warehouse:warehouses(code)",
      )
      .in("batch_id", batchIds)
      .order("created_at", { ascending: false })
      .limit(CSV_LIMIT),
    admin
      .from("gate_pass_lines")
      .select(
        "id,qty_units,batch_id,is_override,override_approved_by,sku:skus(product_code),batch:batches(batch_code),gate_pass:gate_passes(gate_pass_no,status,issued_at,issued_by,security_out_at,security_out_by_name,picklist:picklists(picklist_no,delivery_date,picklist_customers(customer:customers(code,name))))",
      )
      .in("batch_id", batchIds)
      .limit(2000),
  ]);

  const profiles = await fetchProfiles(admin, [
    ...(movements ?? []).map((m) => m.created_by as string | null),
    ...(gpLines ?? []).map((l) => {
      const gp = asObj<{ issued_by?: string | null }>(l.gate_pass);
      return gp?.issued_by ?? null;
    }),
    ...(gpLines ?? []).map((l) => l.override_approved_by as string | null),
  ]);

  const rows: Array<Record<string, unknown>> = [];

  for (const b of batches) {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(b.sku);
    rows.push({
      section: "batch",
      batch_id: b.id,
      batch_code: b.batch_code,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      mfg_date: b.mfg_date ?? "",
      expiry_date: b.expiry_date ?? "",
      is_unknown: b.is_unknown ?? "",
      notes: b.notes ?? "",
      created_at: b.created_at ?? "",
    });
  }

  for (const bal of balances ?? []) {
    const sku = asObj<{ product_code?: string; description?: string }>(bal.sku);
    const batch = asObj<{ batch_code?: string }>(bal.batch);
    const wh = asObj<{ code?: string; name?: string }>(bal.warehouse);
    rows.push({
      section: "on_hand",
      stock_balance_id: bal.id,
      batch_id: bal.batch_id,
      batch_code: batch?.batch_code ?? "",
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      warehouse_code: wh?.code ?? "",
      warehouse_name: wh?.name ?? "",
      condition: bal.condition,
      finance_status: bal.finance_status,
      qty_units: bal.qty_units,
      updated_at: bal.updated_at,
    });
  }

  for (const m of movements ?? []) {
    const sku = asObj<{ product_code?: string }>(m.sku);
    const batch = asObj<{ batch_code?: string }>(m.batch);
    const wh = asObj<{ code?: string }>(m.warehouse);
    rows.push({
      section: "movement",
      movement_id: m.id,
      created_at: m.created_at,
      ...actorCols("created_by", m.created_by as string | null, profiles),
      movement_type: m.movement_type,
      batch_id: m.batch_id,
      batch_code: batch?.batch_code ?? "",
      product_code: sku?.product_code ?? "",
      warehouse_code: wh?.code ?? "",
      condition: m.condition,
      finance_status: m.finance_status,
      qty_units: m.qty_units,
      document_type: m.document_type ?? "",
      document_id: m.document_id ?? "",
      document_no: m.document_no ?? "",
      notes: m.notes ?? "",
    });
  }

  for (const line of gpLines ?? []) {
    const gp = asObj<{
      gate_pass_no?: string;
      status?: string;
      issued_at?: string | null;
      issued_by?: string | null;
      security_out_at?: string | null;
      security_out_by_name?: string | null;
      picklist?: {
        picklist_no?: string;
        delivery_date?: string;
        picklist_customers?: Array<{ customer?: { code?: string; name?: string } | null }>;
      } | null;
    }>(line.gate_pass);
    const sku = asObj<{ product_code?: string }>(line.sku);
    const batch = asObj<{ batch_code?: string }>(line.batch);
    const pcs = gp?.picklist?.picklist_customers ?? [];
    const customers =
      pcs.length > 0
        ? pcs
        : [{ customer: { code: "", name: "(route / multi)" } }];
    for (const pc of customers) {
      rows.push({
        section: "customer_distribution",
        gate_pass_line_id: line.id,
        gate_pass_no: gp?.gate_pass_no ?? "",
        gate_pass_status: gp?.status ?? "",
        issued_at: gp?.issued_at ?? "",
        ...actorCols("issued_by", gp?.issued_by, profiles),
        security_out_at: gp?.security_out_at ?? "",
        security_out_by_name: gp?.security_out_by_name ?? "",
        picklist_no: gp?.picklist?.picklist_no ?? "",
        delivery_date: gp?.picklist?.delivery_date ?? "",
        customer_code: pc.customer?.code ?? "",
        customer_name: pc.customer?.name ?? "",
        batch_id: line.batch_id,
        batch_code: batch?.batch_code ?? "",
        product_code: sku?.product_code ?? "",
        qty_units: line.qty_units,
        is_override: line.is_override ?? "",
        ...actorCols("override_approved_by", line.override_approved_by as string | null, profiles),
      });
    }
  }

  const headers = [
    "section",
    "batch_id",
    "batch_code",
    "product_code",
    "description",
    "barcode",
    "mfg_date",
    "expiry_date",
    "is_unknown",
    "notes",
    "created_at",
    "stock_balance_id",
    "warehouse_code",
    "warehouse_name",
    "condition",
    "finance_status",
    "qty_units",
    "updated_at",
    "movement_id",
    "created_by_user_id",
    "created_by_user_name",
    "created_by_user_email",
    "movement_type",
    "document_type",
    "document_id",
    "document_no",
    "gate_pass_line_id",
    "gate_pass_no",
    "gate_pass_status",
    "issued_at",
    "issued_by_user_id",
    "issued_by_user_name",
    "issued_by_user_email",
    "security_out_at",
    "security_out_by_name",
    "picklist_no",
    "delivery_date",
    "customer_code",
    "customer_name",
    "is_override",
    "override_approved_by_user_id",
    "override_approved_by_user_name",
    "override_approved_by_user_email",
  ];
  return csvResponse("batch-recall-detail.csv", headers, rows);
}

// ─── Sales (picklist lines) ──────────────────────────────────────────────────

export async function exportSales(
  admin: Admin,
  from: string | null,
  to: string | null,
  opts: { pickedOnly?: boolean; filename?: string } = {},
) {
  let headerQuery = admin
    .from("picklists")
    .select("id")
    .order("delivery_date", { ascending: false })
    .limit(CSV_LIMIT);
  if (from) headerQuery = headerQuery.gte("delivery_date", from);
  if (to) headerQuery = headerQuery.lte("delivery_date", to);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const picklistIds = (headersData ?? []).map((h) => h.id as string);
  if (!picklistIds.length) {
    return csvResponse(opts.filename ?? "sales-report-detail.csv", ["note"], [
      { note: "No picklists in range" },
    ]);
  }

  let query = admin
    .from("picklist_lines")
    .select(
      "id,line_no,qty_ordered_units,qty_foc_units,qty_exchange_units,qty_picked_units,qty_delivered_units,qty_load_in_good_units,qty_load_in_bad_units,sale_price_pack,line_sale_amount,batch_override_pending,sku_id,suggested_batch_id,scanned_batch_id,approved_batch_id,sku:skus(product_code,description,barcode),suggested_batch:batches!suggested_batch_id(batch_code),scanned_batch:batches!scanned_batch_id(batch_code),approved_batch:batches!approved_batch_id(batch_code),picklist_customer:picklist_customers(invoice_no,sequence_no,notes,customer:customers(code,name)),picklist:picklists!inner(id,picklist_no,delivery_date,status,load_out_at,load_out_by,load_in_at,load_in_by,created_by,created_at,updated_at,warehouse:warehouses(code,name),psr_route:routes!psr_route_id(code,name),da_route:routes!da_route_id(code,name))",
    )
    .in("picklist_id", picklistIds)
    .order("line_no")
    .limit(CSV_LIMIT);
  if (opts.pickedOnly) query = query.gt("qty_picked_units", 0);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(admin, [
    ...(data ?? []).flatMap((l) => {
      const pl = asObj<{
        created_by?: string | null;
        load_out_by?: string | null;
        load_in_by?: string | null;
      }>(l.picklist);
      return [pl?.created_by, pl?.load_out_by, pl?.load_in_by];
    }),
  ]);

  const rows = (data ?? []).map((l) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(l.sku);
    const pl = asObj<{
      id?: string;
      picklist_no?: string;
      delivery_date?: string;
      status?: string;
      load_out_at?: string | null;
      load_out_by?: string | null;
      load_in_at?: string | null;
      load_in_by?: string | null;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
      warehouse?: { code?: string; name?: string } | null;
      psr_route?: { code?: string; name?: string } | null;
      da_route?: { code?: string; name?: string } | null;
    }>(l.picklist);
    const pc = asObj<{
      invoice_no?: string | null;
      sequence_no?: number;
      notes?: string | null;
      customer?: { code?: string; name?: string } | null;
    }>(l.picklist_customer);
    const suggested = asObj<{ batch_code?: string }>(l.suggested_batch);
    const scanned = asObj<{ batch_code?: string }>(l.scanned_batch);
    const approved = asObj<{ batch_code?: string }>(l.approved_batch);
    return {
      picklist_line_id: l.id,
      picklist_id: pl?.id ?? "",
      picklist_no: pl?.picklist_no ?? "",
      delivery_date: pl?.delivery_date ?? "",
      picklist_status: pl?.status ?? "",
      warehouse_code: pl?.warehouse?.code ?? "",
      warehouse_name: pl?.warehouse?.name ?? "",
      psr_route_code: pl?.psr_route?.code ?? "",
      psr_route_name: pl?.psr_route?.name ?? "",
      da_route_code: pl?.da_route?.code ?? "",
      da_route_name: pl?.da_route?.name ?? "",
      load_out_at: pl?.load_out_at ?? "",
      ...actorCols("load_out_by", pl?.load_out_by, profiles),
      load_in_at: pl?.load_in_at ?? "",
      ...actorCols("load_in_by", pl?.load_in_by, profiles),
      ...actorCols("created_by", pl?.created_by, profiles),
      picklist_created_at: pl?.created_at ?? "",
      picklist_updated_at: pl?.updated_at ?? "",
      customer_code: pc?.customer?.code ?? "",
      customer_name: pc?.customer?.name ?? "",
      invoice_no: pc?.invoice_no ?? "",
      customer_sequence_no: pc?.sequence_no ?? "",
      customer_notes: pc?.notes ?? "",
      line_no: l.line_no,
      sku_id: l.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      suggested_batch_id: l.suggested_batch_id ?? "",
      suggested_batch_code: suggested?.batch_code ?? "",
      scanned_batch_id: l.scanned_batch_id ?? "",
      scanned_batch_code: scanned?.batch_code ?? "",
      approved_batch_id: l.approved_batch_id ?? "",
      approved_batch_code: approved?.batch_code ?? "",
      batch_override_pending: l.batch_override_pending ?? "",
      qty_ordered_units: l.qty_ordered_units,
      qty_foc_units: l.qty_foc_units,
      qty_exchange_units: l.qty_exchange_units,
      qty_picked_units: l.qty_picked_units,
      qty_delivered_units: l.qty_delivered_units,
      qty_load_in_good_units: l.qty_load_in_good_units,
      qty_load_in_bad_units: l.qty_load_in_bad_units,
      sale_price_pack: l.sale_price_pack ?? "",
      line_sale_amount: l.line_sale_amount ?? "",
    };
  });

  const headers = [
    "picklist_line_id",
    "picklist_id",
    "picklist_no",
    "delivery_date",
    "picklist_status",
    "warehouse_code",
    "warehouse_name",
    "psr_route_code",
    "psr_route_name",
    "da_route_code",
    "da_route_name",
    "load_out_at",
    "load_out_by_user_id",
    "load_out_by_user_name",
    "load_out_by_user_email",
    "load_in_at",
    "load_in_by_user_id",
    "load_in_by_user_name",
    "load_in_by_user_email",
    "created_by_user_id",
    "created_by_user_name",
    "created_by_user_email",
    "picklist_created_at",
    "picklist_updated_at",
    "customer_code",
    "customer_name",
    "invoice_no",
    "customer_sequence_no",
    "customer_notes",
    "line_no",
    "sku_id",
    "product_code",
    "description",
    "barcode",
    "suggested_batch_id",
    "suggested_batch_code",
    "scanned_batch_id",
    "scanned_batch_code",
    "approved_batch_id",
    "approved_batch_code",
    "batch_override_pending",
    "qty_ordered_units",
    "qty_foc_units",
    "qty_exchange_units",
    "qty_picked_units",
    "qty_delivered_units",
    "qty_load_in_good_units",
    "qty_load_in_bad_units",
    "sale_price_pack",
    "line_sale_amount",
  ];
  return csvResponse(opts.filename ?? "sales-report-detail.csv", headers, rows);
}

// ─── Purchase orders (line detail) ───────────────────────────────────────────

export async function exportPo(admin: Admin, from: string | null, to: string | null) {
  let headerQuery = admin
    .from("purchase_orders")
    .select("id")
    .order("order_date", { ascending: false })
    .limit(CSV_LIMIT);
  if (from) headerQuery = headerQuery.gte("order_date", from);
  if (to) headerQuery = headerQuery.lte("order_date", to);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const poIds = (headersData ?? []).map((h) => h.id as string);
  if (!poIds.length) {
    return csvResponse("po-report-detail.csv", ["note"], [{ note: "No purchase orders in range" }]);
  }

  const { data, error } = await admin
    .from("purchase_order_lines")
    .select(
      "id,line_no,uom,qty_ordered,qty_ordered_units,qty_received_units,unit_price,line_amount,sku_id,sku:skus(product_code,description,barcode),po:purchase_orders!inner(id,po_no,order_date,expected_date,status,remarks,created_by,created_at,updated_at,supplier:suppliers(code,name,phone),warehouse:warehouses(code,name))",
    )
    .in("po_id", poIds)
    .order("line_no")
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).map((l) => asObj<{ created_by?: string | null }>(l.po)?.created_by),
  );

  const rows = (data ?? []).map((l) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(l.sku);
    const po = asObj<{
      id?: string;
      po_no?: string;
      order_date?: string;
      expected_date?: string | null;
      status?: string;
      remarks?: string | null;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
      supplier?: { code?: string; name?: string; phone?: string | null } | null;
      warehouse?: { code?: string; name?: string } | null;
    }>(l.po);
    return {
      po_line_id: l.id,
      po_id: po?.id ?? "",
      po_no: po?.po_no ?? "",
      order_date: po?.order_date ?? "",
      expected_date: po?.expected_date ?? "",
      status: po?.status ?? "",
      supplier_code: po?.supplier?.code ?? "",
      supplier_name: po?.supplier?.name ?? "",
      supplier_phone: po?.supplier?.phone ?? "",
      warehouse_code: po?.warehouse?.code ?? "",
      warehouse_name: po?.warehouse?.name ?? "",
      remarks: po?.remarks ?? "",
      ...actorCols("created_by", po?.created_by, profiles),
      created_at: po?.created_at ?? "",
      updated_at: po?.updated_at ?? "",
      line_no: l.line_no,
      sku_id: l.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      uom: l.uom,
      qty_ordered: l.qty_ordered,
      qty_ordered_units: l.qty_ordered_units,
      qty_received_units: l.qty_received_units,
      unit_price: l.unit_price,
      line_amount: l.line_amount,
    };
  });

  return csvResponse(
    "po-report-detail.csv",
    [
      "po_line_id",
      "po_id",
      "po_no",
      "order_date",
      "expected_date",
      "status",
      "supplier_code",
      "supplier_name",
      "supplier_phone",
      "warehouse_code",
      "warehouse_name",
      "remarks",
      "created_by_user_id",
      "created_by_user_name",
      "created_by_user_email",
      "created_at",
      "updated_at",
      "line_no",
      "sku_id",
      "product_code",
      "description",
      "barcode",
      "uom",
      "qty_ordered",
      "qty_ordered_units",
      "qty_received_units",
      "unit_price",
      "line_amount",
    ],
    rows,
  );
}

// ─── GRN (line detail) ───────────────────────────────────────────────────────

export async function exportGrn(admin: Admin, from: string | null, to: string | null) {
  let headerQuery = admin
    .from("grns")
    .select("id")
    .order("delivery_date", { ascending: false })
    .limit(CSV_LIMIT);
  if (from) headerQuery = headerQuery.gte("delivery_date", from);
  if (to) headerQuery = headerQuery.lte("delivery_date", to);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const grnIds = (headersData ?? []).map((h) => h.id as string);
  if (!grnIds.length) {
    return csvResponse("grn-report-detail.csv", ["note"], [{ note: "No GRNs in range" }]);
  }

  const { data, error } = await admin
    .from("grn_lines")
    .select(
      "id,line_no,batch_code,mfg_date,expiry_date,qty_cases,qty_units,shortage_units,damage_units,purchase_price_pack,purchase_price_ctn,line_amount,finance_status,sku_id,batch_id,bin_id,po_line_id,sku:skus(product_code,description,barcode),batch:batches(batch_code),bin:bins(code),grn:grns!inner(id,grn_no,supplier_delivery_no,delivery_date,truck_no,transporter_name,remarks,status,physical_posted_at,physical_posted_by,finance_status,finance_posted_at,finance_posted_by,supplier_invoice_no,supplier_invoice_date,invoice_tax_amount,invoice_discount_amount,invoice_total_amount,created_by,created_at,updated_at,supplier:suppliers(code,name),warehouse:warehouses(code,name),po:purchase_orders(po_no))",
    )
    .in("grn_id", grnIds)
    .order("line_no")
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).flatMap((l) => {
      const g = asObj<{
        created_by?: string | null;
        physical_posted_by?: string | null;
        finance_posted_by?: string | null;
      }>(l.grn);
      return [g?.created_by, g?.physical_posted_by, g?.finance_posted_by];
    }),
  );

  const rows = (data ?? []).map((l) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(l.sku);
    const batch = asObj<{ batch_code?: string }>(l.batch);
    const bin = asObj<{ code?: string }>(l.bin);
    const g = asObj<{
      id?: string;
      grn_no?: string;
      supplier_delivery_no?: string | null;
      delivery_date?: string;
      truck_no?: string | null;
      transporter_name?: string | null;
      remarks?: string | null;
      status?: string;
      physical_posted_at?: string | null;
      physical_posted_by?: string | null;
      finance_status?: string;
      finance_posted_at?: string | null;
      finance_posted_by?: string | null;
      supplier_invoice_no?: string | null;
      supplier_invoice_date?: string | null;
      invoice_tax_amount?: number | null;
      invoice_discount_amount?: number | null;
      invoice_total_amount?: number | null;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
      supplier?: { code?: string; name?: string } | null;
      warehouse?: { code?: string; name?: string } | null;
      po?: { po_no?: string } | null;
    }>(l.grn);
    return {
      grn_line_id: l.id,
      grn_id: g?.id ?? "",
      grn_no: g?.grn_no ?? "",
      po_no: g?.po?.po_no ?? "",
      delivery_date: g?.delivery_date ?? "",
      supplier_delivery_no: g?.supplier_delivery_no ?? "",
      status: g?.status ?? "",
      header_finance_status: g?.finance_status ?? "",
      physical_posted_at: g?.physical_posted_at ?? "",
      ...actorCols("physical_posted_by", g?.physical_posted_by, profiles),
      finance_posted_at: g?.finance_posted_at ?? "",
      ...actorCols("finance_posted_by", g?.finance_posted_by, profiles),
      supplier_code: g?.supplier?.code ?? "",
      supplier_name: g?.supplier?.name ?? "",
      warehouse_code: g?.warehouse?.code ?? "",
      warehouse_name: g?.warehouse?.name ?? "",
      truck_no: g?.truck_no ?? "",
      transporter_name: g?.transporter_name ?? "",
      remarks: g?.remarks ?? "",
      supplier_invoice_no: g?.supplier_invoice_no ?? "",
      supplier_invoice_date: g?.supplier_invoice_date ?? "",
      invoice_tax_amount: g?.invoice_tax_amount ?? "",
      invoice_discount_amount: g?.invoice_discount_amount ?? "",
      invoice_total_amount: g?.invoice_total_amount ?? "",
      ...actorCols("created_by", g?.created_by, profiles),
      created_at: g?.created_at ?? "",
      updated_at: g?.updated_at ?? "",
      line_no: l.line_no,
      sku_id: l.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      batch_id: l.batch_id ?? "",
      batch_code: l.batch_code ?? batch?.batch_code ?? "",
      mfg_date: l.mfg_date ?? "",
      expiry_date: l.expiry_date ?? "",
      bin_id: l.bin_id ?? "",
      bin_code: bin?.code ?? "",
      po_line_id: l.po_line_id ?? "",
      qty_cases: l.qty_cases,
      qty_units: l.qty_units,
      shortage_units: l.shortage_units,
      damage_units: l.damage_units,
      purchase_price_pack: l.purchase_price_pack ?? "",
      purchase_price_ctn: l.purchase_price_ctn ?? "",
      line_amount: l.line_amount ?? "",
      line_finance_status: l.finance_status,
    };
  });

  return csvResponse(
    "grn-report-detail.csv",
    [
      "grn_line_id",
      "grn_id",
      "grn_no",
      "po_no",
      "delivery_date",
      "supplier_delivery_no",
      "status",
      "header_finance_status",
      "physical_posted_at",
      "physical_posted_by_user_id",
      "physical_posted_by_user_name",
      "physical_posted_by_user_email",
      "finance_posted_at",
      "finance_posted_by_user_id",
      "finance_posted_by_user_name",
      "finance_posted_by_user_email",
      "supplier_code",
      "supplier_name",
      "warehouse_code",
      "warehouse_name",
      "truck_no",
      "transporter_name",
      "remarks",
      "supplier_invoice_no",
      "supplier_invoice_date",
      "invoice_tax_amount",
      "invoice_discount_amount",
      "invoice_total_amount",
      "created_by_user_id",
      "created_by_user_name",
      "created_by_user_email",
      "created_at",
      "updated_at",
      "line_no",
      "sku_id",
      "product_code",
      "description",
      "barcode",
      "batch_id",
      "batch_code",
      "mfg_date",
      "expiry_date",
      "bin_id",
      "bin_code",
      "po_line_id",
      "qty_cases",
      "qty_units",
      "shortage_units",
      "damage_units",
      "purchase_price_pack",
      "purchase_price_ctn",
      "line_amount",
      "line_finance_status",
    ],
    rows,
  );
}

// ─── Picklists (line detail) ─────────────────────────────────────────────────

export async function exportPicklists(admin: Admin, from: string | null, to: string | null) {
  return exportSales(admin, from, to, {
    pickedOnly: false,
    filename: "picklists-report-detail.csv",
  });
}

// ─── Gate passes (line detail) ───────────────────────────────────────────────

export async function exportGatePasses(admin: Admin, from: string | null, to: string | null) {
  let headerQuery = admin
    .from("gate_passes")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  const fromTs = karachiFrom(from);
  const toTs = karachiTo(to);
  if (fromTs) headerQuery = headerQuery.gte("created_at", fromTs);
  if (toTs) headerQuery = headerQuery.lte("created_at", toTs);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const gpIds = (headersData ?? []).map((h) => h.id as string);
  if (!gpIds.length) {
    return csvResponse("gate-passes-report-detail.csv", ["note"], [
      { note: "No gate passes in range" },
    ]);
  }

  const { data, error } = await admin
    .from("gate_pass_lines")
    .select(
      "id,qty_units,is_override,override_approved_by,sku_id,batch_id,picklist_line_id,sku:skus(product_code,description,barcode),batch:batches(batch_code,expiry_date),gate_pass:gate_passes!inner(id,gate_pass_no,status,issued_at,issued_by,manager_approved_at,manager_approved_by,security_out_at,security_out_by_name,notes,created_at,warehouse:warehouses(code,name),picklist:picklists(picklist_no,delivery_date))",
    )
    .in("gate_pass_id", gpIds)
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).flatMap((l) => {
      const gp = asObj<{
        issued_by?: string | null;
        manager_approved_by?: string | null;
      }>(l.gate_pass);
      return [gp?.issued_by, gp?.manager_approved_by, l.override_approved_by as string | null];
    }),
  );

  const rows = (data ?? []).map((l) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(l.sku);
    const batch = asObj<{ batch_code?: string; expiry_date?: string | null }>(l.batch);
    const gp = asObj<{
      id?: string;
      gate_pass_no?: string;
      status?: string;
      issued_at?: string | null;
      issued_by?: string | null;
      manager_approved_at?: string | null;
      manager_approved_by?: string | null;
      security_out_at?: string | null;
      security_out_by_name?: string | null;
      notes?: string | null;
      created_at?: string;
      warehouse?: { code?: string; name?: string } | null;
      picklist?: { picklist_no?: string; delivery_date?: string } | null;
    }>(l.gate_pass);
    return {
      gate_pass_line_id: l.id,
      gate_pass_id: gp?.id ?? "",
      gate_pass_no: gp?.gate_pass_no ?? "",
      status: gp?.status ?? "",
      picklist_no: gp?.picklist?.picklist_no ?? "",
      delivery_date: gp?.picklist?.delivery_date ?? "",
      warehouse_code: gp?.warehouse?.code ?? "",
      warehouse_name: gp?.warehouse?.name ?? "",
      issued_at: gp?.issued_at ?? "",
      ...actorCols("issued_by", gp?.issued_by, profiles),
      manager_approved_at: gp?.manager_approved_at ?? "",
      ...actorCols("manager_approved_by", gp?.manager_approved_by, profiles),
      security_out_at: gp?.security_out_at ?? "",
      security_out_by_name: gp?.security_out_by_name ?? "",
      notes: gp?.notes ?? "",
      created_at: gp?.created_at ?? "",
      picklist_line_id: l.picklist_line_id ?? "",
      sku_id: l.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      batch_id: l.batch_id,
      batch_code: batch?.batch_code ?? "",
      expiry_date: batch?.expiry_date ?? "",
      qty_units: l.qty_units,
      is_override: l.is_override ?? "",
      ...actorCols("override_approved_by", l.override_approved_by as string | null, profiles),
    };
  });

  return csvResponse(
    "gate-passes-report-detail.csv",
    [
      "gate_pass_line_id",
      "gate_pass_id",
      "gate_pass_no",
      "status",
      "picklist_no",
      "delivery_date",
      "warehouse_code",
      "warehouse_name",
      "issued_at",
      "issued_by_user_id",
      "issued_by_user_name",
      "issued_by_user_email",
      "manager_approved_at",
      "manager_approved_by_user_id",
      "manager_approved_by_user_name",
      "manager_approved_by_user_email",
      "security_out_at",
      "security_out_by_name",
      "notes",
      "created_at",
      "picklist_line_id",
      "sku_id",
      "product_code",
      "description",
      "barcode",
      "batch_id",
      "batch_code",
      "expiry_date",
      "qty_units",
      "is_override",
      "override_approved_by_user_id",
      "override_approved_by_user_name",
      "override_approved_by_user_email",
    ],
    rows,
  );
}

// ─── Returns ─────────────────────────────────────────────────────────────────

export async function exportReturns(admin: Admin, from: string | null, to: string | null) {
  let headerQuery = admin
    .from("return_receipts")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  const fromTs = karachiFrom(from);
  const toTs = karachiTo(to);
  if (fromTs) headerQuery = headerQuery.gte("created_at", fromTs);
  if (toTs) headerQuery = headerQuery.lte("created_at", toTs);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const ids = (headersData ?? []).map((h) => h.id as string);
  if (!ids.length) {
    return csvResponse("returns-report-detail.csv", ["note"], [{ note: "No returns in range" }]);
  }

  const { data, error } = await admin
    .from("return_lines")
    .select(
      "id,condition,qty_units,is_unknown_batch,sku_id,batch_id,sku:skus(product_code,description,barcode),batch:batches(batch_code,expiry_date),return:return_receipts!inner(id,return_no,invoice_no,status,requires_unknown_batch_approval,unknown_batch_approved_by,posted_at,posted_by,created_by,created_at,customer:customers(code,name,phone),warehouse:warehouses(code,name),reason:reason_codes(code,label),picklist:picklists(picklist_no))",
    )
    .in("return_id", ids)
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).flatMap((l) => {
      const r = asObj<{
        created_by?: string | null;
        posted_by?: string | null;
        unknown_batch_approved_by?: string | null;
      }>(l.return);
      return [r?.created_by, r?.posted_by, r?.unknown_batch_approved_by];
    }),
  );

  const rows = (data ?? []).map((l) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(l.sku);
    const batch = asObj<{ batch_code?: string; expiry_date?: string | null }>(l.batch);
    const r = asObj<{
      id?: string;
      return_no?: string;
      invoice_no?: string | null;
      status?: string;
      requires_unknown_batch_approval?: boolean;
      unknown_batch_approved_by?: string | null;
      posted_at?: string | null;
      posted_by?: string | null;
      created_by?: string | null;
      created_at?: string;
      customer?: { code?: string; name?: string; phone?: string | null } | null;
      warehouse?: { code?: string; name?: string } | null;
      reason?: { code?: string; label?: string } | null;
      picklist?: { picklist_no?: string } | null;
    }>(l.return);
    return {
      return_line_id: l.id,
      return_id: r?.id ?? "",
      return_no: r?.return_no ?? "",
      status: r?.status ?? "",
      invoice_no: r?.invoice_no ?? "",
      picklist_no: r?.picklist?.picklist_no ?? "",
      customer_code: r?.customer?.code ?? "",
      customer_name: r?.customer?.name ?? "",
      customer_phone: r?.customer?.phone ?? "",
      warehouse_code: r?.warehouse?.code ?? "",
      warehouse_name: r?.warehouse?.name ?? "",
      reason_code: r?.reason?.code ?? "",
      reason_label: r?.reason?.label ?? "",
      requires_unknown_batch_approval: r?.requires_unknown_batch_approval ?? "",
      ...actorCols("unknown_batch_approved_by", r?.unknown_batch_approved_by, profiles),
      posted_at: r?.posted_at ?? "",
      ...actorCols("posted_by", r?.posted_by, profiles),
      ...actorCols("created_by", r?.created_by, profiles),
      created_at: r?.created_at ?? "",
      sku_id: l.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      batch_id: l.batch_id ?? "",
      batch_code: batch?.batch_code ?? "",
      expiry_date: batch?.expiry_date ?? "",
      is_unknown_batch: l.is_unknown_batch ?? "",
      condition: l.condition,
      qty_units: l.qty_units,
    };
  });

  return csvResponse(
    "returns-report-detail.csv",
    [
      "return_line_id",
      "return_id",
      "return_no",
      "status",
      "invoice_no",
      "picklist_no",
      "customer_code",
      "customer_name",
      "customer_phone",
      "warehouse_code",
      "warehouse_name",
      "reason_code",
      "reason_label",
      "requires_unknown_batch_approval",
      "unknown_batch_approved_by_user_id",
      "unknown_batch_approved_by_user_name",
      "unknown_batch_approved_by_user_email",
      "posted_at",
      "posted_by_user_id",
      "posted_by_user_name",
      "posted_by_user_email",
      "created_by_user_id",
      "created_by_user_name",
      "created_by_user_email",
      "created_at",
      "sku_id",
      "product_code",
      "description",
      "barcode",
      "batch_id",
      "batch_code",
      "expiry_date",
      "is_unknown_batch",
      "condition",
      "qty_units",
    ],
    rows,
  );
}

// ─── Write-offs ──────────────────────────────────────────────────────────────

export async function exportWriteOffs(admin: Admin, from: string | null, to: string | null) {
  let headerQuery = admin
    .from("write_offs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  const fromTs = karachiFrom(from);
  const toTs = karachiTo(to);
  if (fromTs) headerQuery = headerQuery.gte("created_at", fromTs);
  if (toTs) headerQuery = headerQuery.lte("created_at", toTs);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const ids = (headersData ?? []).map((h) => h.id as string);
  if (!ids.length) {
    return csvResponse("write-offs-report-detail.csv", ["note"], [
      { note: "No write-offs in range" },
    ]);
  }

  const { data, error } = await admin
    .from("write_off_lines")
    .select(
      "id,condition,qty_units,sku_id,batch_id,sku:skus(product_code,description,barcode),batch:batches(batch_code,expiry_date),write_off:write_offs!inner(id,write_off_no,status,posted_at,posted_by,created_by,created_at,warehouse:warehouses(code,name),reason:reason_codes(code,label))",
    )
    .in("write_off_id", ids)
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).flatMap((l) => {
      const w = asObj<{ created_by?: string | null; posted_by?: string | null }>(l.write_off);
      return [w?.created_by, w?.posted_by];
    }),
  );

  const rows = (data ?? []).map((l) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(l.sku);
    const batch = asObj<{ batch_code?: string; expiry_date?: string | null }>(l.batch);
    const w = asObj<{
      id?: string;
      write_off_no?: string;
      status?: string;
      posted_at?: string | null;
      posted_by?: string | null;
      created_by?: string | null;
      created_at?: string;
      warehouse?: { code?: string; name?: string } | null;
      reason?: { code?: string; label?: string } | null;
    }>(l.write_off);
    return {
      write_off_line_id: l.id,
      write_off_id: w?.id ?? "",
      write_off_no: w?.write_off_no ?? "",
      status: w?.status ?? "",
      warehouse_code: w?.warehouse?.code ?? "",
      warehouse_name: w?.warehouse?.name ?? "",
      reason_code: w?.reason?.code ?? "",
      reason_label: w?.reason?.label ?? "",
      posted_at: w?.posted_at ?? "",
      ...actorCols("posted_by", w?.posted_by, profiles),
      ...actorCols("created_by", w?.created_by, profiles),
      created_at: w?.created_at ?? "",
      sku_id: l.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      batch_id: l.batch_id,
      batch_code: batch?.batch_code ?? "",
      expiry_date: batch?.expiry_date ?? "",
      condition: l.condition,
      qty_units: l.qty_units,
    };
  });

  return csvResponse(
    "write-offs-report-detail.csv",
    [
      "write_off_line_id",
      "write_off_id",
      "write_off_no",
      "status",
      "warehouse_code",
      "warehouse_name",
      "reason_code",
      "reason_label",
      "posted_at",
      "posted_by_user_id",
      "posted_by_user_name",
      "posted_by_user_email",
      "created_by_user_id",
      "created_by_user_name",
      "created_by_user_email",
      "created_at",
      "sku_id",
      "product_code",
      "description",
      "barcode",
      "batch_id",
      "batch_code",
      "expiry_date",
      "condition",
      "qty_units",
    ],
    rows,
  );
}

// ─── Exchanges ───────────────────────────────────────────────────────────────

export async function exportExchanges(admin: Admin, from: string | null, to: string | null) {
  let headerQuery = admin
    .from("exchange_notes")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  const fromTs = karachiFrom(from);
  const toTs = karachiTo(to);
  if (fromTs) headerQuery = headerQuery.gte("created_at", fromTs);
  if (toTs) headerQuery = headerQuery.lte("created_at", toTs);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const ids = (headersData ?? []).map((h) => h.id as string);
  if (!ids.length) {
    return csvResponse("exchanges-report-detail.csv", ["note"], [
      { note: "No exchanges in range" },
    ]);
  }

  const { data, error } = await admin
    .from("exchange_lines")
    .select(
      "id,direction,condition,qty_units,sku_id,batch_id,sku:skus(product_code,description,barcode),batch:batches(batch_code,expiry_date),exchange:exchange_notes!inner(id,exchange_no,status,posted_at,posted_by,created_by,created_at,customer:customers(code,name,phone),warehouse:warehouses(code,name),reason:reason_codes(code,label))",
    )
    .in("exchange_id", ids)
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).flatMap((l) => {
      const e = asObj<{ created_by?: string | null; posted_by?: string | null }>(l.exchange);
      return [e?.created_by, e?.posted_by];
    }),
  );

  const rows = (data ?? []).map((l) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(l.sku);
    const batch = asObj<{ batch_code?: string; expiry_date?: string | null }>(l.batch);
    const e = asObj<{
      id?: string;
      exchange_no?: string;
      status?: string;
      posted_at?: string | null;
      posted_by?: string | null;
      created_by?: string | null;
      created_at?: string;
      customer?: { code?: string; name?: string; phone?: string | null } | null;
      warehouse?: { code?: string; name?: string } | null;
      reason?: { code?: string; label?: string } | null;
    }>(l.exchange);
    return {
      exchange_line_id: l.id,
      exchange_id: e?.id ?? "",
      exchange_no: e?.exchange_no ?? "",
      status: e?.status ?? "",
      customer_code: e?.customer?.code ?? "",
      customer_name: e?.customer?.name ?? "",
      customer_phone: e?.customer?.phone ?? "",
      warehouse_code: e?.warehouse?.code ?? "",
      warehouse_name: e?.warehouse?.name ?? "",
      reason_code: e?.reason?.code ?? "",
      reason_label: e?.reason?.label ?? "",
      posted_at: e?.posted_at ?? "",
      ...actorCols("posted_by", e?.posted_by, profiles),
      ...actorCols("created_by", e?.created_by, profiles),
      created_at: e?.created_at ?? "",
      direction: l.direction,
      sku_id: l.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      batch_id: l.batch_id ?? "",
      batch_code: batch?.batch_code ?? "",
      expiry_date: batch?.expiry_date ?? "",
      condition: l.condition,
      qty_units: l.qty_units,
    };
  });

  return csvResponse(
    "exchanges-report-detail.csv",
    [
      "exchange_line_id",
      "exchange_id",
      "exchange_no",
      "status",
      "customer_code",
      "customer_name",
      "customer_phone",
      "warehouse_code",
      "warehouse_name",
      "reason_code",
      "reason_label",
      "posted_at",
      "posted_by_user_id",
      "posted_by_user_name",
      "posted_by_user_email",
      "created_by_user_id",
      "created_by_user_name",
      "created_by_user_email",
      "created_at",
      "direction",
      "sku_id",
      "product_code",
      "description",
      "barcode",
      "batch_id",
      "batch_code",
      "expiry_date",
      "condition",
      "qty_units",
    ],
    rows,
  );
}

// ─── FOC ─────────────────────────────────────────────────────────────────────

export async function exportFoc(admin: Admin, from: string | null, to: string | null) {
  let headerQuery = admin
    .from("foc_issues")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  const fromTs = karachiFrom(from);
  const toTs = karachiTo(to);
  if (fromTs) headerQuery = headerQuery.gte("created_at", fromTs);
  if (toTs) headerQuery = headerQuery.lte("created_at", toTs);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const ids = (headersData ?? []).map((h) => h.id as string);
  if (!ids.length) {
    return csvResponse("foc-report-detail.csv", ["note"], [{ note: "No FOC issues in range" }]);
  }

  const { data, error } = await admin
    .from("foc_lines")
    .select(
      "id,qty_units,sku_id,batch_id,sku:skus(product_code,description,barcode),batch:batches(batch_code,expiry_date),foc:foc_issues!inner(id,foc_no,status,posted_at,posted_by,created_by,created_at,customer:customers(code,name,phone),warehouse:warehouses(code,name),reason:reason_codes(code,label),picklist:picklists(picklist_no))",
    )
    .in("foc_id", ids)
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).flatMap((l) => {
      const f = asObj<{ created_by?: string | null; posted_by?: string | null }>(l.foc);
      return [f?.created_by, f?.posted_by];
    }),
  );

  const rows = (data ?? []).map((l) => {
    const sku = asObj<{ product_code?: string; description?: string; barcode?: string | null }>(l.sku);
    const batch = asObj<{ batch_code?: string; expiry_date?: string | null }>(l.batch);
    const f = asObj<{
      id?: string;
      foc_no?: string;
      status?: string;
      posted_at?: string | null;
      posted_by?: string | null;
      created_by?: string | null;
      created_at?: string;
      customer?: { code?: string; name?: string; phone?: string | null } | null;
      warehouse?: { code?: string; name?: string } | null;
      reason?: { code?: string; label?: string } | null;
      picklist?: { picklist_no?: string } | null;
    }>(l.foc);
    return {
      foc_line_id: l.id,
      foc_id: f?.id ?? "",
      foc_no: f?.foc_no ?? "",
      status: f?.status ?? "",
      customer_code: f?.customer?.code ?? "",
      customer_name: f?.customer?.name ?? "",
      customer_phone: f?.customer?.phone ?? "",
      warehouse_code: f?.warehouse?.code ?? "",
      warehouse_name: f?.warehouse?.name ?? "",
      reason_code: f?.reason?.code ?? "",
      reason_label: f?.reason?.label ?? "",
      picklist_no: f?.picklist?.picklist_no ?? "",
      posted_at: f?.posted_at ?? "",
      ...actorCols("posted_by", f?.posted_by, profiles),
      ...actorCols("created_by", f?.created_by, profiles),
      created_at: f?.created_at ?? "",
      sku_id: l.sku_id,
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      barcode: sku?.barcode ?? "",
      batch_id: l.batch_id,
      batch_code: batch?.batch_code ?? "",
      expiry_date: batch?.expiry_date ?? "",
      qty_units: l.qty_units,
    };
  });

  return csvResponse(
    "foc-report-detail.csv",
    [
      "foc_line_id",
      "foc_id",
      "foc_no",
      "status",
      "customer_code",
      "customer_name",
      "customer_phone",
      "warehouse_code",
      "warehouse_name",
      "reason_code",
      "reason_label",
      "picklist_no",
      "posted_at",
      "posted_by_user_id",
      "posted_by_user_name",
      "posted_by_user_email",
      "created_by_user_id",
      "created_by_user_name",
      "created_by_user_email",
      "created_at",
      "sku_id",
      "product_code",
      "description",
      "barcode",
      "batch_id",
      "batch_code",
      "expiry_date",
      "qty_units",
    ],
    rows,
  );
}

// ─── Cash collections ────────────────────────────────────────────────────────

export async function exportCashCollections(admin: Admin, from: string | null, to: string | null) {
  let headerQuery = admin
    .from("cash_collections")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  const fromTs = karachiFrom(from);
  const toTs = karachiTo(to);
  if (fromTs) headerQuery = headerQuery.gte("created_at", fromTs);
  if (toTs) headerQuery = headerQuery.lte("created_at", toTs);
  const { data: headersData, error: headerError } = await headerQuery;
  if (headerError) throw new Error(headerError.message);
  const ids = (headersData ?? []).map((h) => h.id as string);
  if (!ids.length) {
    return csvResponse("cash-collections-report-detail.csv", ["note"], [
      { note: "No cash collections in range" },
    ]);
  }

  const { data, error } = await admin
    .from("cash_collection_payments")
    .select(
      "id,method,amount,cheque_no,bank_name,online_ref,proof_path,notes,created_at,cash_collection:cash_collections!inner(id,collection_no,invoice_no,outstanding_balance,collected_by,collected_at,remarks,created_at,customer:customers(code,name,phone),picklist:picklists(picklist_no,delivery_date),gate_pass:gate_passes(gate_pass_no))",
    )
    .in("cash_collection_id", ids)
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).map(
      (p) => asObj<{ collected_by?: string | null }>(p.cash_collection)?.collected_by,
    ),
  );

  const rows = (data ?? []).map((p) => {
    const cc = asObj<{
      id?: string;
      collection_no?: string;
      invoice_no?: string | null;
      outstanding_balance?: number | null;
      collected_by?: string | null;
      collected_at?: string | null;
      remarks?: string | null;
      created_at?: string;
      customer?: { code?: string; name?: string; phone?: string | null } | null;
      picklist?: { picklist_no?: string; delivery_date?: string } | null;
      gate_pass?: { gate_pass_no?: string } | null;
    }>(p.cash_collection);
    return {
      payment_id: p.id,
      collection_id: cc?.id ?? "",
      collection_no: cc?.collection_no ?? "",
      invoice_no: cc?.invoice_no ?? "",
      customer_code: cc?.customer?.code ?? "",
      customer_name: cc?.customer?.name ?? "",
      customer_phone: cc?.customer?.phone ?? "",
      picklist_no: cc?.picklist?.picklist_no ?? "",
      delivery_date: cc?.picklist?.delivery_date ?? "",
      gate_pass_no: cc?.gate_pass?.gate_pass_no ?? "",
      outstanding_balance: cc?.outstanding_balance ?? "",
      collected_at: cc?.collected_at ?? "",
      ...actorCols("collected_by", cc?.collected_by, profiles),
      collection_remarks: cc?.remarks ?? "",
      collection_created_at: cc?.created_at ?? "",
      payment_method: p.method,
      payment_amount: p.amount,
      cheque_no: p.cheque_no ?? "",
      bank_name: p.bank_name ?? "",
      online_ref: p.online_ref ?? "",
      proof_path: p.proof_path ?? "",
      payment_notes: p.notes ?? "",
      payment_created_at: p.created_at,
    };
  });

  return csvResponse(
    "cash-collections-report-detail.csv",
    [
      "payment_id",
      "collection_id",
      "collection_no",
      "invoice_no",
      "customer_code",
      "customer_name",
      "customer_phone",
      "picklist_no",
      "delivery_date",
      "gate_pass_no",
      "outstanding_balance",
      "collected_at",
      "collected_by_user_id",
      "collected_by_user_name",
      "collected_by_user_email",
      "collection_remarks",
      "collection_created_at",
      "payment_method",
      "payment_amount",
      "cheque_no",
      "bank_name",
      "online_ref",
      "proof_path",
      "payment_notes",
      "payment_created_at",
    ],
    rows,
  );
}

// ─── Sale ledger ─────────────────────────────────────────────────────────────

export async function exportSaleLedger(admin: Admin, from: string | null, to: string | null) {
  let query = admin
    .from("customer_ledger_entries")
    .select(
      "id,entry_type,amount,signed_amount,affects_balance,payment_method,invoice_no,notes,created_by,created_at,picklist_id,gate_pass_id,picklist_customer_id,cash_collection_id,cash_collection_payment_id,return_receipt_id,customer:customers(code,name,phone),picklist:picklists(picklist_no,delivery_date),gate_pass:gate_passes(gate_pass_no),return_receipt:return_receipts(return_no),cash_collection:cash_collections(collection_no)",
    )
    .order("created_at", { ascending: false })
    .limit(CSV_LIMIT);
  const fromTs = karachiFrom(from);
  const toTs = karachiTo(to);
  if (fromTs) query = query.gte("created_at", fromTs);
  if (toTs) query = query.lte("created_at", toTs);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const profiles = await fetchProfiles(
    admin,
    (data ?? []).map((e) => e.created_by as string | null),
  );

  const rows = (data ?? []).map((e) => {
    const customer = asObj<{ code?: string; name?: string; phone?: string | null }>(e.customer);
    const pl = asObj<{ picklist_no?: string; delivery_date?: string }>(e.picklist);
    const gp = asObj<{ gate_pass_no?: string }>(e.gate_pass);
    const ret = asObj<{ return_no?: string }>(e.return_receipt);
    const cc = asObj<{ collection_no?: string }>(e.cash_collection);
    return {
      ledger_entry_id: e.id,
      created_at: e.created_at,
      ...actorCols("created_by", e.created_by as string | null, profiles),
      entry_type: e.entry_type,
      amount: e.amount,
      signed_amount: e.signed_amount,
      affects_balance: e.affects_balance,
      payment_method: e.payment_method ?? "",
      customer_code: customer?.code ?? "",
      customer_name: customer?.name ?? "",
      customer_phone: customer?.phone ?? "",
      invoice_no: e.invoice_no ?? "",
      picklist_id: e.picklist_id ?? "",
      picklist_no: pl?.picklist_no ?? "",
      delivery_date: pl?.delivery_date ?? "",
      gate_pass_id: e.gate_pass_id ?? "",
      gate_pass_no: gp?.gate_pass_no ?? "",
      picklist_customer_id: e.picklist_customer_id ?? "",
      cash_collection_id: e.cash_collection_id ?? "",
      collection_no: cc?.collection_no ?? "",
      cash_collection_payment_id: e.cash_collection_payment_id ?? "",
      return_receipt_id: e.return_receipt_id ?? "",
      return_no: ret?.return_no ?? "",
      notes: e.notes ?? "",
    };
  });

  return csvResponse(
    "sale-ledger-report-detail.csv",
    [
      "ledger_entry_id",
      "created_at",
      "created_by_user_id",
      "created_by_user_name",
      "created_by_user_email",
      "entry_type",
      "amount",
      "signed_amount",
      "affects_balance",
      "payment_method",
      "customer_code",
      "customer_name",
      "customer_phone",
      "invoice_no",
      "picklist_id",
      "picklist_no",
      "delivery_date",
      "gate_pass_id",
      "gate_pass_no",
      "picklist_customer_id",
      "cash_collection_id",
      "collection_no",
      "cash_collection_payment_id",
      "return_receipt_id",
      "return_no",
      "notes",
    ],
    rows,
  );
}

// ─── Masters ─────────────────────────────────────────────────────────────────

export async function exportSkus(admin: Admin) {
  const { data, error } = await admin
    .from("skus")
    .select(
      "id,product_code,description,barcode,price_point,gm_per_pack,packs_per_carton,kg_per_case,purchase_price_pack,sale_price_pack,purchase_price_ctn,sale_price_ctn,default_shelf_life_days,is_active,created_at,updated_at,brand:brands(name),category:categories(name)",
    )
    .order("product_code")
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((s) => {
    const brand = asObj<{ name?: string }>(s.brand);
    const category = asObj<{ name?: string }>(s.category);
    return {
      sku_id: s.id,
      product_code: s.product_code,
      description: s.description,
      barcode: s.barcode ?? "",
      brand: brand?.name ?? "",
      category: category?.name ?? "",
      price_point: s.price_point ?? "",
      gm_per_pack: s.gm_per_pack ?? "",
      packs_per_carton: s.packs_per_carton,
      kg_per_case: s.kg_per_case ?? "",
      purchase_price_pack: s.purchase_price_pack ?? "",
      sale_price_pack: s.sale_price_pack ?? "",
      purchase_price_ctn: s.purchase_price_ctn ?? "",
      sale_price_ctn: s.sale_price_ctn ?? "",
      default_shelf_life_days: s.default_shelf_life_days ?? "",
      is_active: s.is_active,
      created_at: s.created_at,
      updated_at: s.updated_at,
    };
  });

  return csvResponse(
    "skus-master-detail.csv",
    [
      "sku_id",
      "product_code",
      "description",
      "barcode",
      "brand",
      "category",
      "price_point",
      "gm_per_pack",
      "packs_per_carton",
      "kg_per_case",
      "purchase_price_pack",
      "sale_price_pack",
      "purchase_price_ctn",
      "sale_price_ctn",
      "default_shelf_life_days",
      "is_active",
      "created_at",
      "updated_at",
    ],
    rows,
  );
}

export async function exportCustomers(admin: Admin) {
  const { data, error } = await admin
    .from("customers")
    .select(
      "id,code,name,address,phone,opening_balance,is_active,created_at,route:routes(code,name,route_type)",
    )
    .order("code")
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((c) => {
    const route = asObj<{ code?: string; name?: string; route_type?: string | null }>(c.route);
    return {
      customer_id: c.id,
      code: c.code,
      name: c.name,
      address: c.address ?? "",
      phone: c.phone ?? "",
      route_code: route?.code ?? "",
      route_name: route?.name ?? "",
      route_type: route?.route_type ?? "",
      opening_balance: c.opening_balance,
      is_active: c.is_active,
      created_at: c.created_at,
    };
  });

  return csvResponse(
    "customers-master-detail.csv",
    [
      "customer_id",
      "code",
      "name",
      "address",
      "phone",
      "route_code",
      "route_name",
      "route_type",
      "opening_balance",
      "is_active",
      "created_at",
    ],
    rows,
  );
}

export async function exportSuppliers(admin: Admin) {
  const { data, error } = await admin
    .from("suppliers")
    .select("id,code,name,phone,address,is_active,created_at")
    .order("name")
    .limit(CSV_LIMIT);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((s) => ({
    supplier_id: s.id,
    code: s.code ?? "",
    name: s.name,
    phone: s.phone ?? "",
    address: s.address ?? "",
    is_active: s.is_active,
    created_at: s.created_at,
  }));

  return csvResponse(
    "suppliers-master-detail.csv",
    ["supplier_id", "code", "name", "phone", "address", "is_active", "created_at"],
    rows,
  );
}
