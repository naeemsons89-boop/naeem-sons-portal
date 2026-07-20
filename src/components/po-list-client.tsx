"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  SegmentedControl,
  statusTone,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { remainingUnits } from "@/lib/po";

type PoListRow = {
  id: string;
  po_no: string;
  order_date: string;
  status: string;
  line_count: number;
  total_amount: number;
  supplier: { id?: string; code?: string; name?: string } | null;
  warehouse: { code?: string; name?: string } | null;
};

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

type PoDetail = {
  id: string;
  po_no: string;
  order_date: string;
  expected_date: string | null;
  status: string;
  remarks: string | null;
  supplier: {
    code?: string;
    name?: string;
    phone?: string;
    address?: string;
  } | null;
  warehouse: { code?: string; name?: string } | null;
};

export function PoListClient({ canCreate }: { canCreate: boolean }) {
  const [tab, setTab] = useState<"pending" | "received">("pending");
  const [rows, setRows] = useState<PoListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [lines, setLines] = useState<PoLine[]>([]);
  const [locked, setLocked] = useState(false);
  const [total, setTotal] = useState(0);
  const [detailError, setDetailError] = useState<string | null>(null);

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
    setRows(json.pos ?? []);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPo(id: string) {
    setOpenId(id);
    setDetail(null);
    setLines([]);
    setDetailError(null);
    const res = await fetch(`/api/po/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setDetailError(json.error ?? "Failed to load PO");
      return;
    }
    setDetail(json.po);
    setLines(json.lines ?? []);
    setLocked(Boolean(json.locked));
    setTotal(Number(json.total_amount ?? 0));
  }

  function closeModal() {
    setOpenId(null);
    setDetail(null);
    setLines([]);
  }

  const hasRemaining =
    detail &&
    (detail.status === "pending" || detail.status === "partial") &&
    lines.some((l) => remainingUnits(l) > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={tab}
          onChange={setTab}
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

      <div className="space-y-3">
        {rows.map((po) => (
          <button
            key={po.id}
            type="button"
            className="block w-full text-left"
            onClick={() => void openPo(po.id)}
          >
            <Card className="transition hover:border-[var(--brand)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{po.po_no}</p>
                  <p className="text-sm text-[var(--ink-muted)]">
                    {po.supplier?.name ?? "Supplier"} · {po.order_date} ·{" "}
                    {po.line_count} line{po.line_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(po.status)}>{po.status}</Badge>
                  <span className="text-sm font-medium">
                    {Number(po.total_amount).toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>
          </button>
        ))}
        {!loading && rows.length === 0 ? (
          <EmptyState>
            No {tab} purchase orders.
            {canCreate ? " Create one to start receiving stock." : null}
          </EmptyState>
        ) : null}
      </div>

      {openId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-[var(--surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailError ? (
              <p className="text-sm text-[var(--danger)]">{detailError}</p>
            ) : !detail ? (
              <p className="text-sm text-[var(--ink-muted)]">Loading PO…</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                      Purchase Order
                    </p>
                    <h2 className="text-xl font-semibold">{detail.po_no}</h2>
                    <p className="text-sm text-[var(--ink-muted)]">
                      {detail.order_date}
                      {detail.expected_date ? ` · Expected ${detail.expected_date}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>
                    {locked ? <Badge tone="warning">Locked</Badge> : null}
                    <button
                      type="button"
                      className="text-sm text-[var(--ink-muted)]"
                      onClick={closeModal}
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-[var(--ink-muted)]">Supplier:</span>{" "}
                    <strong>
                      {detail.supplier?.code ? `${detail.supplier.code} — ` : ""}
                      {detail.supplier?.name}
                    </strong>
                  </p>
                  <p>
                    <span className="text-[var(--ink-muted)]">Warehouse:</span>{" "}
                    <strong>
                      {detail.warehouse?.code} — {detail.warehouse?.name}
                    </strong>
                  </p>
                  {detail.supplier?.phone ? (
                    <p>
                      <span className="text-[var(--ink-muted)]">Phone:</span>{" "}
                      {detail.supplier.phone}
                    </p>
                  ) : null}
                  {detail.supplier?.address ? (
                    <p className="sm:col-span-2">
                      <span className="text-[var(--ink-muted)]">Address:</span>{" "}
                      {detail.supplier.address}
                    </p>
                  ) : null}
                  {detail.remarks ? (
                    <p className="sm:col-span-2">
                      <span className="text-[var(--ink-muted)]">Remarks:</span>{" "}
                      {detail.remarks}
                    </p>
                  ) : null}
                </div>

                <Table>
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>SKU</Th>
                      <Th>Qty</Th>
                      <Th>UOM</Th>
                      <Th>Received</Th>
                      <Th>Price</Th>
                      <Th>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <Td>{line.line_no}</Td>
                        <Td>
                          <div className="font-medium">{line.sku?.product_code}</div>
                          <div className="text-xs text-[var(--ink-muted)]">
                            {line.sku?.description}
                          </div>
                        </Td>
                        <Td>{line.qty_ordered}</Td>
                        <Td className="uppercase">{line.uom}</Td>
                        <Td>
                          {Number(line.qty_received_units)} /{" "}
                          {Number(line.qty_ordered_units)} u
                        </Td>
                        <Td>{Number(line.unit_price).toFixed(2)}</Td>
                        <Td>{Number(line.line_amount).toFixed(2)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
                  <p className="text-sm">
                    Total: <strong>{total.toFixed(2)}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/app/print/po/${detail.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button type="button" variant="secondary" size="sm">
                        Download PDF
                      </Button>
                    </a>
                    {hasRemaining ? (
                      <Link href={`/app/grn/new?po_id=${detail.id}`}>
                        <Button type="button" size="sm">
                          Create GRN
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
