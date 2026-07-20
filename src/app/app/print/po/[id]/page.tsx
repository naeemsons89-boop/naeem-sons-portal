import { redirect } from "next/navigation";

import { PrintChrome } from "@/components/print-chrome";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PrintPoPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "exportPdfCsv")) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: po } = await admin
    .from("purchase_orders")
    .select("*, supplier:suppliers(code,name,phone,address), warehouse:warehouses(code,name)")
    .eq("id", id)
    .maybeSingle();
  if (!po) redirect("/app/po");

  const { data: lines } = await admin
    .from("purchase_order_lines")
    .select("*, sku:skus(product_code,description)")
    .eq("po_id", id)
    .order("line_no");

  const supplier = po.supplier as {
    code?: string;
    name?: string;
    phone?: string;
    address?: string;
  } | null;
  const warehouse = po.warehouse as { code?: string; name?: string } | null;
  const total = (lines ?? []).reduce((s, l) => s + Number(l.line_amount ?? 0), 0);

  return (
    <PrintChrome title={`Purchase Order ${po.po_no}`} backHref="/app/po">
      <div className="meta">
        <div>
          <strong>PO No:</strong> {po.po_no as string}
        </div>
        <div>
          <strong>Order date:</strong> {po.order_date as string}
        </div>
        <div>
          <strong>Expected:</strong> {(po.expected_date as string) || "—"}
        </div>
        <div>
          <strong>Status:</strong> {po.status as string}
        </div>
        <div>
          <strong>Supplier:</strong> {supplier?.code} — {supplier?.name}
        </div>
        <div>
          <strong>Warehouse:</strong> {warehouse?.code} — {warehouse?.name}
        </div>
        <div>
          <strong>Phone:</strong> {supplier?.phone || "—"}
        </div>
        <div>
          <strong>Address:</strong> {supplier?.address || "—"}
        </div>
      </div>

      <h2>Lines</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>SKU</th>
            <th>Qty</th>
            <th>UOM</th>
            <th>Unit price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(lines ?? []).map((line) => {
            const sku = line.sku as { product_code?: string; description?: string } | null;
            return (
              <tr key={line.id as string}>
                <td>{line.line_no as number}</td>
                <td>
                  {sku?.product_code}
                  <div className="muted">{sku?.description}</div>
                </td>
                <td>{String(line.qty_ordered)}</td>
                <td>{String(line.uom).toUpperCase()}</td>
                <td>{Number(line.unit_price).toFixed(2)}</td>
                <td>{Number(line.line_amount).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ marginTop: 12, textAlign: "right" }}>
        <strong>Total: {total.toFixed(2)}</strong>
      </p>

      {po.remarks ? (
        <p style={{ marginTop: 12 }}>
          <strong>Remarks:</strong> {po.remarks as string}
        </p>
      ) : null}
    </PrintChrome>
  );
}
