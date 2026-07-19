"use client";

import { useMemo, useState } from "react";

import { Badge, Button, Card, EmptyState, Input, Label, statusTone } from "@/components/ui";

type Customer = { id: string; code: string; name: string };
type Sku = { id: string; product_code: string; description: string };
type Reason = { code: string; label: string };
type BatchOpt = {
  batch_id: string;
  batch_code: string;
  qty_units: number;
  expiry_date: string | null;
};

export function FocClient({
  customers,
  skus,
  reasons,
  warehouseId,
  initial,
}: {
  customers: Customer[];
  skus: Sku[];
  reasons: Reason[];
  warehouseId: string;
  initial: Array<Record<string, unknown>>;
}) {
  const [rows, setRows] = useState(initial);
  const [customerId, setCustomerId] = useState("");
  const [reasonCode, setReasonCode] = useState(reasons[0]?.code ?? "FOC_SAMPLE");
  const [skuId, setSkuId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [batches, setBatches] = useState<BatchOpt[]>([]);
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<
    Array<{ sku_id: string; batch_id: string; qty_units: number; label: string }>
  >([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function loadBatches(id: string) {
    setSkuId(id);
    const r = await fetch(
      `/api/stock/pickable?sku_id=${id}&warehouse_id=${warehouseId}`,
    );
    if (r.ok) {
      const j = await r.json();
      setBatches(j.batches ?? []);
      setBatchId(j.batches?.[0]?.batch_id ?? "");
    } else {
      setBatches([]);
      setBatchId("");
    }
  }

  function addLine() {
    const sku = skus.find((s) => s.id === skuId);
    const batch = batches.find((b) => b.batch_id === batchId);
    if (!sku || !batch) {
      setError("Select SKU and pickable batch");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        sku_id: sku.id,
        batch_id: batch.batch_id,
        qty_units: Number(qty || 0),
        label: `${sku.product_code} · ${batch.batch_code}`,
      },
    ]);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/foc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId || undefined,
        reason_code: reasonCode,
        lines: lines.map(({ label: _l, ...rest }) => rest),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    setMessage(json.message);
    setLines([]);
    const list = await fetch("/api/foc").then((r) => r.json());
    setRows(list.foc ?? []);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">Issue FOC / sampling</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Customer (optional)</Label>
            <select
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">—</option>
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
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm"
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
        </div>
        <Input
          placeholder="Search SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q ? (
          <div className="max-h-28 overflow-auto rounded border border-[var(--line)]">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="block w-full px-2 py-1 text-left text-sm hover:bg-[var(--surface-2)]"
                onClick={() => {
                  setQ(s.product_code);
                  void loadBatches(s.id);
                }}
              >
                {s.product_code} — {s.description}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <Label>Pickable batch (FEFO)</Label>
            <select
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">Select</option>
              {batches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.batch_code} · {b.qty_units}
                  {b.expiry_date ? ` · exp ${b.expiry_date}` : ""}
                </option>
              ))}
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
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={addLine}>
              Add line
            </Button>
          </div>
        </div>
        <ul className="text-sm">
          {lines.map((l, i) => (
            <li key={`${l.batch_id}-${i}`}>
              {l.label} × {l.qty_units}
            </li>
          ))}
        </ul>
        <Button disabled={busy || !lines.length} onClick={() => void submit()}>
          {busy ? "Posting…" : "Post FOC"}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Recent FOC</h2>
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id as string}
              className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 font-medium">
                {String(r.foc_no)}
                <Badge tone={statusTone(String(r.status))} className="capitalize">
                  {String(r.status)}
                </Badge>
              </span>
              <a
                className="font-semibold text-[var(--brand)]"
                href={`/app/print/foc/${r.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Print
              </a>
            </div>
          ))}
        </div>
        {rows.length === 0 ? <EmptyState>No FOC yet.</EmptyState> : null}
      </Card>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
