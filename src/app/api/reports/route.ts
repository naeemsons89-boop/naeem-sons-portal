import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

export async function GET(request: Request) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "viewReports")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "stock";
  const format = url.searchParams.get("format");
  const q = (url.searchParams.get("q") ?? "").trim();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const showFinance = can(profile?.role as AppRole, "viewFinancialStock");

  const admin = createServiceClient();

  if (type === "stock") {
    const { data, error } = await admin
      .from("stock_balances")
      .select(
        "qty_units,condition,finance_status,sku:skus(product_code,description,barcode,category_id,purchase_price_pack,sale_price_pack,category:categories(name)),batch:batches(batch_code,mfg_date,expiry_date),warehouse:warehouses(code,name)",
      )
      .gt("qty_units", 0)
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((r) => {
      const sku = r.sku as unknown as {
        product_code?: string;
        description?: string;
        barcode?: string | null;
        purchase_price_pack?: number | null;
        sale_price_pack?: number | null;
        category?: { name?: string } | null;
      } | null;
      const batch = r.batch as unknown as {
        batch_code?: string;
        expiry_date?: string | null;
        mfg_date?: string | null;
      } | null;
      const wh = r.warehouse as unknown as { code?: string; name?: string } | null;
      const qty = Number(r.qty_units);
      const purchase = Number(sku?.purchase_price_pack ?? 0);
      const sale = Number(sku?.sale_price_pack ?? 0);
      return {
        warehouse: wh?.code ?? "",
        category: sku?.category?.name ?? "",
        product_code: sku?.product_code ?? "",
        description: sku?.description ?? "",
        barcode: sku?.barcode ?? "",
        batch_code: batch?.batch_code ?? "",
        mfg_date: batch?.mfg_date ?? "",
        expiry_date: batch?.expiry_date ?? "",
        condition: r.condition,
        finance_status: r.finance_status,
        qty_units: qty,
        inventory_value: showFinance ? qty * purchase : null,
        sale_value: showFinance ? qty * sale : null,
      };
    });

    if (format === "csv") {
      const headers = [
        "warehouse",
        "category",
        "product_code",
        "description",
        "barcode",
        "batch_code",
        "mfg_date",
        "expiry_date",
        "condition",
        "finance_status",
        "qty_units",
        ...(showFinance ? ["inventory_value", "sale_value"] : []),
      ];
      const body = toCsv(
        headers,
        rows.map((r) =>
          headers.map((h) => (r as Record<string, unknown>)[h]),
        ),
      );
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="stock-report.csv"',
        },
      });
    }

    const totals = {
      qty_units: rows.reduce((s, r) => s + r.qty_units, 0),
      inventory_value: showFinance
        ? rows.reduce((s, r) => s + Number(r.inventory_value ?? 0), 0)
        : null,
      sale_value: showFinance
        ? rows.reduce((s, r) => s + Number(r.sale_value ?? 0), 0)
        : null,
    };
    return NextResponse.json({ rows, totals, showFinance });
  }

  if (type === "movements") {
    let query = admin
      .from("stock_movements")
      .select(
        "id,movement_type,qty_units,condition,finance_status,document_type,document_no,notes,created_at,sku:skus(product_code,description),batch:batches(batch_code,expiry_date),warehouse:warehouses(code)",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (from) query = query.gte("created_at", `${from}T00:00:00+05:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59+05:00`);
    const documentTypeParam = (url.searchParams.get("document_type") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (documentTypeParam.length === 1) {
      query = query.eq("document_type", documentTypeParam[0]);
    } else if (documentTypeParam.length > 1) {
      query = query.in("document_type", documentTypeParam);
    }
    if (q) {
      // filter after fetch for simplicity on batch/sku text
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    let rows = (data ?? []).map((m) => {
      const sku = m.sku as unknown as { product_code?: string; description?: string } | null;
      const batch = m.batch as unknown as { batch_code?: string; expiry_date?: string | null } | null;
      const wh = m.warehouse as unknown as { code?: string } | null;
      return {
        id: m.id,
        created_at: m.created_at,
        movement_type: m.movement_type,
        warehouse: wh?.code ?? "",
        product_code: sku?.product_code ?? "",
        description: sku?.description ?? "",
        batch_code: batch?.batch_code ?? "",
        expiry_date: batch?.expiry_date ?? "",
        condition: m.condition,
        finance_status: m.finance_status,
        qty_units: Number(m.qty_units),
        document_type: m.document_type,
        document_no: m.document_no,
        notes: m.notes,
      };
    });

    if (q) {
      const s = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.product_code.toLowerCase().includes(s) ||
          r.batch_code.toLowerCase().includes(s) ||
          String(r.document_no ?? "").toLowerCase().includes(s) ||
          String(r.movement_type).toLowerCase().includes(s),
      );
    }

    if (format === "csv") {
      const headers = [
        "created_at",
        "movement_type",
        "warehouse",
        "product_code",
        "description",
        "batch_code",
        "expiry_date",
        "condition",
        "finance_status",
        "qty_units",
        "document_type",
        "document_no",
        "notes",
      ];
      const body = toCsv(
        headers,
        rows.map((r) => headers.map((h) => (r as Record<string, unknown>)[h])),
      );
      const filename =
        documentTypeParam.length > 0
          ? `${documentTypeParam.join("-")}-movements.csv`
          : "movements-report.csv";
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ rows });
  }

  if (type === "recall") {
    if (!q) {
      return NextResponse.json({ error: "Enter batch code or barcode" }, { status: 400 });
    }

    // Find batches by code or SKU barcode
    const { data: byCode } = await admin
      .from("batches")
      .select("id,batch_code,mfg_date,expiry_date,sku_id,sku:skus(product_code,description,barcode)")
      .ilike("batch_code", `%${q}%`)
      .limit(50);

    const { data: skusByBarcode } = await admin
      .from("skus")
      .select("id")
      .or(`barcode.eq.${q},product_code.ilike.%${q}%`)
      .limit(20);
    const skuIds = (skusByBarcode ?? []).map((s) => s.id);
    let bySku: typeof byCode = [];
    if (skuIds.length) {
      const { data } = await admin
        .from("batches")
        .select("id,batch_code,mfg_date,expiry_date,sku_id,sku:skus(product_code,description,barcode)")
        .in("sku_id", skuIds)
        .limit(50);
      bySku = data ?? [];
    }

    const batchMap = new Map<string, (typeof byCode extends (infer T)[] | null ? T : never)>();
    for (const b of [...(byCode ?? []), ...bySku]) {
      batchMap.set(b.id as string, b);
    }
    const batches = [...batchMap.values()];
    const batchIds = batches.map((b) => b.id as string);

    if (!batchIds.length) {
      return NextResponse.json({ batches: [], balances: [], movements: [], customers: [] });
    }

    const [{ data: balances }, { data: movements }, { data: gpLines }] = await Promise.all([
      admin
        .from("stock_balances")
        .select(
          "qty_units,condition,finance_status,batch_id,sku:skus(product_code),batch:batches(batch_code),warehouse:warehouses(code)",
        )
        .in("batch_id", batchIds)
        .gt("qty_units", 0),
      admin
        .from("stock_movements")
        .select(
          "movement_type,qty_units,document_type,document_no,document_id,created_at,batch_id,sku:skus(product_code),batch:batches(batch_code)",
        )
        .in("batch_id", batchIds)
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("gate_pass_lines")
        .select(
          "qty_units,batch_id,gate_pass:gate_passes(gate_pass_no,picklist_id,picklist:picklists(picklist_no,picklist_customers(customer:customers(code,name))))",
        )
        .in("batch_id", batchIds)
        .limit(200),
    ]);

    const customers: Array<{
      batch_id: string;
      batch_code: string;
      gate_pass_no: string;
      picklist_no: string;
      customer_code: string;
      customer_name: string;
      qty_units: number;
    }> = [];

    for (const line of gpLines ?? []) {
      const gp = line.gate_pass as unknown as {
        gate_pass_no?: string;
        picklist?: {
          picklist_no?: string;
          picklist_customers?: Array<{
            customer?: { code?: string; name?: string } | null;
          }>;
        } | null;
      } | null;
      const batch = batches.find((b) => b.id === line.batch_id);
      const pcs = gp?.picklist?.picklist_customers ?? [];
      for (const pc of pcs) {
        customers.push({
          batch_id: line.batch_id as string,
          batch_code: (batch?.batch_code as string) ?? "",
          gate_pass_no: gp?.gate_pass_no ?? "",
          picklist_no: gp?.picklist?.picklist_no ?? "",
          customer_code: pc.customer?.code ?? "",
          customer_name: pc.customer?.name ?? "",
          qty_units: Number(line.qty_units),
        });
      }
      if (!pcs.length) {
        customers.push({
          batch_id: line.batch_id as string,
          batch_code: (batch?.batch_code as string) ?? "",
          gate_pass_no: gp?.gate_pass_no ?? "",
          picklist_no: gp?.picklist?.picklist_no ?? "",
          customer_code: "",
          customer_name: "(route / multi)",
          qty_units: Number(line.qty_units),
        });
      }
    }

    if (format === "csv") {
      const headers = [
        "batch_code",
        "gate_pass_no",
        "picklist_no",
        "customer_code",
        "customer_name",
        "qty_units",
      ];
      const body = toCsv(
        headers,
        customers.map((r) => headers.map((h) => (r as Record<string, unknown>)[h])),
      );
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="batch-recall.csv"',
        },
      });
    }

    return NextResponse.json({
      batches,
      balances: balances ?? [],
      movements: movements ?? [],
      customers,
    });
  }

  if (type === "sales") {
    let query = admin
      .from("picklist_lines")
      .select(
        "qty_picked_units,qty_delivered_units,sale_price_pack,line_sale_amount,sku:skus(product_code,description),picklist:picklists!inner(picklist_no,delivery_date,status,load_out_at)",
      )
      .gt("qty_picked_units", 0)
      .order("line_no")
      .limit(2000);
    // date filter via picklist delivery_date — fetch then filter if needed
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    let rows = (data ?? []).map((l) => {
      const sku = l.sku as unknown as { product_code?: string; description?: string } | null;
      const pl = l.picklist as unknown as {
        picklist_no?: string;
        delivery_date?: string;
        status?: string;
        load_out_at?: string | null;
      } | null;
      const qty = Number(l.qty_picked_units);
      const price = Number(l.sale_price_pack ?? 0);
      return {
        picklist_no: pl?.picklist_no ?? "",
        delivery_date: pl?.delivery_date ?? "",
        status: pl?.status ?? "",
        product_code: sku?.product_code ?? "",
        description: sku?.description ?? "",
        qty_picked: qty,
        sale_price_pack: price,
        sale_amount: Number(l.line_sale_amount ?? qty * price),
      };
    });

    if (from) rows = rows.filter((r) => r.delivery_date >= from);
    if (to) rows = rows.filter((r) => r.delivery_date <= to);

    if (format === "csv") {
      const headers = [
        "picklist_no",
        "delivery_date",
        "status",
        "product_code",
        "description",
        "qty_picked",
        "sale_price_pack",
        "sale_amount",
      ];
      const body = toCsv(
        headers,
        rows.map((r) => headers.map((h) => (r as Record<string, unknown>)[h])),
      );
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="sales-report.csv"',
        },
      });
    }

    const totals = {
      qty_picked: rows.reduce((s, r) => s + r.qty_picked, 0),
      sale_amount: rows.reduce((s, r) => s + r.sale_amount, 0),
    };
    return NextResponse.json({ rows, totals, showFinance });
  }

  // ─── Document register CSVs (per-menu downloads) ─────────────────────────

  function csvResponse(filename: string, headers: string[], rows: Array<Record<string, unknown>>) {
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

  if (type === "po") {
    let query = admin
      .from("purchase_orders")
      .select(
        "po_no,order_date,expected_date,status,remarks,created_at,supplier:suppliers(code,name),warehouse:warehouses(code),lines:purchase_order_lines(line_amount,qty_ordered,uom)",
      )
      .order("order_date", { ascending: false })
      .limit(2000);
    if (from) query = query.gte("order_date", from);
    if (to) query = query.lte("order_date", to);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((po) => {
      const supplier = po.supplier as { code?: string; name?: string } | null;
      const wh = po.warehouse as { code?: string } | null;
      const lines = (po.lines as { line_amount?: number; qty_ordered?: number; uom?: string }[]) ?? [];
      const total = lines.reduce((s, l) => s + Number(l.line_amount ?? 0), 0);
      const qty = lines.reduce((s, l) => s + Number(l.qty_ordered ?? 0), 0);
      return {
        po_no: po.po_no,
        order_date: po.order_date,
        expected_date: po.expected_date ?? "",
        status: po.status,
        supplier_code: supplier?.code ?? "",
        supplier_name: supplier?.name ?? "",
        warehouse: wh?.code ?? "",
        line_count: lines.length,
        qty_ordered: qty,
        total_amount: total,
        remarks: po.remarks ?? "",
        created_at: po.created_at,
      };
    });

    if (format === "csv") {
      return csvResponse(
        "po-report.csv",
        [
          "po_no",
          "order_date",
          "expected_date",
          "status",
          "supplier_code",
          "supplier_name",
          "warehouse",
          "line_count",
          "qty_ordered",
          "total_amount",
          "remarks",
          "created_at",
        ],
        rows,
      );
    }
    return NextResponse.json({ rows });
  }

  if (type === "grn") {
    let query = admin
      .from("grns")
      .select(
        "grn_no,supplier_delivery_no,delivery_date,status,finance_status,physical_posted_at,truck_no,transporter_name,invoice_total_amount,created_at,supplier:suppliers(code,name),po:purchase_orders(po_no),warehouse:warehouses(code)",
      )
      .order("delivery_date", { ascending: false })
      .limit(2000);
    if (from) query = query.gte("delivery_date", from);
    if (to) query = query.lte("delivery_date", to);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((g) => {
      const supplier = g.supplier as { code?: string; name?: string } | null;
      const po = g.po as { po_no?: string } | null;
      const wh = g.warehouse as { code?: string } | null;
      return {
        grn_no: g.grn_no,
        po_no: po?.po_no ?? "",
        delivery_date: g.delivery_date,
        supplier_dn: g.supplier_delivery_no ?? "",
        status: g.status,
        finance_status: g.finance_status,
        physical_posted: g.physical_posted_at ? "yes" : "no",
        supplier_code: supplier?.code ?? "",
        supplier_name: supplier?.name ?? "",
        warehouse: wh?.code ?? "",
        truck_no: g.truck_no ?? "",
        transporter: g.transporter_name ?? "",
        invoice_total: g.invoice_total_amount ?? "",
        created_at: g.created_at,
      };
    });

    if (format === "csv") {
      return csvResponse(
        "grn-report.csv",
        [
          "grn_no",
          "po_no",
          "delivery_date",
          "supplier_dn",
          "status",
          "finance_status",
          "physical_posted",
          "supplier_code",
          "supplier_name",
          "warehouse",
          "truck_no",
          "transporter",
          "invoice_total",
          "created_at",
        ],
        rows,
      );
    }
    return NextResponse.json({ rows });
  }

  if (type === "picklists") {
    let query = admin
      .from("picklists")
      .select(
        "picklist_no,delivery_date,status,load_out_at,load_in_at,created_at,warehouse:warehouses(code)",
      )
      .order("delivery_date", { ascending: false })
      .limit(2000);
    if (from) query = query.gte("delivery_date", from);
    if (to) query = query.lte("delivery_date", to);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((p) => {
      const wh = p.warehouse as { code?: string } | null;
      return {
        picklist_no: p.picklist_no,
        delivery_date: p.delivery_date,
        status: p.status,
        warehouse: wh?.code ?? "",
        load_out_at: p.load_out_at ?? "",
        load_in_at: p.load_in_at ?? "",
        created_at: p.created_at,
      };
    });

    if (format === "csv") {
      return csvResponse(
        "picklists-report.csv",
        [
          "picklist_no",
          "delivery_date",
          "status",
          "warehouse",
          "load_out_at",
          "load_in_at",
          "created_at",
        ],
        rows,
      );
    }
    return NextResponse.json({ rows });
  }

  if (type === "gate_passes") {
    let query = admin
      .from("gate_passes")
      .select(
        "gate_pass_no,status,issued_at,security_out_at,security_out_by_name,created_at,warehouse:warehouses(code),picklist:picklists(picklist_no,delivery_date)",
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (from) query = query.gte("created_at", `${from}T00:00:00+05:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59+05:00`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((g) => {
      const wh = g.warehouse as { code?: string } | null;
      const pl = g.picklist as { picklist_no?: string; delivery_date?: string } | null;
      return {
        gate_pass_no: g.gate_pass_no,
        status: g.status,
        picklist_no: pl?.picklist_no ?? "",
        delivery_date: pl?.delivery_date ?? "",
        warehouse: wh?.code ?? "",
        issued_at: g.issued_at ?? "",
        security_out_at: g.security_out_at ?? "",
        security_out_by: g.security_out_by_name ?? "",
        created_at: g.created_at,
      };
    });

    if (format === "csv") {
      return csvResponse(
        "gate-passes-report.csv",
        [
          "gate_pass_no",
          "status",
          "picklist_no",
          "delivery_date",
          "warehouse",
          "issued_at",
          "security_out_at",
          "security_out_by",
          "created_at",
        ],
        rows,
      );
    }
    return NextResponse.json({ rows });
  }

  if (type === "returns") {
    let query = admin
      .from("return_receipts")
      .select(
        "return_no,invoice_no,status,posted_at,created_at,customer:customers(code,name),warehouse:warehouses(code)",
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (from) query = query.gte("created_at", `${from}T00:00:00+05:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59+05:00`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((r) => {
      const customer = r.customer as { code?: string; name?: string } | null;
      const wh = r.warehouse as { code?: string } | null;
      return {
        return_no: r.return_no,
        status: r.status,
        invoice_no: r.invoice_no ?? "",
        customer_code: customer?.code ?? "",
        customer_name: customer?.name ?? "",
        warehouse: wh?.code ?? "",
        posted_at: r.posted_at ?? "",
        created_at: r.created_at,
      };
    });

    if (format === "csv") {
      return csvResponse(
        "returns-report.csv",
        [
          "return_no",
          "status",
          "invoice_no",
          "customer_code",
          "customer_name",
          "warehouse",
          "posted_at",
          "created_at",
        ],
        rows,
      );
    }
    return NextResponse.json({ rows });
  }

  if (type === "write_offs") {
    let query = admin
      .from("write_offs")
      .select(
        "write_off_no,status,posted_at,created_at,warehouse:warehouses(code),reason:reason_codes(code,label)",
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (from) query = query.gte("created_at", `${from}T00:00:00+05:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59+05:00`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((w) => {
      const wh = w.warehouse as { code?: string } | null;
      const reason = w.reason as { code?: string; label?: string } | null;
      return {
        write_off_no: w.write_off_no,
        status: w.status,
        warehouse: wh?.code ?? "",
        reason_code: reason?.code ?? "",
        reason_label: reason?.label ?? "",
        posted_at: w.posted_at ?? "",
        created_at: w.created_at,
      };
    });

    if (format === "csv") {
      return csvResponse(
        "write-offs-report.csv",
        [
          "write_off_no",
          "status",
          "warehouse",
          "reason_code",
          "reason_label",
          "posted_at",
          "created_at",
        ],
        rows,
      );
    }
    return NextResponse.json({ rows });
  }

  if (type === "exchanges") {
    let query = admin
      .from("exchange_notes")
      .select(
        "exchange_no,status,posted_at,created_at,customer:customers(code,name),warehouse:warehouses(code)",
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (from) query = query.gte("created_at", `${from}T00:00:00+05:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59+05:00`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((e) => {
      const customer = e.customer as { code?: string; name?: string } | null;
      const wh = e.warehouse as { code?: string } | null;
      return {
        exchange_no: e.exchange_no,
        status: e.status,
        customer_code: customer?.code ?? "",
        customer_name: customer?.name ?? "",
        warehouse: wh?.code ?? "",
        posted_at: e.posted_at ?? "",
        created_at: e.created_at,
      };
    });

    if (format === "csv") {
      return csvResponse(
        "exchanges-report.csv",
        [
          "exchange_no",
          "status",
          "customer_code",
          "customer_name",
          "warehouse",
          "posted_at",
          "created_at",
        ],
        rows,
      );
    }
    return NextResponse.json({ rows });
  }

  if (type === "foc") {
    let query = admin
      .from("foc_issues")
      .select(
        "foc_no,status,posted_at,created_at,customer:customers(code,name),warehouse:warehouses(code),picklist:picklists(picklist_no)",
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (from) query = query.gte("created_at", `${from}T00:00:00+05:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59+05:00`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((f) => {
      const customer = f.customer as { code?: string; name?: string } | null;
      const wh = f.warehouse as { code?: string } | null;
      const pl = f.picklist as { picklist_no?: string } | null;
      return {
        foc_no: f.foc_no,
        status: f.status,
        customer_code: customer?.code ?? "",
        customer_name: customer?.name ?? "",
        warehouse: wh?.code ?? "",
        picklist_no: pl?.picklist_no ?? "",
        posted_at: f.posted_at ?? "",
        created_at: f.created_at,
      };
    });

    if (format === "csv") {
      return csvResponse(
        "foc-report.csv",
        [
          "foc_no",
          "status",
          "customer_code",
          "customer_name",
          "warehouse",
          "picklist_no",
          "posted_at",
          "created_at",
        ],
        rows,
      );
    }
    return NextResponse.json({ rows });
  }

  return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
}
