"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Input, Label } from "@/components/ui";
import { addDays } from "@/lib/grn";
import { remainingUnits } from "@/lib/po";

type OpenPo = {
  id: string;
  po_no: string;
  status: string;
  order_date: string;
  supplier: { id?: string; code?: string; name?: string } | null;
};

type PoLine = {
  id: string;
  line_no: number;
  sku_id: string;
  uom: string;
  qty_ordered: number;
  qty_ordered_units: number;
  qty_received_units: number;
  unit_price: number;
  sku: {
    id: string;
    product_code: string;
    description: string;
    packs_per_carton: number;
    default_shelf_life_days: number | null;
  } | null;
};

type DraftLine = {
  po_line_id: string;
  sku_id: string;
  product_code: string;
  description: string;
  packs_per_carton: number;
  default_shelf_life_days: number | null;
  remaining_units: number;
  unit_price: number;
  batch_code: string;
  mfg_date: string;
  expiry_date: string;
  qty_units: string;
  shortage_units: string;
  damage_units: string;
  include: boolean;
};

export function GrnCreateForm({
  openPos,
  initialPoId,
  initialLines,
}: {
  openPos: OpenPo[];
  initialPoId?: string;
  initialLines?: PoLine[];
}) {
  const router = useRouter();
  const [poId, setPoId] = useState(initialPoId ?? openPos[0]?.id ?? "");
  const [deliveryNo, setDeliveryNo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
  );
  const [truckNo, setTruckNo] = useState("");
  const [transporter, setTransporter] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    toDraftLines(initialLines ?? []),
  );
  const [loadingPo, setLoadingPo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedPo = useMemo(
    () => openPos.find((p) => p.id === poId) ?? null,
    [openPos, poId],
  );

  async function loadPo(nextId: string) {
    setPoId(nextId);
    if (!nextId) {
      setLines([]);
      return;
    }
    setLoadingPo(true);
    setError(null);
    const res = await fetch(`/api/po/${nextId}`);
    const json = await res.json();
    setLoadingPo(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to load PO");
      setLines([]);
      return;
    }
    setLines(toDraftLines(json.lines ?? []));
  }

  function updateLine(poLineId: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.po_line_id !== poLineId) return l;
        const next = { ...l, ...patch };
        if (patch.mfg_date && l.default_shelf_life_days && !next.expiry_date) {
          next.expiry_date = addDays(patch.mfg_date, l.default_shelf_life_days);
        }
        return next;
      }),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!poId) {
      setError("Select a purchase order");
      return;
    }
    setLoading(true);
    setError(null);

    const payloadLines = lines
      .filter((l) => l.include && Number(l.qty_units) > 0)
      .map((l) => ({
        sku_id: l.sku_id,
        po_line_id: l.po_line_id,
        batch_code: l.batch_code.trim(),
        mfg_date: l.mfg_date || null,
        expiry_date: l.expiry_date || null,
        qty_cases: 0,
        qty_units: Number(l.qty_units || 0),
        shortage_units: Number(l.shortage_units || 0),
        damage_units: Number(l.damage_units || 0),
        purchase_price_pack: l.unit_price,
      }));

    if (!payloadLines.length) {
      setLoading(false);
      setError("Include at least one line with quantity");
      return;
    }

    for (const l of payloadLines) {
      if (!l.batch_code) {
        setLoading(false);
        setError("Batch code required on all included lines");
        return;
      }
    }

    const res = await fetch("/api/grn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        po_id: poId,
        supplier_delivery_no: deliveryNo,
        delivery_date: deliveryDate,
        truck_no: truckNo,
        transporter_name: transporter,
        remarks,
        lines: payloadLines,
      }),
    });
    const json = (await res.json()) as { grn?: { id: string }; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to create GRN");
      return;
    }
    router.push(`/app/grn/${json.grn!.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Purchase order</Label>
          <select
            className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={poId}
            onChange={(e) => void loadPo(e.target.value)}
            required
          >
            <option value="">Select open PO…</option>
            {openPos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.po_no} — {p.supplier?.name ?? "Supplier"} ({p.status})
              </option>
            ))}
          </select>
          {selectedPo ? (
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Supplier: {selectedPo.supplier?.code ? `${selectedPo.supplier.code} — ` : ""}
              {selectedPo.supplier?.name} · Ordered {selectedPo.order_date}
            </p>
          ) : null}
        </div>
        <div>
          <Label>Supplier DN</Label>
          <Input value={deliveryNo} onChange={(e) => setDeliveryNo(e.target.value)} />
        </div>
        <div>
          <Label>Delivery date</Label>
          <Input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Truck no</Label>
          <Input value={truckNo} onChange={(e) => setTruckNo(e.target.value)} />
        </div>
        <div>
          <Label>Transporter</Label>
          <Input value={transporter} onChange={(e) => setTransporter(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Remarks</Label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">QC lines (from PO remaining)</h2>
        {loadingPo ? (
          <p className="text-sm text-[var(--ink-muted)]">Loading PO lines…</p>
        ) : null}
        {!loadingPo && lines.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">
            Select a pending/partial PO with remaining quantity.
          </p>
        ) : null}
        {lines.map((line) => (
          <div
            key={line.po_line_id}
            className="grid gap-2 rounded-md border border-[var(--line)] p-3 sm:grid-cols-6"
          >
            <div className="sm:col-span-6 flex items-start justify-between gap-2">
              <div className="text-sm">
                <strong>{line.product_code}</strong> — {line.description}
                <div className="text-xs text-[var(--ink-muted)]">
                  Remaining {line.remaining_units} units · Price {line.unit_price}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={line.include}
                  onChange={(e) =>
                    updateLine(line.po_line_id, { include: e.target.checked })
                  }
                />
                Include
              </label>
            </div>
            {line.include ? (
              <>
                <div>
                  <Label>Receive qty (units)</Label>
                  <Input
                    type="number"
                    min="0.001"
                    max={line.remaining_units}
                    step="0.001"
                    value={line.qty_units}
                    onChange={(e) =>
                      updateLine(line.po_line_id, { qty_units: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label>Batch</Label>
                  <Input
                    value={line.batch_code}
                    onChange={(e) =>
                      updateLine(line.po_line_id, { batch_code: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label>Mfg</Label>
                  <Input
                    type="date"
                    value={line.mfg_date}
                    onChange={(e) =>
                      updateLine(line.po_line_id, { mfg_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Expiry</Label>
                  <Input
                    type="date"
                    value={line.expiry_date}
                    onChange={(e) =>
                      updateLine(line.po_line_id, { expiry_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Shortage</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.shortage_units}
                    onChange={(e) =>
                      updateLine(line.po_line_id, { shortage_units: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Damage</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.damage_units}
                    onChange={(e) =>
                      updateLine(line.po_line_id, { damage_units: e.target.value })
                    }
                  />
                </div>
              </>
            ) : null}
          </div>
        ))}
      </Card>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <Button type="submit" size="lg" disabled={loading || !poId || lines.length === 0}>
        {loading ? "Creating…" : "Create GRN draft"}
      </Button>
    </form>
  );
}

function toDraftLines(poLines: PoLine[]): DraftLine[] {
  return poLines
    .map((l) => {
      const rem = remainingUnits(l);
      if (rem <= 0) return null;
      return {
        po_line_id: l.id,
        sku_id: l.sku_id,
        product_code: l.sku?.product_code ?? "",
        description: l.sku?.description ?? "",
        packs_per_carton: l.sku?.packs_per_carton ?? 1,
        default_shelf_life_days: l.sku?.default_shelf_life_days ?? null,
        remaining_units: rem,
        unit_price: Number(l.unit_price ?? 0),
        batch_code: "",
        mfg_date: "",
        expiry_date: "",
        qty_units: String(rem),
        shortage_units: "0",
        damage_units: "0",
        include: true,
      } satisfies DraftLine;
    })
    .filter(Boolean) as DraftLine[];
}
