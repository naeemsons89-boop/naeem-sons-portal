"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Card, Input, Label } from "@/components/ui";

type Tab = "stock" | "movements" | "recall" | "sales";

export function ReportsClient({ canExport }: { canExport: boolean }) {
  const [tab, setTab] = useState<Tab>("stock");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const params = new URLSearchParams({ type: tab });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q) params.set("q", q);
    const res = await fetch(`/api/reports?${params}`);
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Failed");
      setData(null);
      return;
    }
    setData(json);
  }, [tab, from, to, q]);

  useEffect(() => {
    if (tab === "recall") return;
    void load();
  }, [tab, load]);

  function csvUrl() {
    const params = new URLSearchParams({ type: tab, format: "csv" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q) params.set("q", q);
    return `/api/reports?${params}`;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "stock", label: "Stock & value" },
    { id: "movements", label: "Movements" },
    { id: "recall", label: "Batch recall" },
    { id: "sales", label: "Sales" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={tab === t.id ? "primary" : "secondary"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          {(tab === "movements" || tab === "sales") && (
            <>
              <div>
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {(tab === "movements" || tab === "recall") && (
            <div className="sm:col-span-2">
              <Label>{tab === "recall" ? "Batch / barcode / SKU" : "Filter"}</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  tab === "recall" ? "Enter batch code or barcode" : "SKU / batch / doc"
                }
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void load()}>
            {busy ? "Loading…" : tab === "recall" ? "Trace batch" : "Refresh"}
          </Button>
          {canExport ? (
            <a
              href={csvUrl()}
              className="inline-flex items-center rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold"
            >
              Export CSV
            </a>
          ) : null}
        </div>
      </Card>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {tab === "stock" && data?.rows ? (
        <StockTable data={data} />
      ) : null}
      {tab === "movements" && data?.rows ? (
        <MovementsTable rows={data.rows as Record<string, unknown>[]} />
      ) : null}
      {tab === "recall" && data ? <RecallView data={data} /> : null}
      {tab === "sales" && data?.rows ? <SalesTable data={data} /> : null}
    </div>
  );
}

function StockTable({ data }: { data: Record<string, unknown> }) {
  const rows = data.rows as Array<Record<string, unknown>>;
  const totals = data.totals as { qty_units?: number; inventory_value?: number | null };
  const showFinance = Boolean(data.showFinance);
  return (
    <Card className="overflow-x-auto">
      {totals ? (
        <p className="mb-3 text-sm text-[var(--ink-muted)]">
          Total qty {totals.qty_units}
          {showFinance && totals.inventory_value != null
            ? ` · Inventory value ${Number(totals.inventory_value).toFixed(2)}`
            : ""}
        </p>
      ) : null}
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase text-[var(--ink-muted)]">
          <tr>
            <th className="py-2 pr-2">WH</th>
            <th className="py-2 pr-2">Cat</th>
            <th className="py-2 pr-2">SKU</th>
            <th className="py-2 pr-2">Batch</th>
            <th className="py-2 pr-2">Exp</th>
            <th className="py-2 pr-2">Qty</th>
            <th className="py-2 pr-2">Cond</th>
            <th className="py-2 pr-2">Fin</th>
            {showFinance ? <th className="py-2">Value</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--line)]">
              <td className="py-2 pr-2">{String(r.warehouse)}</td>
              <td className="py-2 pr-2">{String(r.category || "—")}</td>
              <td className="py-2 pr-2">
                <div className="font-medium">{String(r.product_code)}</div>
                <div className="text-xs text-[var(--ink-muted)]">{String(r.description)}</div>
              </td>
              <td className="py-2 pr-2 font-mono text-xs">{String(r.batch_code)}</td>
              <td className="py-2 pr-2">{String(r.expiry_date || "—")}</td>
              <td className="py-2 pr-2">{String(r.qty_units)}</td>
              <td className="py-2 pr-2">{String(r.condition)}</td>
              <td className="py-2 pr-2">{String(r.finance_status)}</td>
              {showFinance ? (
                <td className="py-2">{Number(r.inventory_value ?? 0).toFixed(2)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MovementsTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase text-[var(--ink-muted)]">
          <tr>
            <th className="py-2 pr-2">When</th>
            <th className="py-2 pr-2">Type</th>
            <th className="py-2 pr-2">SKU</th>
            <th className="py-2 pr-2">Batch</th>
            <th className="py-2 pr-2">Qty</th>
            <th className="py-2 pr-2">Doc</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)} className="border-t border-[var(--line)]">
              <td className="py-2 pr-2 text-xs">
                {r.created_at ? new Date(String(r.created_at)).toLocaleString("en-PK") : "—"}
              </td>
              <td className="py-2 pr-2">{String(r.movement_type)}</td>
              <td className="py-2 pr-2">{String(r.product_code)}</td>
              <td className="py-2 pr-2 font-mono text-xs">{String(r.batch_code)}</td>
              <td className="py-2 pr-2">{String(r.qty_units)}</td>
              <td className="py-2 pr-2">
                {String(r.document_no || "—")}
                <div className="text-xs text-[var(--ink-muted)]">{String(r.document_type || "")}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">No movements in range.</p>
      ) : null}
    </Card>
  );
}

function RecallView({ data }: { data: Record<string, unknown> }) {
  const batches = (data.batches as Record<string, unknown>[]) ?? [];
  const customers = (data.customers as Record<string, unknown>[]) ?? [];
  const movements = (data.movements as Record<string, unknown>[]) ?? [];
  const balances = (data.balances as Record<string, unknown>[]) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 font-semibold">Matched batches</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No batches found. Run Trace first.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {batches.map((b) => {
              const sku = b.sku as { product_code?: string; description?: string } | null;
              return (
                <li key={String(b.id)}>
                  <span className="font-mono font-semibold">{String(b.batch_code)}</span> ·{" "}
                  {sku?.product_code} — {sku?.description}
                  {b.expiry_date ? ` · exp ${String(b.expiry_date)}` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Still on hand</h2>
        <ul className="space-y-1 text-sm">
          {balances.map((b, i) => {
            const sku = b.sku as { product_code?: string } | null;
            const batch = b.batch as { batch_code?: string } | null;
            const wh = b.warehouse as { code?: string } | null;
            return (
              <li key={i}>
                {wh?.code} · {sku?.product_code} · {batch?.batch_code} · {String(b.condition)}/
                {String(b.finance_status)} × {String(b.qty_units)}
              </li>
            );
          })}
          {balances.length === 0 ? (
            <li className="text-[var(--ink-muted)]">None on hand</li>
          ) : null}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Went to customers (via gate pass)</h2>
        <ul className="space-y-1 text-sm">
          {customers.map((c, i) => (
            <li key={i}>
              {String(c.customer_code)} {String(c.customer_name)} · GP {String(c.gate_pass_no)} ·
              PL {String(c.picklist_no)} · batch {String(c.batch_code)} × {String(c.qty_units)}
            </li>
          ))}
          {customers.length === 0 ? (
            <li className="text-[var(--ink-muted)]">No outward gate-pass lines for these batches</li>
          ) : null}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Full movement trail</h2>
        <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {movements.map((m, i) => {
            const sku = m.sku as { product_code?: string } | null;
            const batch = m.batch as { batch_code?: string } | null;
            return (
              <li key={i}>
                {m.created_at ? new Date(String(m.created_at)).toLocaleString("en-PK") : ""} ·{" "}
                {String(m.movement_type)} · {sku?.product_code} · {batch?.batch_code} ×{" "}
                {String(m.qty_units)} · {String(m.document_no || "")}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function SalesTable({ data }: { data: Record<string, unknown> }) {
  const rows = data.rows as Array<Record<string, unknown>>;
  const totals = data.totals as { qty_picked?: number; sale_amount?: number };
  return (
    <Card className="overflow-x-auto">
      {totals ? (
        <p className="mb-3 text-sm text-[var(--ink-muted)]">
          Qty {totals.qty_picked} · Sale amount {Number(totals.sale_amount ?? 0).toFixed(2)}
        </p>
      ) : null}
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase text-[var(--ink-muted)]">
          <tr>
            <th className="py-2 pr-2">Picklist</th>
            <th className="py-2 pr-2">Date</th>
            <th className="py-2 pr-2">SKU</th>
            <th className="py-2 pr-2">Qty</th>
            <th className="py-2 pr-2">Price</th>
            <th className="py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--line)]">
              <td className="py-2 pr-2">{String(r.picklist_no)}</td>
              <td className="py-2 pr-2">{String(r.delivery_date)}</td>
              <td className="py-2 pr-2">{String(r.product_code)}</td>
              <td className="py-2 pr-2">{String(r.qty_picked)}</td>
              <td className="py-2 pr-2">{String(r.sale_price_pack)}</td>
              <td className="py-2">{Number(r.sale_amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
