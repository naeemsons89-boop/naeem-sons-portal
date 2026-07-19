"use client";

import { useMemo, useState } from "react";

import { Button, Card, Input, Label } from "@/components/ui";

type Customer = { id: string; code: string; name: string };
type PicklistOpt = { id: string; picklist_no: string; delivery_date: string };
type GatePassOpt = {
  id: string;
  gate_pass_no: string;
  picklist_id: string;
};

type PayRow = {
  key: string;
  method: "cash" | "online" | "cheque";
  amount: string;
  cheque_no: string;
  bank_name: string;
  online_ref: string;
  notes: string;
  file: File | null;
};

function emptyPay(): PayRow {
  return {
    key: crypto.randomUUID(),
    method: "cash",
    amount: "",
    cheque_no: "",
    bank_name: "",
    online_ref: "",
    notes: "",
    file: null,
  };
}

export function CashCollectionClient({
  customers,
  picklists,
  gatePasses,
  initial,
}: {
  customers: Customer[];
  picklists: PicklistOpt[];
  gatePasses: GatePassOpt[];
  initial: Array<Record<string, unknown>>;
}) {
  const [rows, setRows] = useState(initial);
  const [picklistId, setPicklistId] = useState(picklists[0]?.id ?? "");
  const [gatePassId, setGatePassId] = useState("");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [outstanding, setOutstanding] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [payments, setPayments] = useState<PayRow[]>([emptyPay()]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filteredGps = useMemo(
    () => gatePasses.filter((g) => g.picklist_id === picklistId),
    [gatePasses, picklistId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const form = new FormData();
    form.set("picklist_id", picklistId);
    form.set("gate_pass_id", gatePassId);
    form.set("customer_id", customerId);
    form.set("invoice_no", invoiceNo);
    form.set("outstanding_balance", outstanding);
    form.set("remarks", remarks);
    form.set(
      "payments",
      JSON.stringify(
        payments.map((p, i) => ({
          method: p.method,
          amount: Number(p.amount || 0),
          cheque_no: p.cheque_no || undefined,
          bank_name: p.bank_name || undefined,
          online_ref: p.online_ref || undefined,
          notes: p.notes || undefined,
          proof_index: i,
        })),
      ),
    );
    payments.forEach((p, i) => {
      if (p.file) form.set(`proof_${i}`, p.file);
    });

    const res = await fetch("/api/cash-collections", { method: "POST", body: form });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    setMessage(json.message);
    setPayments([emptyPay()]);
    const list = await fetch("/api/cash-collections").then((r) => r.json());
    setRows(list.collections ?? []);
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <h2 className="font-semibold">New collection (linked to gate pass)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Picklist</Label>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={picklistId}
                onChange={(e) => {
                  setPicklistId(e.target.value);
                  setGatePassId("");
                }}
                required
              >
                <option value="">Select</option>
                {picklists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.picklist_no} · {p.delivery_date}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Gate pass</Label>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={gatePassId}
                onChange={(e) => setGatePassId(e.target.value)}
                required
              >
                <option value="">Select</option>
                {filteredGps.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.gate_pass_no}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Customer</Label>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Invoice no</Label>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </div>
            <div>
              <Label>Outstanding balance</Label>
              <Input
                type="number"
                step="0.01"
                value={outstanding}
                onChange={(e) => setOutstanding(e.target.value)}
              />
            </div>
            <div>
              <Label>Remarks</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Payments (cash / online / cheque)</h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPayments((p) => [...p, emptyPay()])}
              >
                Add payment method
              </Button>
            </div>
            {payments.map((p, idx) => (
              <div
                key={p.key}
                className="grid gap-2 rounded-xl border border-[var(--line)] p-3 sm:grid-cols-3"
              >
                <div>
                  <Label>Method</Label>
                  <select
                    className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    value={p.method}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((x) =>
                          x.key === p.key
                            ? {
                                ...x,
                                method: e.target.value as PayRow["method"],
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={p.amount}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((x) =>
                          x.key === p.key ? { ...x, amount: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Proof image / PDF</Label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="block w-full text-sm"
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((x) =>
                          x.key === p.key
                            ? { ...x, file: e.target.files?.[0] ?? null }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
                {p.method === "cheque" ? (
                  <>
                    <div>
                      <Label>Cheque no</Label>
                      <Input
                        value={p.cheque_no}
                        onChange={(e) =>
                          setPayments((prev) =>
                            prev.map((x) =>
                              x.key === p.key
                                ? { ...x, cheque_no: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Bank</Label>
                      <Input
                        value={p.bank_name}
                        onChange={(e) =>
                          setPayments((prev) =>
                            prev.map((x) =>
                              x.key === p.key
                                ? { ...x, bank_name: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                  </>
                ) : null}
                {p.method === "online" ? (
                  <div>
                    <Label>Online ref</Label>
                    <Input
                      value={p.online_ref}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x) =>
                            x.key === p.key
                              ? { ...x, online_ref: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </div>
                ) : null}
                <div className="sm:col-span-3">
                  <Label>Notes</Label>
                  <Input
                    value={p.notes}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((x) =>
                          x.key === p.key ? { ...x, notes: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
                {payments.length > 1 ? (
                  <button
                    type="button"
                    className="text-left text-xs font-semibold text-[var(--danger)]"
                    onClick={() =>
                      setPayments((prev) => prev.filter((x) => x.key !== p.key))
                    }
                  >
                    Remove payment #{idx + 1}
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save collection"}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Recent collections</h2>
        {rows.map((r) => {
          const customer = r.customer as { code?: string; name?: string } | null;
          const gp = r.gate_pass as { gate_pass_no?: string } | null;
          return (
            <div key={r.id as string} className="flex justify-between text-sm">
              <span>
                {String(r.collection_no)} · {customer?.code} · GP {gp?.gate_pass_no}
              </span>
              <a
                className="font-semibold text-[var(--brand)]"
                href={`/app/print/cash-collection/${r.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Print
              </a>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No collections yet.</p>
        ) : null}
      </Card>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
