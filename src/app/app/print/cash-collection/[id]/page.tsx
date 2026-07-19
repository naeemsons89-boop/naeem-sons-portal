import { redirect } from "next/navigation";

import { PrintChrome } from "@/components/print-chrome";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

export default async function PrintCashCollectionPage({ params }: Props) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "exportPdfCsv")) redirect("/app");

  const { id } = await params;
  const admin = createServiceClient();

  const { data: doc } = await admin
    .from("cash_collections")
    .select(
      "*, customer:customers(code,name), gate_pass:gate_passes(gate_pass_no), picklist:picklists(picklist_no,delivery_date)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!doc) redirect("/app/cash-collections");

  const { data: payments } = await admin
    .from("cash_collection_payments")
    .select("*")
    .eq("cash_collection_id", id);

  const customer = doc.customer as { code?: string; name?: string } | null;
  const gp = doc.gate_pass as { gate_pass_no?: string } | null;
  const pl = doc.picklist as { picklist_no?: string; delivery_date?: string } | null;
  const total = (payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <PrintChrome title={`Collection ${doc.collection_no}`} backHref="/app/cash-collections">
      <div className="meta">
        <div>
          <strong>Customer:</strong> {customer?.code} — {customer?.name}
        </div>
        <div>
          <strong>Invoice:</strong> {(doc.invoice_no as string) || "—"}
        </div>
        <div>
          <strong>Gate pass:</strong> {gp?.gate_pass_no || "—"}
        </div>
        <div>
          <strong>Picklist:</strong> {pl?.picklist_no || "—"} ({pl?.delivery_date || "—"})
        </div>
        <div>
          <strong>Outstanding:</strong> {String(doc.outstanding_balance ?? 0)}
        </div>
        <div>
          <strong>Collected:</strong> {total.toFixed(2)}
        </div>
      </div>
      {doc.remarks ? (
        <p>
          <strong>Remarks:</strong> {doc.remarks as string}
        </p>
      ) : null}
      <h2>Payments</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Amount</th>
            <th>Cheque / bank</th>
            <th>Online ref</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {(payments ?? []).map((p) => (
            <tr key={p.id as string}>
              <td>{String(p.method)}</td>
              <td>{String(p.amount)}</td>
              <td>
                {(p.cheque_no as string) || "—"}
                {p.bank_name ? ` / ${p.bank_name}` : ""}
              </td>
              <td>{(p.online_ref as string) || "—"}</td>
              <td>{(p.notes as string) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintChrome>
  );
}
