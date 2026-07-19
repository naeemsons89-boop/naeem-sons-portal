import { redirect } from "next/navigation";

import { PrintChrome } from "@/components/print-chrome";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PrintGrnPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "exportPdfCsv")) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: grn } = await admin
    .from("grns")
    .select("*, supplier:suppliers(code,name), warehouse:warehouses(code,name)")
    .eq("id", id)
    .maybeSingle();
  if (!grn) redirect("/app/grn");

  const { data: lines } = await admin
    .from("grn_lines")
    .select("*, sku:skus(product_code,description), batch:batches(batch_code)")
    .eq("grn_id", id)
    .order("line_no");

  const supplier = grn.supplier as { code?: string; name?: string } | null;
  const warehouse = grn.warehouse as { code?: string; name?: string } | null;

  return (
    <PrintChrome title={`GRN ${grn.grn_no}`} backHref={`/app/grn/${id}`}>
      <div className="meta">
        <div>
          <strong>Supplier DN:</strong> {grn.supplier_delivery_no || "—"}
        </div>
        <div>
          <strong>Delivery date:</strong> {grn.delivery_date}
        </div>
        <div>
          <strong>Supplier:</strong> {supplier?.code} — {supplier?.name}
        </div>
        <div>
          <strong>Warehouse:</strong> {warehouse?.code} — {warehouse?.name}
        </div>
        <div>
          <strong>Truck:</strong> {grn.truck_no || "—"}
        </div>
        <div>
          <strong>Status:</strong> {grn.status} · Finance {grn.finance_status}
        </div>
        <div>
          <strong>Invoice:</strong> {grn.supplier_invoice_no || "—"}
        </div>
        <div>
          <strong>Invoice total:</strong> {grn.invoice_total_amount ?? "—"}
        </div>
      </div>

      <h2>Lines</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>SKU</th>
            <th>Batch</th>
            <th>MFG</th>
            <th>Expiry</th>
            <th>Qty</th>
            <th>Short</th>
            <th>Damage</th>
            <th>Price/pack</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(lines ?? []).map((line) => {
            const sku = line.sku as { product_code?: string; description?: string } | null;
            const batch = line.batch as { batch_code?: string } | null;
            return (
              <tr key={line.id as string}>
                <td>{line.line_no as number}</td>
                <td>
                  {sku?.product_code}
                  <div className="muted">{sku?.description}</div>
                </td>
                <td>{batch?.batch_code || (line.batch_code as string) || "—"}</td>
                <td>{(line.mfg_date as string) || "—"}</td>
                <td>{(line.expiry_date as string) || "—"}</td>
                <td>{String(line.qty_units)}</td>
                <td>{String(line.shortage_units)}</td>
                <td>{String(line.damage_units)}</td>
                <td>{line.purchase_price_pack != null ? String(line.purchase_price_pack) : "—"}</td>
                <td>{line.line_amount != null ? String(line.line_amount) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {grn.remarks ? (
        <p style={{ marginTop: 12 }}>
          <strong>Remarks:</strong> {grn.remarks as string}
        </p>
      ) : null}
    </PrintChrome>
  );
}
