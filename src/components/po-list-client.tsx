"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  EmptyState,
  ListPanel,
  SegmentedControl,
  statusTone,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { remainingUnits } from "@/lib/po";

type PoLine = {
  id: string;
  line_no: number;
  uom: string;
  qty_ordered: number;
  qty_ordered_units: number;
  qty_received_units: number;
  unit_price: number;
  line_amount: number;
  sku: {
    product_code?: string;
    description?: string;
  } | null;
};

type PoListRow = {
  id: string;
  po_no: string;
  order_date: string;
  status: string;
  remarks: string | null;
  line_count: number;
  total_amount: number;
  qty_by_uom: Record<string, number>;
  lines: PoLine[];
  supplier: { id?: string; code?: string; name?: string } | null;
  warehouse: { code?: string; name?: string } | null;
};

function formatRs(amount: number) {
  return `Rs ${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function uomLabel(uom: string, qty: number) {
  const key = uom.toLowerCase();
  if (key === "carton" || key === "cartons") {
    return qty === 1 ? "carton" : "cartons";
  }
  if (key === "pack" || key === "packs") {
    return qty === 1 ? "pack" : "packs";
  }
  if (key === "pcs" || key === "pc" || key === "piece" || key === "pieces") {
    return qty === 1 ? "pc" : "pcs";
  }
  return key;
}

function formatQtyByUom(qtyByUom: Record<string, number> | undefined) {
  const entries = Object.entries(qtyByUom ?? {}).filter(([, q]) => Number(q) > 0);
  if (!entries.length) return "0 packs";
  return entries
    .map(([uom, qty]) => {
      const n = Number(qty);
      return `${n} ${uomLabel(uom, n)}`;
    })
    .join(" · ");
}

export function PoListClient({
  canCreate,
  initialPoId,
}: {
  canCreate: boolean;
  initialPoId?: string;
}) {
  const [tab, setTab] = useState<"pending" | "received">("pending");
  const [rows, setRows] = useState<PoListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialPoId ?? null);
  const [highlightId, setHighlightId] = useState<string | null>(initialPoId ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/po?tab=${tab}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to load POs");
      return;
    }
    const list = (json.pos ?? []) as PoListRow[];
    setRows(list);

    if (highlightId) {
      const inTab = list.some((p) => p.id === highlightId);
      if (inTab) {
        setExpandedId(highlightId);
      } else if (tab === "pending") {
        setTab("received");
      } else {
        setExpandedId(null);
      }
    } else {
      setExpandedId(null);
    }
  }, [tab, highlightId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    if (highlightId) setHighlightId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          value={tab}
          onChange={(value) => {
            setTab(value);
            if (highlightId) setHighlightId(null);
          }}
          options={[
            { value: "pending", label: "Pending" },
            { value: "received", label: "Received" },
          ]}
        />
        {canCreate ? (
          <Link href="/app/po/new">
            <Button>New PO</Button>
          </Link>
        ) : null}
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {loading ? <p className="text-sm text-[var(--ink-muted)]">Loading…</p> : null}

      {!loading && rows.length === 0 ? (
        <EmptyState>
          No {tab} purchase orders.
          {canCreate ? " Create one to start receiving stock." : null}
        </EmptyState>
      ) : (
        <ListPanel>
          {rows.map((po) => {
            const open = expandedId === po.id;
            const hasRemaining =
              (po.status === "pending" || po.status === "partial") &&
              (po.lines ?? []).some((l) => remainingUnits(l) > 0);

            return (
              <div key={po.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[var(--surface-2)]/80 sm:px-3.5 ${
                    open ? "bg-[var(--brand-soft)]/30" : ""
                  }`}
                  onClick={() => toggleExpand(po.id)}
                  aria-expanded={open}
                >
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs text-[var(--ink-muted)] transition ${
                      open ? "rotate-90" : ""
                    }`}
                    aria-hidden
                  >
                    ▸
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{po.po_no}</div>
                    <div className="truncate text-xs text-[var(--ink-muted)] sm:text-sm">
                      {po.supplier?.name ?? "Supplier"} · {po.order_date} ·{" "}
                      {po.line_count} line{po.line_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Badge tone={statusTone(po.status)}>{po.status}</Badge>
                    <span className="hidden text-xs tabular-nums text-[var(--ink-muted)] sm:inline">
                      {formatQtyByUom(po.qty_by_uom)}
                    </span>
                    <span className="text-sm font-medium tabular-nums">
                      {formatRs(po.total_amount)}
                    </span>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2 sm:px-3.5">
                    {(po.lines ?? []).length === 0 ? (
                      <p className="text-sm text-[var(--ink-muted)]">No lines on this PO.</p>
                    ) : (
                      <Table>
                        <thead>
                          <tr>
                            <Th>#</Th>
                            <Th>Product</Th>
                            <Th>Qty</Th>
                            <Th>Received</Th>
                            <Th>Price</Th>
                            <Th>Amount</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {(po.lines ?? []).map((line) => {
                            const qty = Number(line.qty_ordered);
                            return (
                              <tr key={line.id}>
                                <Td>{line.line_no}</Td>
                                <Td>
                                  <div className="font-medium">
                                    {line.sku?.product_code}
                                  </div>
                                  <div className="text-xs text-[var(--ink-muted)]">
                                    {line.sku?.description}
                                  </div>
                                </Td>
                                <Td>
                                  {qty} {uomLabel(line.uom, qty)}
                                </Td>
                                <Td>
                                  {Number(line.qty_received_units)} /{" "}
                                  {Number(line.qty_ordered_units)} packs
                                </Td>
                                <Td className="tabular-nums">
                                  {formatRs(line.unit_price)}
                                </Td>
                                <Td className="tabular-nums">
                                  {formatRs(line.line_amount)}
                                </Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    )}

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2">
                      <div className="text-sm">
                        <span className="text-[var(--ink-muted)]">Total qty:</span>{" "}
                        <span className="font-medium">{formatQtyByUom(po.qty_by_uom)}</span>
                        <span className="mx-2 text-[var(--line)]">|</span>
                        <span className="text-[var(--ink-muted)]">Amount:</span>{" "}
                        <span className="font-medium">{formatRs(po.total_amount)}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`/app/print/po/${po.id}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button type="button" variant="secondary" size="sm">
                            Download PDF
                          </Button>
                        </a>
                        {hasRemaining ? (
                          <Link
                            href={`/app/grn/new?po_id=${po.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button type="button" size="sm">
                              Create GRN
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </ListPanel>
      )}
    </div>
  );
}
