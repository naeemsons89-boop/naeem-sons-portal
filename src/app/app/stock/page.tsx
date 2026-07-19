import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
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
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Batch</Th>
              <Th>Expiry</Th>
              <Th>Qty</Th>
              <Th>Condition</Th>
              <Th>Finance</Th>
              {showFinance ? <Th>Value</Th> : null}
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
                <tr key={row.id}>
                  <Td>
                    <div className="font-medium">{sku?.product_code}</div>
                    <div className="text-xs text-[var(--ink-muted)]">
                      {sku?.description}
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">{batch?.batch_code}</Td>
                  <Td className="text-xs">{batch?.expiry_date || "—"}</Td>
                  <Td>{qty}</Td>
                  <Td className="capitalize">{row.condition}</Td>
                  <Td>
                    <Badge tone={row.finance_status === "posted" ? "success" : "warning"}>
                      {row.finance_status}
                    </Badge>
                  </Td>
                  {showFinance ? <Td>{value != null ? value.toFixed(2) : "—"}</Td> : null}
                </tr>
              );
            })}
          </tbody>
        </Table>
        {rows.length === 0 ? (
          <EmptyState>No stock yet. Create and post a GRN.</EmptyState>
        ) : null}
      </Card>
    </div>
  );
}
