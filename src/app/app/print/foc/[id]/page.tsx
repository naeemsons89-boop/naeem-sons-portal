import { redirect } from "next/navigation";

import { PrintChrome } from "@/components/print-chrome";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PrintFocPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "exportPdfCsv")) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: doc } = await admin
    .from("foc_issues")
    .select(
      "*, customer:customers(code,name), warehouse:warehouses(code,name), reason:reason_codes(code,label)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!doc) redirect("/app/foc");

  const { data: lines } = await admin
    .from("foc_lines")
    .select("*, sku:skus(product_code,description), batch:batches(batch_code,expiry_date)")
    .eq("foc_id", id);

  const customer = doc.customer as { code?: string; name?: string } | null;
  const warehouse = doc.warehouse as { code?: string; name?: string } | null;
  const reason = doc.reason as { code?: string; label?: string } | null;

  return (
    <PrintChrome title={`FOC ${doc.foc_no}`} backHref="/app/foc">
      <div className="meta">
        <div>
          <strong>Customer:</strong> {customer?.code || "—"} {customer?.name || ""}
        </div>
        <div>
          <strong>Warehouse:</strong> {warehouse?.code} — {warehouse?.name}
        </div>
        <div>
          <strong>Reason:</strong> {reason?.label || reason?.code || "—"}
        </div>
        <div>
          <strong>Status:</strong> {doc.status}
        </div>
      </div>
      <h2>FOC lines</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Batch</th>
            <th>Expiry</th>
            <th>Qty</th>
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
                <td>{String(line.qty_units)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintChrome>
  );
}
