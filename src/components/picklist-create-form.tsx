"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Input, Label } from "@/components/ui";

type Customer = { id: string; code: string; name: string };
type Sku = {
  id: string;
  product_code: string;
  description: string;
  packs_per_carton: number;
  barcode: string | null;
  sale_price_pack: number | null;
};

type LineDraft = {
  key: string;
  sku_id: string;
  qty_cases: string;
  qty_units: string;
  sale_price: string;
};
type CustomerDraft = {
  key: string;
  mode: "existing" | "new";
  customer_id: string;
  customer_code: string;
  customer_name: string;
  lines: LineDraft[];
};

function emptyLine(salePrice = ""): LineDraft {
  return {
    key: crypto.randomUUID(),
    sku_id: "",
    qty_cases: "1",
    qty_units: "0",
    sale_price: salePrice,
  };
}

function emptyCustomer(): CustomerDraft {
  return {
    key: crypto.randomUUID(),
    mode: "new",
    customer_id: "",
    customer_code: "",
    customer_name: "",
    lines: [emptyLine()],
  };
}

export function PicklistCreateForm({
  customers,
  skus,
}: {
  customers: Customer[];
  skus: Sku[];
}) {
  const router = useRouter();
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
  );
  const [psrRoute, setPsrRoute] = useState("");
  const [daRoute, setDaRoute] = useState("");
  const [blocks, setBlocks] = useState<CustomerDraft[]>([emptyCustomer()]);
  const [skuQuery, setSkuQuery] = useState("");
  const [activeBlock, setActiveBlock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredSkus = useMemo(() => {
    const q = skuQuery.trim().toLowerCase();
    if (!q) return skus.slice(0, 30);
    return skus
      .filter(
        (s) =>
          s.product_code.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.barcode ?? "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [skuQuery, skus]);

  function addSkuToActive(skuId: string) {
    const sku = skus.find((s) => s.id === skuId);
    const defaultPrice =
      sku?.sale_price_pack != null ? String(sku.sale_price_pack) : "";
    setBlocks((prev) =>
      prev.map((b, idx) => {
        if (idx !== activeBlock) return b;
        return {
          ...b,
          lines: [
            ...b.lines.filter((l) => l.sku_id),
            { ...emptyLine(defaultPrice), sku_id: skuId, qty_cases: "1" },
          ],
        };
      }),
    );
    setSkuQuery("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    for (const [bIdx, b] of blocks.entries()) {
      const lines = b.lines.filter((l) => l.sku_id);
      if (!lines.length) {
        setLoading(false);
        setError(`Customer ${bIdx + 1}: add at least one SKU`);
        return;
      }
      for (const l of lines) {
        if (l.sale_price === "" || Number.isNaN(Number(l.sale_price)) || Number(l.sale_price) < 0) {
          setLoading(false);
          setError(`Customer ${bIdx + 1}: enter selling price for all SKUs`);
          return;
        }
      }
    }

    const payloadCustomers = blocks.map((b) => ({
      customer_id: b.mode === "existing" ? b.customer_id : undefined,
      customer_code: b.mode === "new" ? b.customer_code : undefined,
      customer_name: b.mode === "new" ? b.customer_name : undefined,
      lines: b.lines
        .filter((l) => l.sku_id)
        .map((l) => {
          const sku = skus.find((s) => s.id === l.sku_id);
          const ppc = sku?.packs_per_carton || 1;
          const units =
            Number(l.qty_cases || 0) * ppc + Number(l.qty_units || 0);
          return {
            sku_id: l.sku_id,
            qty_ordered_units: units,
            sale_price_pack: Number(l.sale_price),
          };
        }),
    }));

    const res = await fetch("/api/picklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        delivery_date: deliveryDate,
        psr_route_code: psrRoute || undefined,
        da_route_code: daRoute || undefined,
        customers: payloadCustomers,
      }),
    });
    const json = (await res.json()) as {
      picklist?: { id: string };
      error?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Create failed");
      return;
    }
    router.push(`/app/picklists/${json.picklist!.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card className="grid gap-3 sm:grid-cols-3">
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
          <Label>PSR route name</Label>
          <Input
            value={psrRoute}
            onChange={(e) => setPsrRoute(e.target.value)}
            placeholder="Route name (code auto if new)"
          />
        </div>
        <div>
          <Label>DA route name</Label>
          <Input
            value={daRoute}
            onChange={(e) => setDaRoute(e.target.value)}
            placeholder="Route name (code auto if new)"
          />
        </div>
      </Card>

      {blocks.map((block, bIdx) => (
        <Card key={block.key} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Customer {bIdx + 1}</h2>
            <button
              type="button"
              className="text-xs font-semibold text-[var(--danger)]"
              onClick={() =>
                setBlocks((prev) =>
                  prev.length === 1
                    ? [emptyCustomer()]
                    : prev.filter((b) => b.key !== block.key),
                )
              }
            >
              Remove
            </button>
          </div>

          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 font-semibold ${
                block.mode === "new"
                  ? "bg-[var(--brand-soft)] text-[var(--brand-dark)]"
                  : "bg-[var(--surface-2)]"
              }`}
              onClick={() =>
                setBlocks((prev) =>
                  prev.map((b, i) =>
                    i === bIdx ? { ...b, mode: "new" } : b,
                  ),
                )
              }
            >
              New customer
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 font-semibold ${
                block.mode === "existing"
                  ? "bg-[var(--brand-soft)] text-[var(--brand-dark)]"
                  : "bg-[var(--surface-2)]"
              }`}
              onClick={() =>
                setBlocks((prev) =>
                  prev.map((b, i) =>
                    i === bIdx ? { ...b, mode: "existing" } : b,
                  ),
                )
              }
            >
              Existing
            </button>
          </div>

          {block.mode === "new" ? (
            <div className="grid gap-2 sm:grid-cols-1">
              <div className="rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--ink-muted)]">
                Customer code will be auto-generated (CUS000001…).
              </div>
              <div>
                <Label>Customer name</Label>
                <Input
                  value={block.customer_name}
                  onChange={(e) =>
                    setBlocks((prev) =>
                      prev.map((b, i) =>
                        i === bIdx
                          ? { ...b, customer_name: e.target.value }
                          : b,
                      ),
                    )
                  }
                  required
                />
              </div>
            </div>
          ) : (
            <div>
              <Label>Select customer</Label>
              <select
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm"
                value={block.customer_id}
                onChange={(e) =>
                  setBlocks((prev) =>
                    prev.map((b, i) =>
                      i === bIdx ? { ...b, customer_id: e.target.value } : b,
                    ),
                  )
                }
                required
              >
                <option value="">Choose...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label>Invoice no</Label>
            <Input
              value="Auto-generated on save"
              readOnly
              tabIndex={-1}
              className="cursor-default bg-[var(--surface-2)] text-[var(--ink-muted)] focus:ring-0"
            />
          </div>

          <button
            type="button"
            className="text-sm font-semibold text-[var(--brand)]"
            onClick={() => setActiveBlock(bIdx)}
          >
            {activeBlock === bIdx
              ? "Adding SKUs to this customer ?"
              : "Click to add SKUs to this customer"}
          </button>

          <div className="space-y-2">
            {block.lines
              .filter((l) => l.sku_id)
              .map((line) => {
                const sku = skus.find((s) => s.id === line.sku_id);
                return (
                  <div
                    key={line.key}
                    className="grid gap-2 rounded-lg border border-[var(--line)] p-2 sm:grid-cols-5"
                  >
                    <div className="sm:col-span-2 text-sm">
                      <p className="font-semibold">{sku?.product_code}</p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        {sku?.description}
                      </p>
                    </div>
                    <div>
                      <Label>Cases</Label>
                      <Input
                        type="number"
                        min="0"
                        value={line.qty_cases}
                        onChange={(e) =>
                          setBlocks((prev) =>
                            prev.map((b, i) =>
                              i === bIdx
                                ? {
                                    ...b,
                                    lines: b.lines.map((l) =>
                                      l.key === line.key
                                        ? { ...l, qty_cases: e.target.value }
                                        : l,
                                    ),
                                  }
                                : b,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Loose units</Label>
                      <Input
                        type="number"
                        min="0"
                        value={line.qty_units}
                        onChange={(e) =>
                          setBlocks((prev) =>
                            prev.map((b, i) =>
                              i === bIdx
                                ? {
                                    ...b,
                                    lines: b.lines.map((l) =>
                                      l.key === line.key
                                        ? { ...l, qty_units: e.target.value }
                                        : l,
                                    ),
                                  }
                                : b,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Selling price (Rs / pack)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={line.sale_price}
                        onChange={(e) =>
                          setBlocks((prev) =>
                            prev.map((b, i) =>
                              i === bIdx
                                ? {
                                    ...b,
                                    lines: b.lines.map((l) =>
                                      l.key === line.key
                                        ? { ...l, sale_price: e.target.value }
                                        : l,
                                    ),
                                  }
                                : b,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      ))}

      <Card>
        <Label>
          Search SKU for customer {activeBlock + 1} (code / name / barcode)
        </Label>
        <Input
          value={skuQuery}
          onChange={(e) => setSkuQuery(e.target.value)}
          placeholder="Type or scan"
        />
        {skuQuery ? (
          <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-[var(--line)]">
            {filteredSkus.map((s) => (
              <button
                key={s.id}
                type="button"
                className="block w-full border-b border-[var(--line)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                onClick={() => addSkuToActive(s.id)}
              >
                <strong>{s.product_code}</strong> — {s.description}
                {s.sale_price_pack != null ? (
                  <span className="text-[var(--ink-muted)]">
                    {" "}
                    · Rs {Number(s.sale_price_pack).toFixed(2)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setBlocks((prev) => [...prev, emptyCustomer()])}
        >
          Add customer
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create picklist with FEFO"}
        </Button>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}
