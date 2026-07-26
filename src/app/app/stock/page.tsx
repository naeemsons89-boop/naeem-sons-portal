import { createClient } from "@/lib/supabase/server";
import { DownloadReportBar } from "@/components/download-report-bar";
import {
  StockClient,
  type StockBalanceRow,
  type StockFilterOption,
} from "@/components/stock-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

export default async function StockPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  const showFinance = can(role, "viewFinancialStock");

  const supabase = await createClient();

  const [
    { data: rowsRaw },
    { data: categoriesRaw },
    { data: suppliersRaw },
    { data: warehousesRaw },
    { data: supplierSkusRaw },
  ] = await Promise.all([
    supabase
      .from("stock_balances")
      .select(
        "id,sku_id,warehouse_id,qty_units,condition,finance_status,sku:skus(id,product_code,description,packs_per_carton,purchase_price_pack,category_id,category:categories(id,name)),batch:batches(batch_code,expiry_date),warehouse:warehouses(id,code,name)",
      )
      .gt("qty_units", 0)
      .order("updated_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("suppliers")
      .select("id,code,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("warehouses")
      .select("id,code,name")
      .eq("is_active", true)
      .order("code"),
    supabase.from("supplier_skus").select("supplier_id,sku_id").eq("is_active", true),
  ]);

  const rows = (rowsRaw ?? []) as StockBalanceRow[];

  const categories: StockFilterOption[] = (categoriesRaw ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  const suppliers: StockFilterOption[] = (suppliersRaw ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    code: (s.code as string | null) ?? null,
  }));

  const warehouses: StockFilterOption[] = (warehousesRaw ?? []).map((w) => ({
    id: w.id as string,
    name: (w.name as string) || (w.code as string) || "Warehouse",
    code: (w.code as string | null) ?? null,
  }));

  const supplierSkuMap: Record<string, string[]> = {};
  for (const link of supplierSkusRaw ?? []) {
    const supplierId = link.supplier_id as string;
    const skuId = link.sku_id as string;
    if (!supplierSkuMap[supplierId]) supplierSkuMap[supplierId] = [];
    supplierSkuMap[supplierId].push(skuId);
  }

  return (
    <div>
      <PageHeader
        title="Stock"
        download={
          <DownloadReportBar
            reportType="stock"
            canExport={can(role, "exportPdfCsv")}
            hideDates
            title="Download report"
          />
        }
      />
      <StockClient
        rows={rows}
        categories={categories}
        suppliers={suppliers}
        warehouses={warehouses}
        supplierSkuMap={supplierSkuMap}
        showFinance={showFinance}
      />
    </div>
  );
}
