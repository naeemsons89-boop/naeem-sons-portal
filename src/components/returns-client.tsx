"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button, Card, Input, Label } from "@/components/ui";

type Customer = { id: string; code: string; name: string };
type Sku = { id: string; product_code: string; description: string };
type Reason = { code: string; label: string };
type ReturnRow = {
  id: string;
  return_no: string;
  status: string;
  requires_unknown_batch_approval: boolean;
  customer: { code?: string; name?: string } | null;
};

export function ReturnsClient({
  customers,
  skus,
  reasons,
  initialReturns,
  canApprove,
}: {
  customers: Customer[];
  skus: Sku[];
  reasons: Reason[];
  initialReturns: ReturnRow[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialReturns);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [reasonCode, setReasonCode] = useState(reasons[0]?.code ?? "RET_GOOD");
  const [skuId, setSkuId] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [condition, setCondition] = useState<"good" | "near_expiry" | "damaged">(
    "good",
  );
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<
    Array<{
      sku_id: string;
      batch_code?: string;
      is_unknown_batch?: boolean;
      condition: "good" | "near_expiry" | "damaged";
      qty_units: number;
      label: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return skus.slice(0, 20);
    return skus
      .filter(
        (x) =>
          x.product_code.toLowerCase().includes(s) ||
          x.description.toLowerCase().includes(s),
      )
      .slice(0, 20);
  }, [q, skus]);

  function addLine() {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku) {
      setError("Select SKU");
      return;
    }
    if (!unknown && !batchCode.trim()) {
      setError("Enter batch or mark unknown");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        sku_id: sku.id,
        batch_code: unknown ? undefined : batchCode.trim(),
        is_unknown_batch: unknown,
        condition,
        qty_units: Number(qty || 0),
        label: `${sku.product_code} · ${unknown ? "UNKNOWN" : batchCode} · ${condition}`,
      },
    ]);
    setBatchCode("");
    setQty("1");
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        invoice_no: invoiceNo,
        reason_code: reasonCode,
        lines: lines.map(({ label: _l, ...rest }) => rest),
        post_now: true,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    setMessage(
      json.return?.requires_unknown_batch_approval
        ? `Saved ${json.return.return_no} — waiting manager approval`
        : `Posted ${json.return.return_no}`,
    );
    setLines([]);
    router.refresh();
    const list = await fetch("/api/returns").then((r) => r.json());
    setRows(list.returns ?? []);
  }

  async function approve(id: string) {
    setBusy(true);
    const res = await fetch(`/api/returns/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_and_post" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Approve failed");
      return;
    }
    setMessage(json.message);
    const list = await fetch("/api/returns").then((r) => r.json());
    setRows(list.returns ?? []);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">New customer return</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Customer</Label>
            <select
              className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Reason</Label>
            <select
              className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Invoice no</Label>
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-[var(--line)] p-3">
          <Label>Search SKU</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
          {q ? (
            <div className="mb-2 max-h-28 overflow-auto">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full px-2 py-1 text-left text-sm hover:bg-[var(--surface-2)]"
                  onClick={() => {
                    setSkuId(s.id);
                    setQ(s.product_code);
                  }}
                >
                  {s.product_code} — {s.description}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <Label>Batch</Label>
              <Input
                value={batchCode}
                disabled={unknown}
                onChange={(e) => setBatchCode(e.target.value)}
              />
            </div>
            <div>
              <Label>Condition</Label>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as "good" | "near_expiry" | "damaged")
                }
              >
                <option value="good">Good</option>
                <option value="near_expiry">Near expiry</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
            <div>
              <Label>Qty units</Label>
              <Input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={unknown}
                  onChange={(e) => setUnknown(e.target.checked)}
                />
                Unknown batch
              </label>
            </div>
          </div>
          <Button type="button" className="mt-2" variant="secondary" onClick={addLine}>
            Add line
          </Button>
        </div>

        <ul className="space-y-1 text-sm">
          {lines.map((l, i) => (
            <li key={`${l.sku_id}-${i}`} className="flex justify-between">
              <span>
                {l.label} × {l.qty_units}
              </span>
              <button
                type="button"
                className="text-[var(--danger)]"
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <Button disabled={busy || lines.length === 0} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save return"}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Recent returns</h2>
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">{r.return_no}</p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {r.customer?.code} — {r.customer?.name} · {r.status}
                  {r.requires_unknown_batch_approval ? " · needs approval" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/app/returns/${r.id}`}
                  className="text-sm font-semibold text-[var(--brand)]"
                >
                  View
                </Link>
                {canApprove && r.requires_unknown_batch_approval ? (
                  <Button size="sm" disabled={busy} onClick={() => void approve(r.id)}>
                    Approve & post
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No returns yet.</p>
          ) : null}
        </div>
      </Card>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
