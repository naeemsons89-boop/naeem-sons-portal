import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import type { DocScope, SearchHit } from "@/lib/doc-search";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function normalize(q: string) {
  return q.trim();
}

export async function GET(request: Request) {
  const { profile } = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = normalize(url.searchParams.get("q") ?? "");
  const scope = (url.searchParams.get("scope") ?? "all") as DocScope;

  if (q.length < 1) {
    return NextResponse.json({ results: [] as SearchHit[], scope });
  }

  const supabase = await createClient();
  const results: SearchHit[] = [];
  // Escape commas/% for PostgREST .or() filters
  const safe = q.replace(/[%_,]/g, " ").trim();
  if (!safe) return NextResponse.json({ results: [], scope });
  const like = `%${safe}%`;

  async function searchOne(s: DocScope) {
    if (s === "po" || s === "all") {
      const { data: byNo } = await supabase
        .from("purchase_orders")
        .select("id,po_no,order_date,status,supplier:suppliers(code,name)")
        .ilike("po_no", like)
        .order("created_at", { ascending: false })
        .limit(8);

      const { data: matchedSuppliers } = await supabase
        .from("suppliers")
        .select("id")
        .or(`code.ilike.${like},name.ilike.${like}`)
        .limit(20);
      const supplierIds = (matchedSuppliers ?? []).map((row) => row.id as string);

      let bySupplier: typeof byNo = [];
      if (supplierIds.length) {
        const { data } = await supabase
          .from("purchase_orders")
          .select("id,po_no,order_date,status,supplier:suppliers(code,name)")
          .in("supplier_id", supplierIds)
          .order("created_at", { ascending: false })
          .limit(8);
        bySupplier = data ?? [];
      }

      const seen = new Set<string>();
      for (const row of [...(byNo ?? []), ...bySupplier]) {
        const id = row.id as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const supplier = row.supplier as { code?: string; name?: string } | null;
        results.push({
          type: "po",
          id,
          number: String(row.po_no),
          label: `PO · ${supplier?.name ?? "Supplier"} · ${row.order_date} · ${row.status}`,
          href: `/app/po?po_id=${id}`,
        });
      }
    }

    if (s === "grn" || s === "all") {
      const { data } = await supabase
        .from("grns")
        .select("id,grn_no,supplier_delivery_no,delivery_date")
        .or(`grn_no.ilike.${like},supplier_delivery_no.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const row of data ?? []) {
        results.push({
          type: "grn",
          id: row.id as string,
          number: String(row.grn_no),
          label: `GRN · DN ${row.supplier_delivery_no || "—"} · ${row.delivery_date}`,
          href: `/app/grn/${row.id}`,
        });
      }
    }

    if (s === "picklist" || s === "all") {
      const { data } = await supabase
        .from("picklists")
        .select("id,picklist_no,delivery_date,status")
        .ilike("picklist_no", like)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const row of data ?? []) {
        results.push({
          type: "picklist",
          id: row.id as string,
          number: String(row.picklist_no),
          label: `Picklist · ${row.delivery_date} · ${row.status}`,
          href: `/app/picklists/${row.id}`,
        });
      }
    }

    if (s === "gate_pass" || s === "all") {
      const { data } = await supabase
        .from("gate_passes")
        .select("id,gate_pass_no,status,picklist:picklists(id,picklist_no)")
        .ilike("gate_pass_no", like)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const pl = row.picklist as { id?: string; picklist_no?: string } | null;
        results.push({
          type: "gate_pass",
          id: row.id as string,
          number: String(row.gate_pass_no),
          label: `Gate pass · ${pl?.picklist_no ?? "—"} · ${row.status}`,
          href: pl?.id ? `/app/picklists/${pl.id}` : `/app/gate-passes`,
        });
      }
    }

    if (s === "return" || s === "all") {
      const { data } = await supabase
        .from("return_receipts")
        .select("id,return_no,status,customer:customers(code,name)")
        .ilike("return_no", like)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const c = row.customer as { code?: string; name?: string } | null;
        results.push({
          type: "return",
          id: row.id as string,
          number: String(row.return_no),
          label: `Return · ${c?.code ?? ""} ${c?.name ?? ""} · ${row.status}`,
          href: `/app/returns/${row.id}`,
        });
      }
    }

    if (s === "foc" || s === "all") {
      const { data } = await supabase
        .from("foc_issues")
        .select("id,foc_no,status")
        .ilike("foc_no", like)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const row of data ?? []) {
        results.push({
          type: "foc",
          id: row.id as string,
          number: String(row.foc_no),
          label: `FOC · ${row.status}`,
          href: `/app/print/foc/${row.id}`,
        });
      }
    }

    if (s === "exchange" || s === "all") {
      const { data } = await supabase
        .from("exchange_notes")
        .select("id,exchange_no,status")
        .ilike("exchange_no", like)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const row of data ?? []) {
        results.push({
          type: "exchange",
          id: row.id as string,
          number: String(row.exchange_no),
          label: `Exchange · ${row.status}`,
          href: `/app/exchanges`,
        });
      }
    }

    if (s === "write_off" || s === "all") {
      const { data } = await supabase
        .from("write_offs")
        .select("id,write_off_no,status")
        .ilike("write_off_no", like)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const row of data ?? []) {
        results.push({
          type: "write_off",
          id: row.id as string,
          number: String(row.write_off_no),
          label: `Write-off · ${row.status}`,
          href: `/app/print/write-off/${row.id}`,
        });
      }
    }

    if (s === "cash_collection" || s === "all") {
      const { data } = await supabase
        .from("cash_collections")
        .select("id,collection_no,customer:customers(code,name)")
        .ilike("collection_no", like)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const c = row.customer as { code?: string; name?: string } | null;
        results.push({
          type: "cash_collection",
          id: row.id as string,
          number: String(row.collection_no),
          label: `Collection · ${c?.code ?? ""} ${c?.name ?? ""}`,
          href: `/app/print/cash-collection/${row.id}`,
        });
      }
    }

    if (s === "customer" || s === "all") {
      const { data } = await supabase
        .from("customers")
        .select("id,code,name")
        .or(`code.ilike.${like},name.ilike.${like}`)
        .order("code")
        .limit(8);
      for (const row of data ?? []) {
        results.push({
          type: "customer",
          id: row.id as string,
          number: String(row.code),
          label: `Customer · ${row.name}`,
          href: `/app/masters?q=${encodeURIComponent(String(row.code))}`,
        });
      }
    }

    if (s === "sku" || s === "all") {
      const { data } = await supabase
        .from("skus")
        .select("id,product_code,description,barcode")
        .or(
          `product_code.ilike.${like},description.ilike.${like},barcode.ilike.${like}`,
        )
        .eq("is_active", true)
        .order("product_code")
        .limit(8);
      for (const row of data ?? []) {
        results.push({
          type: "sku",
          id: row.id as string,
          number: String(row.product_code),
          label: `SKU · ${row.description}`,
          href: `/app/stock?q=${encodeURIComponent(String(row.product_code))}`,
        });
      }
    }
  }

  if (scope === "all") {
    await searchOne("all");
  } else {
    await searchOne(scope);
  }

  // Prefer exact number match first
  const qUpper = q.toUpperCase();
  results.sort((a, b) => {
    const ae = a.number.toUpperCase() === qUpper ? 0 : 1;
    const be = b.number.toUpperCase() === qUpper ? 0 : 1;
    if (ae !== be) return ae - be;
    return a.number.localeCompare(b.number);
  });

  return NextResponse.json({
    results: results.slice(0, scope === "all" ? 20 : 12),
    scope,
  });
}
