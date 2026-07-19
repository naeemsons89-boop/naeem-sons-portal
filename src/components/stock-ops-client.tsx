"use client";

import { useMemo, useState } from "react";

import { Button, Card, Input, Label } from "@/components/ui";

type StockRow = {
  sku_id: string;
  batch_id: string;
  condition: string;
  finance_status: string;
  qty_units: number;
  product_code: string;
  batch_code: string;
  warehouse_id: string;
};

type Warehouse = { id: string; code: string; name: string };

export function StockOpsClient({
  stock,
  warehouses,
}: {
  stock: StockRow[];
  warehouses: Warehouse[];
}) {
  const [mode, setMode] = useState<"adjust" | "transfer">("adjust");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [fromWh, setFromWh] = useState(warehouses[0]?.id ?? "");
  const [toWh, setToWh] = useState(warehouses[1]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<
    Array<{
      sku_id: string;
      batch_id: string;
      condition: "good" | "near_expiry" | "damaged" | "hold";
      finance_status: "pending" | "posted";
      qty_units: number;
      label: string;
      direction?: "in" | "out";
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = stock.filter((x) =>
      mode === "transfer" ? x.warehouse_id === fromWh : true,
    );
    if (!s) return base.slice(0, 40);
    return base
      .filter(
        (x) =>
          x.product_code.toLowerCase().includes(s) ||
          x.batch_code.toLowerCase().includes(s),
      )
      .slice(0, 40);
  }, [q, stock, mode, fromWh]);

  function addLine() {
    const row = stock.find(
      (s) =>
        `${s.sku_id}|${s.batch_id}|${s.condition}|${s.finance_status}|${s.warehouse_id}` ===
        selectedKey,
    );
    if (!row) {
      setError("Select stock");
      return;
    }
    const units = Number(qty || 0);
    if (units <= 0) {
      setError("Qty must be > 0");
      return;
    }
    if (mode === "transfer" || direction === "out") {
      if (units > row.qty_units) {
        setError(`Max ${row.qty_units}`);
        return;
      }
    }
    setLines((prev) => [
      ...prev,
      {
        sku_id: row.sku_id,
        batch_id: row.batch_id,
        condition: row.condition as "good" | "near_expiry" | "damaged" | "hold",
        finance_status: row.finance_status as "pending" | "posted",
        qty_units: units,
        direction: mode === "adjust" ? direction : undefined,
        label: `${row.product_code} · ${row.batch_code} · ${row.condition}`,
      },
    ]);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const payload =
      mode === "adjust"
        ? {
            action: "adjust" as const,
            warehouse_id: fromWh || undefined,
            notes,
            lines: lines.map(({ label: _l, ...rest }) => rest),
          }
        : {
            action: "transfer" as const,
            from_warehouse_id: fromWh,
            to_warehouse_id: toWh,
            notes,
            lines: lines.map(({ label: _l, direction: _d, ...rest }) => rest),
          };
    const res = await fetch("/api/stock-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    setMessage(json.message);
    setLines([]);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "adjust" ? "primary" : "secondary"}
          onClick={() => setMode("adjust")}
        >
          Adjustment
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "transfer" ? "primary" : "secondary"}
          onClick={() => setMode("transfer")}
        >
          Transfer WH
        </Button>
      </div>

      <Card className="space-y-3">
        {mode === "adjust" ? (
          <div>
            <Label>Direction</Label>
            <select
              className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
            >
              <option value="out">Adjust out (reduce)</option>
              <option value="in">Adjust in (increase)</option>
            </select>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>From warehouse</Label>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={fromWh}
                onChange={(e) => setFromWh(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>To warehouse</Label>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={toWh}
                onChange={(e) => setToWh(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <Input
          placeholder="Search SKU / batch"
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
            const key = `${s.sku_id}|${s.batch_id}|${s.condition}|${s.finance_status}|${s.warehouse_id}`;
            return (
              <option key={key} value={key}>
                {s.product_code} · {s.batch_code} · {s.condition}/{s.finance_status} · qty{" "}
                {s.qty_units}
              </option>
            );
          })}
        </select>
        <div className="flex gap-2">
          <Input
            type="number"
            min="1"
            className="max-w-32"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
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
                {l.direction ? ` (${l.direction})` : ""}
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
        <div>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button disabled={busy || !lines.length} onClick={() => void submit()}>
          {busy ? "Posting…" : mode === "adjust" ? "Post adjustment" : "Post transfer"}
        </Button>
      </Card>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
