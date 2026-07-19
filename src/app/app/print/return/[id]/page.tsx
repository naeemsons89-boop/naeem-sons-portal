import { redirect } from "next/navigation";

import { PrintChrome } from "@/components/print-chrome";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PrintReturnPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "exportPdfCsv")) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: receipt } = await admin
    .from("return_receipts")
    .select(
      "*, customer:customers(code,name), warehouse:warehouses(code,name), reason:reason_codes(code,label)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!receipt) redirect("/app/returns");

  const { data: lines } = await admin
    .from("return_lines")
    .select("*, sku:skus(product_code,description), batch:batches(batch_code,expiry_date)")
    .eq("return_id", id);

  const customer = receipt.customer as { code?: string; name?: string } | null;
  const warehouse = receipt.warehouse as { code?: string; name?: string } | null;
  const reason = receipt.reason as { code?: string; label?: string } | null;

  return (
    <PrintChrome title={`Return ${receipt.return_no}`} backHref={`/app/returns/${id}`}>
      <div className="meta">
        <div>
          <strong>Customer:</strong> {customer?.code} — {customer?.name}
        </div>
        <div>
          <strong>Warehouse:</strong> {warehouse?.code} — {warehouse?.name}
        </div>
        <div>
          <strong>Invoice:</strong> {(receipt.invoice_no as string) || "—"}
        </div>
        <div>
          <strong>Reason:</strong> {reason?.label || reason?.code || "—"}
        </div>
        <div>
          <strong>Status:</strong> {receipt.status}
        </div>
        <div>
          <strong>Posted:</strong>{" "}
          {receipt.posted_at
            ? new Date(receipt.posted_at as string).toLocaleString("en-PK")
            : "—"}
        </div>
      </div>

      <h2>Return lines</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Batch</th>
            <th>Expiry</th>
            <th>Condition</th>
            <th>Qty</th>
            <th>Unknown batch</th>
          </tr>
        </thead>
        <tbody>
          {(lines ?? []).map((line) => {
            const sku = line.sku as { product_code?: string; description?: string } | null;
            const batch = line.batch as { batch_code?: string; expiry_date?: string } | null;
            return (
              <tr key={line.id as string}>
                <td>
                  {sku?.product_code}
                  <div className="muted">{sku?.description}</div>
                </td>
                <td>{batch?.batch_code || "—"}</td>
                <td>{batch?.expiry_date || "—"}</td>
                <td>{String(line.condition)}</td>
                <td>{String(line.qty_units)}</td>
                <td>{line.is_unknown_batch ? "YES" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintChrome>
  );
}
