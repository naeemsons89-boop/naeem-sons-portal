"use client";

import { useMemo, useState } from "react";

import { Button, Card, Input, Label } from "@/components/ui";

type Reason = { code: string; label: string };
type StockRow = {
  sku_id: string;
  batch_id: string;
  condition: string;
  finance_status: string;
  qty_units: number;
  product_code: string;
  description: string;
  batch_code: string;
  expiry_date: string | null;
};

export function WriteOffClient({
  reasons,
  stock,
  initial,
}: {
  reasons: Reason[];
  stock: StockRow[];
  initial: Array<Record<string, unknown>>;
}) {
  const [rows, setRows] = useState(initial);
  const [reasonCode, setReasonCode] = useState(reasons[0]?.code ?? "WO_EXP");
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<
    Array<{
      sku_id: string;
      batch_id: string;
      condition: "good" | "near_expiry" | "damaged" | "hold";
      qty_units: number;
      label: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return stock.slice(0, 30);
    return stock
      .filter(
        (x) =>
          x.product_code.toLowerCase().includes(s) ||
          x.description.toLowerCase().includes(s) ||
          x.batch_code.toLowerCase().includes(s),
      )
      .slice(0, 30);
  }, [q, stock]);

  function addLine() {
    const row = stock.find(
      (s) => `${s.sku_id}|${s.batch_id}|${s.condition}|${s.finance_status}` === selectedKey,
    );
    if (!row) {
      setError("Select a stock row");
      return;
    }
    const units = Number(qty || 0);
    if (units <= 0 || units > Number(row.qty_units)) {
      setError(`Qty must be between 1 and ${row.qty_units}`);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        sku_id: row.sku_id,
        batch_id: row.batch_id,
        condition: row.condition as "good" | "near_expiry" | "damaged" | "hold",
        qty_units: units,
        label: `${row.product_code} · ${row.batch_code} · ${row.condition}`,
      },
    ]);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/write-offs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    const list = await fetch("/api/write-offs").then((r) => r.json());
    setRows(list.write_offs ?? []);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">Destroy / write-off stock</h2>
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
        <Input
          placeholder="Search on-hand SKU / batch"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
        >
          <option value="">Select stock line</option>
          {filtered.map((s) => {
            const key = `${s.sku_id}|${s.batch_id}|${s.condition}|${s.finance_status}`;
            return (
              <option key={key} value={key}>
                {s.product_code} · {s.batch_code} · {s.condition}/{s.finance_status} · qty{" "}
                {s.qty_units}
                {s.expiry_date ? ` · exp ${s.expiry_date}` : ""}
              </option>
            );
          })}
        </select>
        <div className="flex gap-2">
          <Input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="max-w-32"
          />
          <Button type="button" variant="secondary" onClick={addLine}>
            Add line
          </Button>
        </div>
        <ul className="text-sm">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between">
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
        <Button disabled={busy || !lines.length} onClick={() => void submit()}>
          {busy ? "Posting…" : "Post write-off"}
        </Button>
        <p className="text-xs text-[var(--ink-muted)]">
          Admin / Manager only. Signature block available on printout.
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Recent write-offs</h2>
        {rows.map((r) => (
          <div key={r.id as string} className="flex justify-between text-sm">
            <span>
              {String(r.write_off_no)} · {String(r.status)}
            </span>
            <a
              className="font-semibold text-[var(--brand)]"
              href={`/app/print/write-off/${r.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Print PDF
            </a>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No write-offs yet.</p>
        ) : null}
      </Card>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
