"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ScanField } from "@/components/barcode-scanner";
import { Button, Card, Input, Label } from "@/components/ui";

type BatchOpt = {
  batch_id: string;
  batch_code: string;
  mfg_date: string | null;
  expiry_date: string | null;
  qty_units: number;
};

type Line = {
  id: string;
  line_no: number;
  sku_id: string;
  qty_ordered_units: number;
  qty_picked_units: number;
  qty_delivered_units: number;
  qty_load_in_good_units: number;
  qty_load_in_bad_units: number;
  suggested_batch_id: string | null;
  scanned_batch_id: string | null;
  approved_batch_id: string | null;
  batch_override_pending: boolean;
  sku: {
    product_code: string;
    description: string;
    packs_per_carton: number;
  } | null;
  suggested_batch: {
    batch_code: string;
    expiry_date: string | null;
  } | null;
};

export function PicklistDetailClient({
  picklistId,
  canPick,
  canGatePass,
  canLoadIn,
}: {
  picklistId: string;
  canPick: boolean;
  canGatePass: boolean;
  canLoadIn: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [picklist, setPicklist] = useState<Record<string, unknown> | null>(null);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [batchesBySku, setBatchesBySku] = useState<Record<string, BatchOpt[]>>(
    {},
  );
  const [gatePass, setGatePass] = useState<Record<string, unknown> | null>(null);
  const [picks, setPicks] = useState<
    Record<string, { qty: string; batchId: string; scanCode?: string }>
  >({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [securityName, setSecurityName] = useState("");
  const [loadIn, setLoadIn] = useState<
    Record<string, { good: string; bad: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/picklists/${picklistId}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to load");
      return;
    }
    setPicklist(json.picklist);
    setCustomers(json.customers ?? []);
    setLines(json.lines ?? []);
    setBatchesBySku(json.batchesBySku ?? {});
    setGatePass(json.gatePass);

    const nextPicks: Record<string, { qty: string; batchId: string }> = {};
    const nextLoad: Record<string, { good: string; bad: string }> = {};
    const nextOverrides: Record<string, string> = {};
    for (const line of json.lines as Line[]) {
      nextPicks[line.id] = {
        qty: String(line.qty_picked_units || line.qty_ordered_units || 0),
        batchId:
          line.scanned_batch_id ||
          line.suggested_batch_id ||
          json.batchesBySku?.[line.sku_id]?.[0]?.batch_id ||
          "",
      };
      nextLoad[line.id] = {
        good: String(line.qty_load_in_good_units || 0),
        bad: String(line.qty_load_in_bad_units || 0),
      };
      if (line.batch_override_pending) {
        nextOverrides[line.id] =
          line.scanned_batch_id || line.suggested_batch_id || "";
      }
    }
    setPicks(nextPicks);
    setLoadIn(nextLoad);
    setOverrides(nextOverrides);
  }, [picklistId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePicks() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/picklists/${picklistId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_picks",
        picks: Object.entries(picks).map(([line_id, v]) => ({
          line_id,
          qty_picked_units: Number(v.qty || 0),
          scanned_batch_id: v.batchId || null,
        })),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Save failed");
      return;
    }
    setMessage(json.message);
    await load();
    router.refresh();
  }

  async function issueGatePass() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/picklists/${picklistId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "issue_gate_pass",
        security_out_by_name: securityName || undefined,
        overrides: Object.entries(overrides).map(([line_id, approved_batch_id]) => ({
          line_id,
          approved_batch_id,
        })),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Gate pass failed");
      return;
    }
    setMessage(json.message);
    await load();
    router.refresh();
  }

  async function postLoadIn() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/picklists/${picklistId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "load_in",
        load_in: Object.entries(loadIn).map(([line_id, v]) => ({
          line_id,
          qty_load_in_good_units: Number(v.good || 0),
          qty_load_in_bad_units: Number(v.bad || 0),
        })),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Load-in failed");
      return;
    }
    setMessage(json.message);
    await load();
    router.refresh();
  }

  if (loading) {
    return <Card>Loading picklist…</Card>;
  }
  if (!picklist) {
    return <Card>Picklist not found.</Card>;
  }

  const loadedOut = Boolean(picklist.load_out_at);
  const loadedIn = Boolean(picklist.load_in_at);
  const overrideLines = lines.filter((l) => l.batch_override_pending);

  return (
    <div className="space-y-4">
      <Card className="grid gap-2 sm:grid-cols-2">
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">No:</span>{" "}
          <strong>{String(picklist.picklist_no)}</strong>
        </p>
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">Delivery:</span>{" "}
          <strong>{String(picklist.delivery_date)}</strong>
        </p>
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">PSR:</span>{" "}
          {(picklist.psr_route as { code?: string } | null)?.code || "—"}
        </p>
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">DA:</span>{" "}
          {(picklist.da_route as { code?: string } | null)?.code || "—"}
        </p>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-xs font-semibold uppercase">
            {String(picklist.status)}
          </span>
          {gatePass ? (
            <span className="rounded-full bg-[var(--brand-soft)] px-2 py-1 text-xs font-semibold text-[var(--brand-dark)]">
              GP {String(gatePass.gate_pass_no)}
            </span>
          ) : null}
          <a
            href={`/app/print/picklist/${picklist.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--brand)] px-2 py-1 text-xs font-semibold text-[var(--brand)]"
          >
            Print picklist
          </a>
          {gatePass?.id ? (
            <a
              href={`/app/print/gate-pass/${gatePass.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--brand)] px-2 py-1 text-xs font-semibold text-[var(--brand)]"
            >
              Print gate pass
            </a>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Customers</h2>
        <ul className="space-y-1 text-sm">
          {customers.map((c) => {
            const cust = c.customer as { code?: string; name?: string } | null;
            return (
              <li key={c.id as string}>
                {cust?.code} — {cust?.name}
                {c.invoice_no ? ` · Inv ${c.invoice_no as string}` : ""}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">
          {loadedOut ? "Lines" : "1. Pick (FEFO suggested)"}
        </h2>
        <div className="space-y-3">
          {lines.map((line) => {
            const options = batchesBySku[line.sku_id] ?? [];
            const pick = picks[line.id] ?? { qty: "0", batchId: "" };
            const suggestedId = line.suggested_batch_id;
            const isDiff =
              pick.batchId && suggestedId && pick.batchId !== suggestedId;

            return (
              <div
                key={line.id}
                className="rounded-xl border border-[var(--line)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      #{line.line_no} {line.sku?.product_code}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {line.sku?.description}
                    </p>
                    <p className="mt-1 text-xs">
                      Ordered: <strong>{line.qty_ordered_units}</strong> units
                      {line.suggested_batch ? (
                        <>
                          {" "}
                          · FEFO{" "}
                          <span className="font-mono">
                            {line.suggested_batch.batch_code}
                          </span>
                          {line.suggested_batch.expiry_date
                            ? ` (exp ${line.suggested_batch.expiry_date})`
                            : ""}
                        </>
                      ) : (
                        <span className="text-[var(--warn)]">
                          {" "}
                          · No pickable FEFO stock
                        </span>
                      )}
                    </p>
                  </div>
                  {isDiff ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-900">
                      Override → manager
                    </span>
                  ) : null}
                </div>

                {!loadedOut && canPick ? (
                  <div className="mt-3 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label>Pick qty (units)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={pick.qty}
                          onChange={(e) =>
                            setPicks((p) => ({
                              ...p,
                              [line.id]: { ...pick, qty: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Batch scanned / used</Label>
                        <select
                          className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                          value={pick.batchId}
                          onChange={(e) =>
                            setPicks((p) => ({
                              ...p,
                              [line.id]: { ...pick, batchId: e.target.value },
                            }))
                          }
                        >
                          <option value="">Select batch</option>
                          {options.map((b) => (
                            <option key={b.batch_id} value={b.batch_id}>
                              {b.batch_code} · avail {b.qty_units}
                              {b.expiry_date ? ` · exp ${b.expiry_date}` : ""}
                              {b.batch_id === suggestedId ? " · FEFO" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <ScanField
                      value={pick.scanCode ?? ""}
                      onChange={(v) =>
                        setPicks((p) => ({
                          ...p,
                          [line.id]: { ...pick, scanCode: v },
                        }))
                      }
                      placeholder="Scan batch code for this line"
                      onResolved={(result) => {
                        if (result.kind !== "batch" || !result.batch) return;
                        const batchId = String(result.batch.id);
                        const match =
                          options.find((b) => b.batch_id === batchId) ||
                          options.find(
                            (b) =>
                              b.batch_code ===
                              String(result.batch?.batch_code ?? ""),
                          );
                        if (match) {
                          setPicks((p) => ({
                            ...p,
                            [line.id]: {
                              ...pick,
                              batchId: match.batch_id,
                              scanCode: match.batch_code,
                            },
                          }));
                        }
                      }}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm">
                    Picked {line.qty_picked_units} · batch{" "}
                    <span className="font-mono">
                      {line.approved_batch_id ||
                        line.scanned_batch_id ||
                        line.suggested_batch_id ||
                        "—"}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {!loadedOut && canPick ? (
          <Button
            className="mt-4"
            size="lg"
            disabled={busy}
            onClick={() => void savePicks()}
          >
            {busy ? "Saving…" : "Save picks"}
          </Button>
        ) : null}
      </Card>

      {!loadedOut && canGatePass ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">2. Issue unique gate pass</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Manager confirms any batch overrides, then stock is deducted and a unique
            outward gate pass is created.
          </p>

          {overrideLines.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                Overrides awaiting confirmation
              </p>
              {overrideLines.map((line) => (
                <div key={line.id} className="grid gap-2 sm:grid-cols-2">
                  <p className="text-sm">
                    #{line.line_no} {line.sku?.product_code}
                  </p>
                  <select
                    className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    value={overrides[line.id] || ""}
                    onChange={(e) =>
                      setOverrides((o) => ({
                        ...o,
                        [line.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Confirm / replace batch</option>
                    {(batchesBySku[line.sku_id] ?? []).map((b) => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.batch_code} · avail {b.qty_units}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--brand)]">
              No overrides — FEFO batches will be used.
            </p>
          )}

          <div>
            <Label>Security / guard name (optional)</Label>
            <Input
              value={securityName}
              onChange={(e) => setSecurityName(e.target.value)}
              placeholder="Gate security signature name"
            />
          </div>

          <Button
            size="lg"
            disabled={busy}
            onClick={() => void issueGatePass()}
          >
            {busy ? "Issuing…" : "Issue gate pass & load out"}
          </Button>
        </Card>
      ) : null}

      {loadedOut && !loadedIn && canLoadIn ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">3. Load-in (end of route)</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Return unsold good stock and damaged stock to warehouse.
          </p>
          {lines.map((line) => {
            const li = loadIn[line.id] ?? { good: "0", bad: "0" };
            return (
              <div
                key={line.id}
                className="grid gap-2 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-3"
              >
                <div className="text-sm">
                  <p className="font-semibold">
                    #{line.line_no} {line.sku?.product_code}
                  </p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Delivered {line.qty_delivered_units || line.qty_picked_units}
                  </p>
                </div>
                <div>
                  <Label>Load-in good</Label>
                  <Input
                    type="number"
                    min="0"
                    value={li.good}
                    onChange={(e) =>
                      setLoadIn((s) => ({
                        ...s,
                        [line.id]: { ...li, good: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Load-in bad</Label>
                  <Input
                    type="number"
                    min="0"
                    value={li.bad}
                    onChange={(e) =>
                      setLoadIn((s) => ({
                        ...s,
                        [line.id]: { ...li, bad: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            );
          })}
          <Button size="lg" disabled={busy} onClick={() => void postLoadIn()}>
            {busy ? "Posting…" : "Post load-in"}
          </Button>
        </Card>
      ) : null}

      {loadedIn ? (
        <Card>
          <p className="text-sm text-[var(--brand)]">
            Load-in complete. Picklist closed.
          </p>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
