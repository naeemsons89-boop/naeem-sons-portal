"use client";

import { useMemo, useState } from "react";

import { Button, Card, Input, Label } from "@/components/ui";

type Customer = { id: string; code: string; name: string };
type Sku = { id: string; product_code: string; description: string };
type BatchOpt = {
  batch_id: string;
  batch_code: string;
  qty_units: number;
  expiry_date: string | null;
};

type ExLine = {
  direction: "out" | "in";
  sku_id: string;
  batch_id?: string;
  batch_code?: string;
  condition: "good" | "near_expiry" | "damaged";
  qty_units: number;
  label: string;
};

export function ExchangeClient({
  customers,
  skus,
  warehouseId,
  initial,
}: {
  customers: Customer[];
  skus: Sku[];
  warehouseId: string;
  initial: Array<Record<string, unknown>>;
}) {
  const [rows, setRows] = useState(initial);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [skuId, setSkuId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [batches, setBatches] = useState<BatchOpt[]>([]);
  const [condition, setCondition] = useState<"good" | "near_expiry" | "damaged">(
    "good",
  );
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<ExLine[]>([]);
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
    if (direction === "out") {
      const r = await fetch(
        `/api/stock/pickable?sku_id=${id}&warehouse_id=${warehouseId}`,
      );
      if (r.ok) {
        const j = await r.json();
        setBatches(j.batches ?? []);
        setBatchId(j.batches?.[0]?.batch_id ?? "");
      }
    }
  }

  function addLine() {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku) {
      setError("Select SKU");
      return;
    }
    if (direction === "out" && !batchId) {
      setError("Select pickable batch for OUT");
      return;
    }
    if (direction === "in" && !batchCode.trim() && !batchId) {
      setError("Enter batch code for IN");
      return;
    }
    const batch = batches.find((b) => b.batch_id === batchId);
    setLines((prev) => [
      ...prev,
      {
        direction,
        sku_id: sku.id,
        batch_id: direction === "out" ? batchId : undefined,
        batch_code: direction === "in" ? batchCode.trim() : batch?.batch_code,
        condition: direction === "in" ? condition : "good",
        qty_units: Number(qty || 0),
        label: `${direction.toUpperCase()} ${sku.product_code}`,
      },
    ]);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/exchanges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        reason_code: "EX_SWAP",
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
    const list = await fetch("/api/exchanges").then((r) => r.json());
    setRows(list.exchanges ?? []);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">Product exchange</h2>
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
        <div className="flex gap-2">
          <Button
            type="button"
            variant={direction === "out" ? "primary" : "secondary"}
            onClick={() => setDirection("out")}
          >
            OUT to customer
          </Button>
          <Button
            type="button"
            variant={direction === "in" ? "primary" : "secondary"}
            onClick={() => setDirection("in")}
          >
            IN from customer
          </Button>
        </div>
        <Input placeholder="Search SKU" value={q} onChange={(e) => setQ(e.target.value)} />
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
          {direction === "out" ? (
            <div>
              <Label>Pickable batch</Label>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              >
                <option value="">Select</option>
                {batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    {b.batch_code} · {b.qty_units}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <Label>Batch code in</Label>
                <Input
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                />
              </div>
              <div>
                <Label>Condition in</Label>
                <select
                  className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  value={condition}
                  onChange={(e) =>
                    setCondition(
                      e.target.value as "good" | "near_expiry" | "damaged",
                    )
                  }
                >
                  <option value="good">Good</option>
                  <option value="near_expiry">Near expiry</option>
                  <option value="damaged">Damaged</option>
                </select>
              </div>
            </>
          )}
          <div>
            <Label>Qty</Label>
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
            <li key={i}>
              {l.label} × {l.qty_units}
            </li>
          ))}
        </ul>
        <Button disabled={busy || !lines.length} onClick={() => void submit()}>
          {busy ? "Posting…" : "Post exchange"}
        </Button>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Recent exchanges</h2>
        {rows.map((r) => (
          <p key={r.id as string} className="text-sm">
            {String(r.exchange_no)} · {String(r.status)}
          </p>
        ))}
      </Card>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
