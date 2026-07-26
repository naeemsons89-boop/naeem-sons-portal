"use client";

import { useEffect, useState } from "react";

import { Avatar, Badge, Card, EmptyState, Input, Label } from "@/components/ui";

type CustomerBalance = {
  customer_id: string;
  code: string;
  name: string;
  outstanding: number;
};

type LedgerEntry = {
  id: string;
  entry_type: string;
  amount: number;
  signed_amount: number;
  affects_balance: boolean;
  payment_method: string | null;
  invoice_no: string | null;
  notes: string | null;
  created_at: string;
  running_balance: number;
  picklist: { picklist_no?: string } | null;
  gate_pass: { gate_pass_no?: string } | null;
  cash_collection: { collection_no?: string } | null;
  return_receipt: { return_no?: string } | null;
};

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function entryLabel(e: LedgerEntry) {
  switch (e.entry_type) {
    case "opening":
      return "Opening balance";
    case "sale":
      return "Sale";
    case "payment":
      return `Payment (${e.payment_method ?? "—"})`;
    case "credit_memo":
      return "Credit on account";
    case "return_credit":
      return "Return credit";
    default:
      return e.entry_type;
  }
}

function entryTone(type: string): "success" | "pending" | "neutral" | "danger" {
  if (type === "sale" || type === "opening") return "pending";
  if (type === "payment" || type === "return_credit") return "success";
  if (type === "credit_memo") return "neutral";
  return "neutral";
}

export function SaleLedgerClient({
  initialCustomers,
}: {
  initialCustomers: CustomerBalance[];
}) {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState(initialCustomers);
  const [selectedId, setSelectedId] = useState(initialCustomers[0]?.customer_id ?? "");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/sale-ledger?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (res.ok) setCustomers(json.customers ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!selectedId) {
      setEntries([]);
      setOutstanding(0);
      return;
    }
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/sale-ledger?customer_id=${selectedId}`);
      const json = await res.json();
      if (cancelled) return;
      setBusy(false);
      if (!res.ok) {
        setError(json.error ?? "Failed to load ledger");
        return;
      }
      setEntries(json.entries ?? []);
      setOutstanding(Number(json.balance?.outstanding ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = customers.find((c) => c.customer_id === selectedId);

  return (
    <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
      <Card className="space-y-2">
        <div>
          <Label>Search customer</Label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code or name"
          />
        </div>
        <div className="max-h-[70vh] space-y-0.5 overflow-y-auto">
          {customers.map((c) => (
            <button
              key={c.customer_id}
              type="button"
              onClick={() => setSelectedId(c.customer_id)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                selectedId === c.customer_id
                  ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                  : "hover:bg-[var(--surface-2)]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-[var(--ink-muted)]">{c.code}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums">
                {money(Number(c.outstanding))}
              </span>
            </button>
          ))}
          {customers.length === 0 ? <EmptyState>No customers found.</EmptyState> : null}
        </div>
      </Card>

      <Card>
        {selected ? (
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-medium">{selected.name}</h2>
              <p className="text-sm text-[var(--ink-muted)]">{selected.code}</p>
            </div>
            <div className="rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                Outstanding
              </p>
              <p className="text-base font-medium tabular-nums">{money(outstanding)}</p>
            </div>
          </div>
        ) : (
          <EmptyState>Select a customer to view sale ledger.</EmptyState>
        )}

        {busy ? (
          <p className="text-sm text-[var(--ink-muted)]">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-[11px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="py-1.5 pr-3">Date</th>
                  <th className="py-1.5 pr-3">Type</th>
                  <th className="py-1.5 pr-3">Ref</th>
                  <th className="py-1.5 pr-3 text-right">Debit</th>
                  <th className="py-1.5 pr-3 text-right">Credit</th>
                  <th className="py-1.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const debit = Number(e.signed_amount) > 0 ? Number(e.amount) : 0;
                  const credit =
                    Number(e.signed_amount) < 0 ||
                    (e.entry_type === "credit_memo" && !e.affects_balance)
                      ? Number(e.amount)
                      : 0;
                  const refs = [
                    e.picklist?.picklist_no ? `PL ${e.picklist.picklist_no}` : null,
                    e.gate_pass?.gate_pass_no ? `GP ${e.gate_pass.gate_pass_no}` : null,
                    e.invoice_no ? `Inv ${e.invoice_no}` : null,
                    e.cash_collection?.collection_no
                      ? e.cash_collection.collection_no
                      : null,
                    e.return_receipt?.return_no ? e.return_receipt.return_no : null,
                  ].filter(Boolean);

                  return (
                    <tr key={e.id} className="border-b border-[var(--line)]/70">
                      <td className="py-2 pr-3 whitespace-nowrap text-[var(--ink-muted)]">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={entryTone(e.entry_type)}>{entryLabel(e)}</Badge>
                          {!e.affects_balance ? (
                            <span className="text-[10px] text-[var(--ink-muted)]">
                              history only
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-[var(--ink-muted)]">
                        {refs.join(" · ") || "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {debit ? money(debit) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {credit ? money(credit) : "—"}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {e.affects_balance ? money(e.running_balance) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selected && entries.length === 0 ? (
              <EmptyState>No ledger entries for this customer yet.</EmptyState>
            ) : null}
          </div>
        )}
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>
    </div>
  );
}
