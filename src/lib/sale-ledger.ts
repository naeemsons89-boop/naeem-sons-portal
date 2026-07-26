import type { SupabaseClient } from "@supabase/supabase-js";

export type LedgerPaymentMethod = "cash" | "online" | "cheque" | "credit";

export type LedgerEntryType =
  | "opening"
  | "sale"
  | "payment"
  | "credit_memo"
  | "return_credit";

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Keep the single ledger `opening` row in sync with customers.opening_balance.
 * Zero clears the opening entry so outstanding ignores a stale seed.
 */
export async function syncOpeningLedger(
  admin: SupabaseClient,
  customerId: string,
  openingBalance: number,
  userId?: string | null,
) {
  const balance = roundMoney(Number(openingBalance) || 0);

  const { data: existing, error: findError } = await admin
    .from("customer_ledger_entries")
    .select("id")
    .eq("customer_id", customerId)
    .eq("entry_type", "opening")
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (balance === 0) {
    if (existing) {
      const { error } = await admin
        .from("customer_ledger_entries")
        .delete()
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return;
  }

  const row = {
    customer_id: customerId,
    entry_type: "opening" as const,
    amount: Math.abs(balance),
    signed_amount: balance,
    affects_balance: true,
    created_by: userId ?? null,
    notes: "Synced from customer opening balance",
  };

  if (existing) {
    const { error } = await admin
      .from("customer_ledger_entries")
      .update(row)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from("customer_ledger_entries").insert(row);
  if (error) throw new Error(error.message);
}

export async function getCustomerOutstanding(
  admin: SupabaseClient,
  customerId: string,
): Promise<number> {
  const { data } = await admin
    .from("v_customer_balances")
    .select("outstanding")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (data) return Number(data.outstanding ?? 0);

  const { data: rows } = await admin
    .from("customer_ledger_entries")
    .select("signed_amount,affects_balance")
    .eq("customer_id", customerId);
  return roundMoney(
    (rows ?? []).reduce(
      (sum, r) => sum + (r.affects_balance ? Number(r.signed_amount) : 0),
      0,
    ),
  );
}

/** Sale amount for one picklist customer from delivered lines. */
export async function computePicklistCustomerSaleAmount(
  admin: SupabaseClient,
  picklistCustomerId: string,
): Promise<number> {
  const { data: lines } = await admin
    .from("picklist_lines")
    .select("sale_price_pack,qty_delivered_units,qty_picked_units")
    .eq("picklist_customer_id", picklistCustomerId);

  const amt = (lines ?? []).reduce((sum, line) => {
    const price = Number(line.sale_price_pack ?? 0);
    const qty = Number(
      line.qty_delivered_units ?? line.qty_picked_units ?? 0,
    );
    return sum + price * qty;
  }, 0);
  return roundMoney(amt);
}

/**
 * Post SALE ledger rows for every customer on a picklist after gate pass issue.
 * Idempotent per picklist_customer_id.
 */
export async function postSalesForGatePass(
  admin: SupabaseClient,
  opts: {
    picklistId: string;
    gatePassId: string;
    userId: string;
  },
) {
  const { data: pcs } = await admin
    .from("picklist_customers")
    .select("id,customer_id,invoice_no")
    .eq("picklist_id", opts.picklistId);

  for (const pc of pcs ?? []) {
    const amount = await computePicklistCustomerSaleAmount(admin, pc.id as string);
    if (amount <= 0) continue;

    const { data: existing } = await admin
      .from("customer_ledger_entries")
      .select("id")
      .eq("entry_type", "sale")
      .eq("picklist_customer_id", pc.id)
      .maybeSingle();
    if (existing) continue;

    const { error } = await admin.from("customer_ledger_entries").insert({
      customer_id: pc.customer_id,
      entry_type: "sale",
      amount,
      signed_amount: amount,
      affects_balance: true,
      picklist_id: opts.picklistId,
      gate_pass_id: opts.gatePassId,
      picklist_customer_id: pc.id,
      invoice_no: pc.invoice_no,
      created_by: opts.userId,
      notes: "Sale on gate pass issue",
    });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
  }
}

export async function postCollectionPaymentLedger(
  admin: SupabaseClient,
  opts: {
    customerId: string;
    picklistId: string;
    gatePassId: string;
    invoiceNo: string | null;
    cashCollectionId: string;
    cashCollectionPaymentId: string;
    method: LedgerPaymentMethod;
    amount: number;
    userId: string;
    notes?: string | null;
  },
) {
  const amount = roundMoney(opts.amount);
  if (amount <= 0) return;

  const isCredit = opts.method === "credit";
  const { error } = await admin.from("customer_ledger_entries").insert({
    customer_id: opts.customerId,
    entry_type: isCredit ? "credit_memo" : "payment",
    amount,
    signed_amount: isCredit ? 0 : -amount,
    affects_balance: !isCredit,
    payment_method: opts.method,
    picklist_id: opts.picklistId,
    gate_pass_id: opts.gatePassId,
    invoice_no: opts.invoiceNo,
    cash_collection_id: opts.cashCollectionId,
    cash_collection_payment_id: opts.cashCollectionPaymentId,
    created_by: opts.userId,
    notes: opts.notes ?? (isCredit ? "Credit on account (history)" : "Collection payment"),
  });
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
}

/** Return credit using current SKU sale prices × returned qty. */
export async function postReturnCredit(
  admin: SupabaseClient,
  opts: {
    returnId: string;
    customerId: string;
    invoiceNo: string | null;
    picklistId: string | null;
    userId: string;
  },
) {
  const { data: existing } = await admin
    .from("customer_ledger_entries")
    .select("id")
    .eq("entry_type", "return_credit")
    .eq("return_receipt_id", opts.returnId)
    .maybeSingle();
  if (existing) return;

  const { data: lines } = await admin
    .from("return_lines")
    .select("qty_units,sku:skus(sale_price_pack)")
    .eq("return_id", opts.returnId);

  const amount = roundMoney(
    (lines ?? []).reduce((sum, line) => {
      const sku = line.sku as { sale_price_pack?: number | null } | null;
      const price = Number(sku?.sale_price_pack ?? 0);
      return sum + price * Number(line.qty_units ?? 0);
    }, 0),
  );
  if (amount <= 0) return;

  const { error } = await admin.from("customer_ledger_entries").insert({
    customer_id: opts.customerId,
    entry_type: "return_credit",
    amount,
    signed_amount: -amount,
    affects_balance: true,
    picklist_id: opts.picklistId,
    invoice_no: opts.invoiceNo,
    return_receipt_id: opts.returnId,
    created_by: opts.userId,
    notes: "Return credit",
  });
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
}

export async function getPicklistCustomerSaleAmount(
  admin: SupabaseClient,
  picklistCustomerId: string,
): Promise<number> {
  const { data } = await admin
    .from("customer_ledger_entries")
    .select("amount")
    .eq("entry_type", "sale")
    .eq("picklist_customer_id", picklistCustomerId)
    .maybeSingle();
  if (data) return Number(data.amount);
  return computePicklistCustomerSaleAmount(admin, picklistCustomerId);
}
