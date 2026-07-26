import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "cashCollection")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customer_id");
  const picklistCustomerId = searchParams.get("picklist_customer_id");

  if (picklistCustomerId) {
    const { data: sale } = await supabase
      .from("customer_ledger_entries")
      .select("amount")
      .eq("entry_type", "sale")
      .eq("picklist_customer_id", picklistCustomerId)
      .maybeSingle();
    return NextResponse.json({
      picklist_amount: Number(sale?.amount ?? 0),
    });
  }

  if (customerId) {
    const [{ data: balance }, { data: entries, error }] = await Promise.all([
      supabase
        .from("v_customer_balances")
        .select("customer_id,code,name,outstanding")
        .eq("customer_id", customerId)
        .maybeSingle(),
      supabase
        .from("customer_ledger_entries")
        .select(
          "id,entry_type,amount,signed_amount,affects_balance,payment_method,invoice_no,notes,created_at,picklist:picklists(picklist_no),gate_pass:gate_passes(gate_pass_no),cash_collection:cash_collections(collection_no),return_receipt:return_receipts(return_no)",
        )
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true })
        .limit(500),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    let running = 0;
    const withRunning = ((entries ?? []) as Array<Record<string, unknown>>).map((e) => {
      if (e.affects_balance) running += Number(e.signed_amount);
      return { ...e, running_balance: Math.round(running * 100) / 100 };
    });

    return NextResponse.json({
      balance: balance ?? { customer_id: customerId, outstanding: running },
      entries: withRunning,
    });
  }

  const q = (searchParams.get("q") ?? "").trim();
  let query = supabase
    .from("v_customer_balances")
    .select("customer_id,code,name,outstanding")
    .order("name")
    .limit(200);

  if (q) {
    query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ customers: data ?? [] });
}
