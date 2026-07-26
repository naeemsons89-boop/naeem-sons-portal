import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  exportCashCollections,
  exportCustomers,
  exportExchanges,
  exportFoc,
  exportGatePasses,
  exportGrn,
  exportMovements,
  exportPicklists,
  exportPo,
  exportRecall,
  exportReturns,
  exportSaleLedger,
  exportSales,
  exportSkus,
  exportStock,
  exportSuppliers,
  exportWriteOffs,
} from "@/lib/report-exports";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "viewReports")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "stock";
  const format = url.searchParams.get("format") ?? "csv";
  const q = (url.searchParams.get("q") ?? "").trim();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const showFinance = can(profile?.role as AppRole, "viewFinancialStock");
  const documentTypes = (url.searchParams.get("document_type") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (format !== "csv") {
    return NextResponse.json(
      { error: "Reports are download-only. Use format=csv." },
      { status: 400 },
    );
  }

  const admin = createServiceClient();

  try {
    switch (type) {
      case "stock":
        return await exportStock(admin, showFinance);
      case "movements":
        return await exportMovements(admin, {
          from,
          to,
          q,
          documentTypes,
          showFinance,
        });
      case "recall":
        return await exportRecall(admin, q);
      case "sales":
        return await exportSales(admin, from, to, {
          pickedOnly: true,
          filename: "sales-report-detail.csv",
        });
      case "po":
        return await exportPo(admin, from, to);
      case "grn":
        return await exportGrn(admin, from, to);
      case "picklists":
        return await exportPicklists(admin, from, to);
      case "gate_passes":
        return await exportGatePasses(admin, from, to);
      case "returns":
        return await exportReturns(admin, from, to);
      case "write_offs":
        return await exportWriteOffs(admin, from, to);
      case "exchanges":
        return await exportExchanges(admin, from, to);
      case "foc":
        return await exportFoc(admin, from, to);
      case "cash_collections":
        return await exportCashCollections(admin, from, to);
      case "sale_ledger":
        return await exportSaleLedger(admin, from, to);
      case "skus":
        return await exportSkus(admin);
      case "customers":
        return await exportCustomers(admin);
      case "suppliers":
        return await exportSuppliers(admin);
      default:
        return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
