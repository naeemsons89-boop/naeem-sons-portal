import { redirect } from "next/navigation";

import { PrintChrome } from "@/components/print-chrome";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PrintGatePassPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "exportPdfCsv")) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: gp } = await admin
    .from("gate_passes")
    .select(
      "*, warehouse:warehouses(code,name), picklist:picklists(id,picklist_no,delivery_date)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!gp) redirect("/app/gate-passes");

  const { data: lines } = await admin
    .from("gate_pass_lines")
    .select("*, sku:skus(product_code,description), batch:batches(batch_code,expiry_date)")
    .eq("gate_pass_id", id);

  const warehouse = gp.warehouse as { code?: string; name?: string } | null;
  const picklist = gp.picklist as {
    id?: string;
    picklist_no?: string;
    delivery_date?: string;
  } | null;

  return (
    <PrintChrome
      title={`Gate Pass ${gp.gate_pass_no}`}
      backHref={picklist?.id ? `/app/picklists/${picklist.id}` : "/app/gate-passes"}
    >
      <div className="meta">
        <div>
          <strong>Picklist:</strong> {picklist?.picklist_no || "—"}
        </div>
        <div>
          <strong>Delivery date:</strong> {picklist?.delivery_date || "—"}
        </div>
        <div>
          <strong>Warehouse:</strong> {warehouse?.code} — {warehouse?.name}
        </div>
        <div>
          <strong>Status:</strong> {gp.status}
        </div>
        <div>
          <strong>Issued:</strong>{" "}
          {gp.issued_at ? new Date(gp.issued_at as string).toLocaleString("en-PK") : "—"}
        </div>
        <div>
          <strong>Security out:</strong> {(gp.security_out_by_name as string) || "—"}
        </div>
      </div>

      {gp.notes ? (
        <p>
          <strong>Notes:</strong> {gp.notes as string}
        </p>
      ) : null}

      <h2>Outward lines</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Batch</th>
            <th>Expiry</th>
            <th>Qty</th>
            <th>Override</th>
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
                <td>{line.is_override ? "YES" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintChrome>
  );
}
