"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ScanField } from "@/components/barcode-scanner";
import { Button, Card, Input, Label } from "@/components/ui";
import { addDays } from "@/lib/grn";

type Supplier = { id: string; code: string | null; name: string };
type Sku = {
  id: string;
  product_code: string;
  description: string;
  barcode: string | null;
  packs_per_carton: number;
  purchase_price_pack: number | null;
  purchase_price_ctn: number | null;
  default_shelf_life_days: number | null;
};

type DraftLine = {
  key: string;
  sku_id: string;
  batch_code: string;
  mfg_date: string;
  expiry_date: string;
  qty_cases: string;
  qty_units: string;
  shortage_units: string;
  damage_units: string;
};

function emptyLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    sku_id: "",
    batch_code: "",
    mfg_date: "",
    expiry_date: "",
    qty_cases: "1",
    qty_units: "0",
    shortage_units: "0",
    damage_units: "0",
  };
}

export function GrnCreateForm({
  suppliers,
  skus,
}: {
  suppliers: Supplier[];
  skus: Sku[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [deliveryNo, setDeliveryNo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
  );
  const [truckNo, setTruckNo] = useState("");
  const [transporter, setTransporter] = useState("");
  const [remarks, setRemarks] = useState("");
  const [skuQuery, setSkuQuery] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredSkus = useMemo(() => {
    const q = skuQuery.trim().toLowerCase();
    if (!q) return skus.slice(0, 40);
    return skus
      .filter(
        (s) =>
          s.product_code.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.barcode ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [skuQuery, skus]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.sku_id || patch.mfg_date) {
          const sku = skus.find((s) => s.id === (patch.sku_id ?? next.sku_id));
          if (sku?.default_shelf_life_days && (patch.mfg_date ?? next.mfg_date)) {
            const mfg = patch.mfg_date ?? next.mfg_date;
            if (mfg && !next.expiry_date) {
              next.expiry_date = addDays(mfg, sku.default_shelf_life_days);
            }
          }
        }
        return next;
      }),
    );
  }

  function addSkuLine(skuId: string) {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku) return;
    setLines((prev) => [
      ...prev.filter((l) => l.sku_id || l.batch_code),
      {
        ...emptyLine(),
        sku_id: sku.id,
        qty_cases: "1",
      },
    ]);
    setSkuQuery("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payloadLines = lines
      .filter((l) => l.sku_id && l.batch_code)
      .map((l) => ({
        sku_id: l.sku_id,
        batch_code: l.batch_code.trim(),
        mfg_date: l.mfg_date || null,
        expiry_date: l.expiry_date || null,
        qty_cases: Number(l.qty_cases || 0),
        qty_units: Number(l.qty_units || 0),
        shortage_units: Number(l.shortage_units || 0),
        damage_units: Number(l.damage_units || 0),
      }));

    const res = await fetch("/api/grn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier_id: supplierId || null,
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
        <div>
          <Label>Supplier</Label>
          <select
            className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Select supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Supplier delivery no</Label>
          <Input
            value={deliveryNo}
            onChange={(e) => setDeliveryNo(e.target.value)}
            placeholder="e.g. 4022210526"
            required
          />
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
        <div className="sm:col-span-2">
          <Label>Transporter</Label>
          <Input
            value={transporter}
            onChange={(e) => setTransporter(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Remarks</Label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Label>Add SKU (camera / Bluetooth / type)</Label>
        <div className="mb-2">
          <ScanField
            value={skuQuery}
            onChange={setSkuQuery}
            onResolved={(result) => {
              if (result.kind === "sku" && result.sku?.id) {
                addSkuLine(String(result.sku.id));
                setSkuQuery("");
                return;
              }
              if (result.kind === "batch") {
                const sku = result.batch?.sku as { id?: string } | undefined;
                if (sku?.id) {
                  addSkuLine(String(sku.id));
                  setSkuQuery("");
                }
              }
            }}
            placeholder="Scan barcode or type product code"
          />
        </div>
        {skuQuery ? (
          <div className="mb-4 max-h-40 overflow-auto rounded-lg border border-[var(--line)]">
            {filteredSkus.map((s) => (
              <button
                key={s.id}
                type="button"
                className="block w-full border-b border-[var(--line)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                onClick={() => addSkuLine(s.id)}
              >
                <span className="font-semibold">{s.product_code}</span> — {s.description}
              </button>
            ))}
            {filteredSkus.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--ink-muted)]">
                No SKU found. Import price list first.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4">
          {lines.map((line, idx) => {
            const sku = skus.find((s) => s.id === line.sku_id);
            return (
              <div
                key={line.key}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    Line {idx + 1}
                    {sku ? `: ${sku.product_code}` : ""}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--danger)]"
                    onClick={() =>
                      setLines((prev) =>
                        prev.length === 1
                          ? [emptyLine()]
                          : prev.filter((l) => l.key !== line.key),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
                {sku ? (
                  <p className="mb-2 text-xs text-[var(--ink-muted)]">
                    {sku.description} · {sku.packs_per_carton} packs/ctn
                  </p>
                ) : (
                  <p className="mb-2 text-xs text-[var(--warn)]">
                    Select a SKU from search above
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <Label>Batch code</Label>
                    <Input
                      value={line.batch_code}
                      onChange={(e) =>
                        updateLine(line.key, { batch_code: e.target.value })
                      }
                      placeholder="260710S000"
                      required={Boolean(line.sku_id)}
                    />
                  </div>
                  <div>
                    <Label>Mfg date</Label>
                    <Input
                      type="date"
                      value={line.mfg_date}
                      onChange={(e) =>
                        updateLine(line.key, { mfg_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Expiry</Label>
                    <Input
                      type="date"
                      value={line.expiry_date}
                      onChange={(e) =>
                        updateLine(line.key, { expiry_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Cases</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={line.qty_cases}
                      onChange={(e) =>
                        updateLine(line.key, { qty_cases: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Loose units</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={line.qty_units}
                      onChange={(e) =>
                        updateLine(line.key, { qty_units: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Shortage units</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={line.shortage_units}
                      onChange={(e) =>
                        updateLine(line.key, { shortage_units: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Damage units</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={line.damage_units}
                      onChange={(e) =>
                        updateLine(line.key, { damage_units: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
        >
          Add blank line
        </Button>
      </Card>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <Button type="submit" size="lg" disabled={loading || skus.length === 0}>
        {loading ? "Saving…" : "Save draft GRN"}
      </Button>
      {skus.length === 0 ? (
        <p className="text-sm text-[var(--warn)]">
          Import SKUs from CSV Import before creating a GRN.
        </p>
      ) : null}
    </form>
  );
}
