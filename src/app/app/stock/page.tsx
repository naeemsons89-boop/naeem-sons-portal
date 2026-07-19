import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

export default async function StockPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  const showFinance = can(role, "viewFinancialStock");

  const supabase = await createClient();
  const { data: rowsRaw } = await supabase
    .from("stock_balances")
    .select(
      "id,qty_units,condition,finance_status,sku:skus(product_code,description,packs_per_carton,purchase_price_pack,sale_price_pack),batch:batches(batch_code,mfg_date,expiry_date),warehouse:warehouses(code)",
    )
    .gt("qty_units", 0)
    .order("updated_at", { ascending: false })
    .limit(200);

  const rows = (rowsRaw ?? []) as Array<{
    id: string;
    qty_units: number;
    condition: string;
    finance_status: string;
    sku: {
      product_code?: string;
      description?: string;
      purchase_price_pack?: number;
    } | null;
    batch: { batch_code?: string; expiry_date?: string } | null;
  }>;

  return (
    <div>
      <PageHeader
        title="Stock"
        description="On-hand by SKU / batch / condition. Only finance=posted + good is pickable."
      />
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-[var(--ink-muted)]">
            <tr>
              <th className="py-2 pr-3">SKU</th>
              <th className="py-2 pr-3">Batch</th>
              <th className="py-2 pr-3">Expiry</th>
              <th className="py-2 pr-3">Qty</th>
              <th className="py-2 pr-3">Condition</th>
              <th className="py-2 pr-3">Finance</th>
              {showFinance ? <th className="py-2">Value</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const sku = row.sku;
              const batch = row.batch;
              const qty = Number(row.qty_units);
              const value =
                showFinance && sku?.purchase_price_pack != null
                  ? qty * Number(sku.purchase_price_pack)
                  : null;
              return (
                <tr key={row.id} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{sku?.product_code}</div>
                    <div className="text-xs text-[var(--ink-muted)]">
                      {sku?.description}
                    </div>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {batch?.batch_code}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {batch?.expiry_date || "—"}
                  </td>
                  <td className="py-2 pr-3">{qty}</td>
                  <td className="py-2 pr-3">{row.condition}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        row.finance_status === "posted"
                          ? "text-[var(--brand)]"
                          : "text-amber-700"
                      }
                    >
                      {row.finance_status}
                    </span>
                  </td>
                  {showFinance ? (
                    <td className="py-2">
                      {value != null ? value.toFixed(2) : "—"}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-[var(--ink-muted)]">
            No stock yet. Create and post a GRN.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
