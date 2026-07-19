import { redirect } from "next/navigation";

import { PrintChrome } from "@/components/print-chrome";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PrintPicklistPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "exportPdfCsv")) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: picklist } = await admin
    .from("picklists")
    .select("*, warehouse:warehouses(code,name)")
    .eq("id", id)
    .maybeSingle();
  if (!picklist) redirect("/app/picklists");

  let psrCode: string | null = null;
  let daCode: string | null = null;
  if (picklist.psr_route_id) {
    const { data } = await admin
      .from("routes")
      .select("code")
      .eq("id", picklist.psr_route_id)
      .maybeSingle();
    psrCode = data?.code ?? null;
  }
  if (picklist.da_route_id) {
    const { data } = await admin
      .from("routes")
      .select("code")
      .eq("id", picklist.da_route_id)
      .maybeSingle();
    daCode = data?.code ?? null;
  }

  const [{ data: customers }, { data: lines }] = await Promise.all([
    admin
      .from("picklist_customers")
      .select("*, customer:customers(code,name)")
      .eq("picklist_id", id)
      .order("sequence_no"),
    admin
      .from("picklist_lines")
      .select(
        "*, sku:skus(product_code,description), suggested_batch:batches!picklist_lines_suggested_batch_id_fkey(batch_code,expiry_date), scanned_batch:batches!picklist_lines_scanned_batch_id_fkey(batch_code), approved_batch:batches!picklist_lines_approved_batch_id_fkey(batch_code)",
      )
      .eq("picklist_id", id)
      .order("line_no"),
  ]);

  const warehouse = picklist.warehouse as { code?: string; name?: string } | null;

  return (
    <PrintChrome title={`Picklist ${picklist.picklist_no}`} backHref={`/app/picklists/${id}`}>
      <div className="meta">
        <div>
          <strong>Delivery date:</strong> {picklist.delivery_date}
        </div>
        <div>
          <strong>Status:</strong> {picklist.status}
        </div>
        <div>
          <strong>Warehouse:</strong> {warehouse?.code} — {warehouse?.name}
        </div>
        <div>
          <strong>Routes:</strong> PSR {psrCode || "—"} · DA {daCode || "—"}
        </div>
      </div>

      <h2>Customers</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Customer</th>
            <th>Invoice</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {(customers ?? []).map((c) => {
            const cust = c.customer as { code?: string; name?: string } | null;
            return (
              <tr key={c.id as string}>
                <td>{c.sequence_no as number}</td>
                <td>
                  {cust?.code} — {cust?.name}
                </td>
                <td>{(c.invoice_no as string) || "—"}</td>
                <td>{(c.notes as string) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Pick lines</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>SKU</th>
            <th>FEFO batch</th>
            <th>Picked batch</th>
            <th>Ordered</th>
            <th>FOC</th>
            <th>Exch</th>
            <th>Picked</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {(lines ?? []).map((line) => {
            const sku = line.sku as { product_code?: string; description?: string } | null;
            const suggested = line.suggested_batch as {
              batch_code?: string;
              expiry_date?: string;
            } | null;
            const scanned = line.scanned_batch as { batch_code?: string } | null;
            const approved = line.approved_batch as { batch_code?: string } | null;
            const pickedBatch =
              approved?.batch_code || scanned?.batch_code || suggested?.batch_code || "—";
            return (
              <tr key={line.id as string}>
                <td>{line.line_no as number}</td>
                <td>
                  {sku?.product_code}
                  <div className="muted">{sku?.description}</div>
                </td>
                <td>
                  {suggested?.batch_code || "—"}
                  {suggested?.expiry_date ? (
                    <div className="muted">exp {suggested.expiry_date}</div>
                  ) : null}
                </td>
                <td>
                  {pickedBatch}
                  {line.batch_override_pending ? (
                    <div className="muted">override pending</div>
                  ) : null}
                </td>
                <td>{String(line.qty_ordered_units)}</td>
                <td>{String(line.qty_foc_units)}</td>
                <td>{String(line.qty_exchange_units)}</td>
                <td>{String(line.qty_picked_units)}</td>
                <td>{line.sale_price_pack != null ? String(line.sale_price_pack) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintChrome>
  );
}
