"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button, Card, Input, Label } from "@/components/ui";
import type { PoUom } from "@/lib/po";

type Supplier = { id: string; code: string | null; name: string };
type Warehouse = { id: string; code: string; name: string };
type Sku = {
  id: string;
  product_code: string;
  description: string;
  barcode: string | null;
  packs_per_carton: number;
  purchase_price_pack: number | null;
};

type DraftLine = {
  key: string;
  sku_id: string;
  uom: PoUom;
  qty_ordered: string;
  unit_price: string;
};

function emptyLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    sku_id: "",
    uom: "pack",
    qty_ordered: "1",
    unit_price: "",
  };
}

export function PoCreateForm({
  suppliers,
  warehouses,
  skus,
}: {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  skus: Sku[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(
    warehouses.find((w) => w.code === "MAIN_WHS")?.id ?? warehouses[0]?.id ?? "",
  );
  const [orderDate, setOrderDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
  );
  const [expectedDate, setExpectedDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [skuQuery, setSkuQuery] = useState("");

  const filtered = useMemo(() => {
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
  }, [skus, skuQuery]);

  const selectedLines = lines.filter((l) => l.sku_id);

  function addSku(skuId: string) {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku) return;
    if (lines.some((l) => l.sku_id === skuId)) {
      setSkuQuery("");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        ...emptyLine(),
        sku_id: skuId,
        unit_price: String(sku.purchase_price_pack ?? 0),
      },
    ]);
    setSkuQuery("");
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payloadLines = selectedLines.map((l) => ({
      sku_id: l.sku_id,
      uom: l.uom,
      qty_ordered: Number(l.qty_ordered || 0),
      unit_price: Number(l.unit_price || 0),
    }));

    if (!payloadLines.length) {
      setLoading(false);
      setError("Add at least one SKU");
      return;
    }

    const res = await fetch("/api/po", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier_id: supplierId,
        warehouse_id: warehouseId || undefined,
        order_date: orderDate,
        expected_date: expectedDate || null,
        remarks: remarks || null,
        lines: payloadLines,
      }),
    });
    const json = (await res.json()) as { po?: { id: string }; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to create PO");
      return;
    }
    router.push("/app/po");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Supplier</Label>
          <select
            className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code ? `${s.code} — ` : ""}
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Warehouse</Label>
          <select
            className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Order date</Label>
          <Input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Expected date</Label>
          <Input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Remarks</Label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </Card>

      <Card className="space-y-3">
        {skus.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">
            No SKUs yet. Create them under{" "}
            <a href="/app/masters" className="font-semibold text-[var(--brand)]">
              Masters → SKUs
            </a>
            .
          </p>
        ) : (
          <>
            <div>
              <Label>Search & add SKU</Label>
              <Input
                placeholder="Search product code / description / barcode…"
                value={skuQuery}
                onChange={(e) => setSkuQuery(e.target.value)}
              />
              {skuQuery.trim() ? (
                <div className="mt-1 max-h-48 overflow-auto rounded-md border border-[var(--line)]">
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                      onClick={() => addSku(s.id)}
                    >
                      <strong>{s.product_code}</strong> — {s.description}
                      {s.barcode ? (
                        <span className="ml-2 font-mono text-xs text-[var(--ink-muted)]">
                          {s.barcode}
                        </span>
                      ) : null}
                    </button>
                  ))}
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-[var(--ink-muted)]">No matches</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {selectedLines.map((line) => {
              const sku = skus.find((s) => s.id === line.sku_id);
              return (
                <div
                  key={line.key}
                  className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--line)] p-3"
                >
                  <div className="min-w-[7rem] w-28">
                    <Label>Code</Label>
                    <p className="truncate py-2 text-sm font-semibold">{sku?.product_code}</p>
                  </div>
                  <div className="min-w-[10rem] flex-1">
                    <Label>Name</Label>
                    <p className="truncate py-2 text-sm text-[var(--ink-muted)]">
                      {sku?.description}
                    </p>
                  </div>
                  <div className="w-24">
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.qty_ordered}
                      onChange={(e) =>
                        updateLine(line.key, { qty_ordered: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="w-28">
                    <Label>UOM</Label>
                    <select
                      className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                      value={line.uom}
                      onChange={(e) =>
                        updateLine(line.key, { uom: e.target.value as PoUom })
                      }
                    >
                      <option value="pcs">Pcs</option>
                      <option value="pack">Pack</option>
                      <option value="carton">Carton</option>
                    </select>
                  </div>
                  <div className="w-28">
                    <Label>Unit price</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={line.unit_price}
                      onChange={(e) =>
                        updateLine(line.key, { unit_price: e.target.value })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Remove line"
                    title="Remove"
                    className="mb-0.5 rounded-md p-2 text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                    onClick={() =>
                      setLines((prev) => prev.filter((l) => l.key !== line.key))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <Button type="submit" size="lg" disabled={loading || selectedLines.length === 0}>
        {loading ? "Creating…" : "Create purchase order"}
      </Button>
    </form>
  );
}
