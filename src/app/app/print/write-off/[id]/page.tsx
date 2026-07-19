import { redirect } from "next/navigation";

import { PrintChrome } from "@/components/print-chrome";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PrintWriteOffPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "exportPdfCsv")) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: doc } = await admin
    .from("write_offs")
    .select(
      "*, warehouse:warehouses(code,name), reason:reason_codes(code,label)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!doc) redirect("/app/write-offs");

  const { data: lines } = await admin
    .from("write_off_lines")
    .select("*, sku:skus(product_code,description), batch:batches(batch_code,expiry_date)")
    .eq("write_off_id", id);

  const warehouse = doc.warehouse as { code?: string; name?: string } | null;
  const reason = doc.reason as { code?: string; label?: string } | null;

  return (
    <PrintChrome title={`Write-off ${doc.write_off_no}`} backHref="/app/write-offs">
      <div className="meta">
        <div>
          <strong>Warehouse:</strong> {warehouse?.code} — {warehouse?.name}
        </div>
        <div>
          <strong>Reason:</strong> {reason?.label || reason?.code || "—"}
        </div>
        <div>
          <strong>Status:</strong> {doc.status}
        </div>
        <div>
          <strong>Posted:</strong>{" "}
          {doc.posted_at
            ? new Date(doc.posted_at as string).toLocaleString("en-PK")
            : "—"}
        </div>
      </div>

      <h2>Destroyed / written-off stock</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Batch</th>
            <th>Expiry</th>
            <th>Condition</th>
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
                <td>{String(line.condition)}</td>
                <td>{String(line.qty_units)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 12 }}>
        This document authorizes destruction / write-off of the listed stock from warehouse.
      </p>
    </PrintChrome>
  );
}
