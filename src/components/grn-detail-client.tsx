"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, Input, Label, Table, Td, Th } from "@/components/ui";

type Props = {
  grn: Record<string, unknown>;
  lines: Record<string, unknown>[];
  canPhysical: boolean;
  canFinance: boolean;
};

export function GrnDetailClient({ grn, lines, canPhysical, canFinance }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [invoiceNo, setInvoiceNo] = useState(
    (grn.supplier_invoice_no as string) || "",
  );
  const [invoiceDate, setInvoiceDate] = useState(
    (grn.supplier_invoice_date as string) ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
  );
  const [tax, setTax] = useState(String(grn.invoice_tax_amount ?? 0));
  const [discount, setDiscount] = useState(
    String(grn.invoice_discount_amount ?? 0),
  );
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const line of lines) {
      init[line.id as string] = String(line.purchase_price_pack ?? "");
    }
    return init;
  });

  const physicalDone = Boolean(grn.physical_posted_at);
  const financeDone = grn.finance_status === "posted";
  const supplier = grn.supplier as { name?: string } | null;
  const warehouse = grn.warehouse as { code?: string; name?: string } | null;
  const po = grn.po as { id?: string; po_no?: string; status?: string } | null;

  const lineTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const price = Number(prices[line.id as string] || 0);
      return sum + price * Number(line.qty_units || 0);
    }, 0);
  }, [lines, prices]);

  async function postPhysical() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/grn/${grn.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "physical" }),
    });
    const json = (await res.json()) as { message?: string; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Physical post failed");
      return;
    }
    setMessage(json.message ?? "Posted");
    router.refresh();
  }

  async function postFinance() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/grn/${grn.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "finance",
        finance: {
          supplier_invoice_no: invoiceNo,
          supplier_invoice_date: invoiceDate,
          invoice_tax_amount: Number(tax || 0),
          invoice_discount_amount: Number(discount || 0),
          invoice_total_amount: lineTotal + Number(tax || 0) - Number(discount || 0),
          lines: lines.map((line) => ({
            id: line.id as string,
            purchase_price_pack: Number(prices[line.id as string]),
            purchase_price_ctn: (line.purchase_price_ctn as number) ?? null,
          })),
        },
      }),
    });
    const json = (await res.json()) as { message?: string; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Finance post failed");
      return;
    }
    setMessage(json.message ?? "Posted");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="grid gap-2 sm:grid-cols-2">
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">PO:</span>{" "}
          <strong>{po?.po_no ?? "—"}</strong>
          {po?.status ? (
            <span className="ml-2 text-xs text-[var(--ink-muted)]">({po.status})</span>
          ) : null}
        </p>
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">Supplier:</span>{" "}
          <strong>{supplier?.name ?? "—"}</strong>
        </p>
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">Warehouse:</span>{" "}
          <strong>
            {warehouse?.code} — {warehouse?.name}
          </strong>
        </p>
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">Truck:</span>{" "}
          {(grn.truck_no as string) || "—"}
        </p>
        <p className="text-sm">
          <span className="text-[var(--ink-muted)]">Transporter:</span>{" "}
          {(grn.transporter_name as string) || "—"}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Badge tone={physicalDone ? "success" : "pending"}>
            {physicalDone ? "Physical posted" : "Awaiting physical"}
          </Badge>
          <Badge tone={financeDone ? "success" : "warning"}>
            Finance {String(grn.finance_status)}
          </Badge>
          <a
            href={`/app/print/grn/${grn.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--brand)] px-2 py-1 text-xs font-semibold text-[var(--brand)]"
          >
            Print PDF
          </a>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Lines</h2>
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>SKU</Th>
              <Th>Batch</Th>
              <Th>Mfg / Exp</Th>
              <Th>Units</Th>
              <Th>Short / Dmg</Th>
              <Th>Purchase / pack</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const sku = line.sku as {
                product_code?: string;
                description?: string;
              } | null;
              return (
                <tr key={line.id as string}>
                  <Td>{line.line_no as number}</Td>
                  <Td>
                    <div className="font-medium">{sku?.product_code}</div>
                    <div className="text-xs text-[var(--ink-muted)]">
                      {sku?.description}
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">{line.batch_code as string}</Td>
                  <Td className="text-xs">
                    {(line.mfg_date as string) || "—"}
                    <br />
                    {(line.expiry_date as string) || "—"}
                  </Td>
                  <Td>{line.qty_units as number}</Td>
                  <Td>
                    {line.shortage_units as number} / {line.damage_units as number}
                  </Td>
                  <Td>
                    {canFinance && physicalDone && !financeDone ? (
                      <Input
                        type="number"
                        step="0.0001"
                        className="w-28"
                        value={prices[line.id as string] ?? ""}
                        onChange={(e) =>
                          setPrices((p) => ({
                            ...p,
                            [line.id as string]: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      String(line.purchase_price_pack ?? "—")
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {!physicalDone && canPhysical ? (
        <Card>
          <h2 className="font-semibold">1. QC &amp; receive</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Confirm shortage/damage QC, then receive into warehouse as{" "}
            <strong>finance pending</strong> (not pickable yet). This locks the linked PO.
          </p>
          <Button
            className="mt-3"
            size="lg"
            disabled={loading}
            onClick={() => void postPhysical()}
          >
            {loading ? "Posting…" : "QC & Receive"}
          </Button>
        </Card>
      ) : null}

      {physicalDone && !financeDone && canFinance ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">2. Post finance (unlock picking)</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Enter supplier invoice details. Prices default from price list — edit if
            invoice differs.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Supplier invoice no</Label>
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Invoice date</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Tax amount</Label>
              <Input
                type="number"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </div>
            <div>
              <Label>Discount amount</Label>
              <Input
                type="number"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>
          <p className="text-sm">
            Estimated total:{" "}
            <strong>
              {(lineTotal + Number(tax || 0) - Number(discount || 0)).toFixed(2)}
            </strong>
          </p>
          <Button
            size="lg"
            disabled={loading}
            onClick={() => void postFinance()}
          >
            {loading ? "Posting…" : "Post finance & unlock stock"}
          </Button>
        </Card>
      ) : null}

      {physicalDone && !canFinance && !financeDone ? (
        <Card>
          <p className="text-sm text-[var(--ink-muted)]">
            Physical receive is done. Waiting for Admin / Manager to post finance.
          </p>
        </Card>
      ) : null}

      {financeDone ? (
        <Card>
          <p className="text-sm text-[var(--brand)]">
            Finance posted. These batches are pickable for dispatch.
          </p>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
