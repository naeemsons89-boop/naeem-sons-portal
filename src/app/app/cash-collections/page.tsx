import { redirect } from "next/navigation";

import { CashCollectionClient } from "@/components/cash-collection-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

type PicklistRow = {
  id: string;
  picklist_no: string;
  delivery_date: string;
  gate_pass:
    | { id: string; gate_pass_no: string }
    | { id: string; gate_pass_no: string }[]
    | null;
  customers:
    | Array<{
        id: string;
        invoice_no: string | null;
        sequence_no: number;
        customer: { id: string; code: string; name: string } | null;
      }>
    | null;
};

export default async function CashCollectionsPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "cashCollection")) redirect("/app");

  const supabase = await createClient();
  const [{ data: picklists }, { data: collections }, { data: balances }] =
    await Promise.all([
      supabase
        .from("picklists")
        .select(
          "id,picklist_no,delivery_date,gate_pass:gate_passes(id,gate_pass_no),customers:picklist_customers(id,invoice_no,sequence_no,customer:customers(id,code,name))",
        )
        .not("load_out_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("cash_collections")
        .select(
          "id,collection_no,customer:customers(code,name),gate_pass:gate_passes(gate_pass_no)",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("v_customer_balances").select("customer_id,outstanding"),
    ]);

  const balanceMap = new Map(
    (balances ?? []).map((b) => [b.customer_id as string, Number(b.outstanding ?? 0)]),
  );

  const pcIds = ((picklists ?? []) as PicklistRow[]).flatMap((p) =>
    (p.customers ?? []).map((c) => c.id),
  );

  const saleAmountByPc = new Map<string, number>();
  if (pcIds.length) {
    const { data: sales } = await supabase
      .from("customer_ledger_entries")
      .select("picklist_customer_id,amount")
      .eq("entry_type", "sale")
      .in("picklist_customer_id", pcIds);
    for (const s of sales ?? []) {
      if (s.picklist_customer_id) {
        saleAmountByPc.set(s.picklist_customer_id as string, Number(s.amount ?? 0));
      }
    }
  }

  const normalized = ((picklists ?? []) as PicklistRow[])
    .map((p) => {
      const gp = Array.isArray(p.gate_pass) ? p.gate_pass[0] : p.gate_pass;
      if (!gp) return null;
      const customers = (p.customers ?? [])
        .filter((c) => c.customer)
        .sort((a, b) => a.sequence_no - b.sequence_no)
        .map((c) => ({
          picklist_customer_id: c.id,
          id: c.customer!.id,
          code: c.customer!.code,
          name: c.customer!.name,
          invoice_no: c.invoice_no,
          sale_amount: saleAmountByPc.get(c.id) ?? 0,
          outstanding: balanceMap.get(c.customer!.id) ?? 0,
        }));
      return {
        id: p.id,
        picklist_no: p.picklist_no,
        delivery_date: p.delivery_date,
        gate_pass: { id: gp.id, gate_pass_no: gp.gate_pass_no },
        customers,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div>
      <PageHeader title="Collections" />
      <CashCollectionClient
        picklists={normalized}
        initial={(collections ?? []) as Record<string, unknown>[]}
      />
    </div>
  );
}
