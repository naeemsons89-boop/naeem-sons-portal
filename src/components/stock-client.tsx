"use client";

import { useMemo, useState } from "react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatUnitsAsCases } from "@/lib/utils";

export type StockBalanceRow = {
  id: string;
  sku_id: string;
  warehouse_id: string;
  qty_units: number;
  condition: string;
  finance_status: string;
  sku: {
    id?: string;
    product_code?: string;
    description?: string;
    packs_per_carton?: number;
    purchase_price_pack?: number | null;
    category_id?: string | null;
    category?: { id?: string; name?: string } | null;
  } | null;
  batch: { batch_code?: string; expiry_date?: string | null } | null;
  warehouse: { id?: string; code?: string } | null;
};

export type StockFilterOption = { id: string; name: string; code?: string | null };

type Tab = "inventory" | "history";

const CONDITIONS = [
  { value: "", label: "All conditions" },
  { value: "good", label: "Good" },
  { value: "near_expiry", label: "Near expiry" },
  { value: "damaged", label: "Damaged" },
  { value: "hold", label: "Hold" },
] as const;

const selectClass =
  "w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm";

type InventoryRow = {
  skuId: string;
  productCode: string;
  description: string;
  categoryId: string | null;
  categoryName: string;
  packsPerCarton: number;
  totalQty: number;
  goodQty: number;
  purchasePrice: number | null;
};

function matchesSearch(
  q: string,
  productCode: string | undefined,
  description: string | undefined,
) {
  if (!q) return true;
  const hay = `${productCode ?? ""} ${description ?? ""}`.toLowerCase();
  return hay.includes(q);
}

export function StockClient({
  rows,
  categories,
  suppliers,
  warehouses,
  supplierSkuMap,
  showFinance,
}: {
  rows: StockBalanceRow[];
  categories: StockFilterOption[];
  suppliers: StockFilterOption[];
  warehouses: StockFilterOption[];
  /** supplier_id -> sku_ids */
  supplierSkuMap: Record<string, string[]>;
  showFinance: boolean;
}) {
  const [tab, setTab] = useState<Tab>("inventory");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [condition, setCondition] = useState("");

  const search = q.trim().toLowerCase();

  const supplierSkuSet = useMemo(() => {
    if (!supplierId) return null;
    return new Set(supplierSkuMap[supplierId] ?? []);
  }, [supplierId, supplierSkuMap]);

  const filteredBalances = useMemo(() => {
    return rows.filter((row) => {
      if (warehouseId && row.warehouse_id !== warehouseId) return false;
      if (condition && row.condition !== condition) return false;
      if (categoryId) {
        const cat = row.sku?.category_id ?? row.sku?.category?.id ?? null;
        if (cat !== categoryId) return false;
      }
      if (supplierSkuSet && !supplierSkuSet.has(row.sku_id)) return false;
      if (!matchesSearch(search, row.sku?.product_code, row.sku?.description)) return false;
      return true;
    });
  }, [rows, warehouseId, condition, categoryId, supplierSkuSet, search]);

  const inventoryByCategory = useMemo(() => {
    const map = new Map<string, InventoryRow>();

    for (const row of filteredBalances) {
      const sku = row.sku;
      const qty = Number(row.qty_units);
      if (!row.sku_id || qty <= 0) continue;

      const existing = map.get(row.sku_id);
      if (existing) {
        existing.totalQty += qty;
        if (row.condition === "good") existing.goodQty += qty;
        continue;
      }

      const categoryName = sku?.category?.name?.trim() || "Uncategorized";
      map.set(row.sku_id, {
        skuId: row.sku_id,
        productCode: sku?.product_code ?? "—",
        description: sku?.description ?? "",
        categoryId: sku?.category_id ?? sku?.category?.id ?? null,
        categoryName,
        packsPerCarton: Number(sku?.packs_per_carton) > 0 ? Number(sku?.packs_per_carton) : 1,
        totalQty: qty,
        goodQty: row.condition === "good" ? qty : 0,
        purchasePrice:
          sku?.purchase_price_pack != null ? Number(sku.purchase_price_pack) : null,
      });
    }

    const groups = new Map<string, InventoryRow[]>();
    for (const item of map.values()) {
      const list = groups.get(item.categoryName) ?? [];
      list.push(item);
      groups.set(item.categoryName, list);
    }

    for (const list of groups.values()) {
      list.sort((a, b) => a.productCode.localeCompare(b.productCode));
    }

    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
  }, [filteredBalances]);

  const inventoryCount = inventoryByCategory.reduce((n, [, items]) => n + items.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "inventory" ? "primary" : "secondary"}
          onClick={() => setTab("inventory")}
        >
          Current Inventory
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "history" ? "primary" : "secondary"}
          onClick={() => setTab("history")}
        >
          Transactional History
        </Button>
      </div>

      <Card className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">
            <Label>Search</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="SKU / description…"
            />
          </div>
          <div>
            <Label>Category</Label>
            <select
              className={selectClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Supplier</Label>
            <select
              className={selectClass}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} — ${s.name}` : s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Warehouse</Label>
            <select
              className={selectClass}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} — ${w.name}` : w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Condition</Label>
            <select
              className={selectClass}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {CONDITIONS.map((c) => (
                <option key={c.value || "all"} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {tab === "inventory" ? (
        inventoryCount === 0 ? (
          <Card>
            <EmptyState>No stock yet. Create and post a GRN.</EmptyState>
          </Card>
        ) : (
          <div className="space-y-4">
            {inventoryByCategory.map(([categoryName, items]) => {
              let sectionValue = 0;
              let sectionTotalQty = 0;
              let sectionGoodQty = 0;
              for (const item of items) {
                sectionTotalQty += item.totalQty;
                sectionGoodQty += item.goodQty;
                if (showFinance && item.purchasePrice != null) {
                  sectionValue += item.totalQty * item.purchasePrice;
                }
              }

              return (
                <Card key={categoryName} className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--ink)]">
                      {categoryName}
                      <span className="ml-2 font-medium normal-case tracking-normal text-[var(--ink-muted)]">
                        {items.length} SKU{items.length === 1 ? "" : "s"}
                      </span>
                    </h2>
                    <p className="text-xs text-[var(--ink-muted)]">
                      Good {sectionGoodQty} · Total {sectionTotalQty}
                      {showFinance ? ` · Value ${sectionValue.toFixed(2)}` : ""}
                    </p>
                  </div>
                  <Table>
                    <thead>
                      <tr>
                        <Th>SKU</Th>
                        <Th>Description</Th>
                        <Th className="text-right">Cartons</Th>
                        <Th className="text-right">Pieces</Th>
                        <Th className="text-right">Good qty</Th>
                        <Th className="text-right">Total qty</Th>
                        {showFinance ? <Th className="text-right">Purchased value</Th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const split = formatUnitsAsCases(item.totalQty, item.packsPerCarton);
                        const value =
                          showFinance && item.purchasePrice != null
                            ? item.totalQty * item.purchasePrice
                            : null;
                        return (
                          <tr key={item.skuId}>
                            <Td className="font-medium">{item.productCode}</Td>
                            <Td className="text-[var(--ink-muted)]">{item.description || "—"}</Td>
                            <Td className="text-right tabular-nums">{split.cases}</Td>
                            <Td className="text-right tabular-nums">{split.units}</Td>
                            <Td className="text-right tabular-nums">{item.goodQty}</Td>
                            <Td className="text-right tabular-nums">{item.totalQty}</Td>
                            {showFinance ? (
                              <Td className="text-right tabular-nums">
                                {value != null ? value.toFixed(2) : "—"}
                              </Td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </Card>
              );
            })}
          </div>
        )
      ) : filteredBalances.length === 0 ? (
        <Card>
          <EmptyState>No stock yet. Create and post a GRN.</EmptyState>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Batch</Th>
                <Th>Expiry</Th>
                <Th>Warehouse</Th>
                <Th className="text-right">Qty</Th>
                <Th>Condition</Th>
                <Th>Finance</Th>
                {showFinance ? <Th className="text-right">Value</Th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredBalances.map((row) => {
                const sku = row.sku;
                const batch = row.batch;
                const qty = Number(row.qty_units);
                const value =
                  showFinance && sku?.purchase_price_pack != null
                    ? qty * Number(sku.purchase_price_pack)
                    : null;
                return (
                  <tr key={row.id}>
                    <Td>
                      <div className="font-medium">{sku?.product_code}</div>
                      <div className="text-xs text-[var(--ink-muted)]">{sku?.description}</div>
                    </Td>
                    <Td className="font-mono text-xs">{batch?.batch_code}</Td>
                    <Td className="text-xs">{batch?.expiry_date || "—"}</Td>
                    <Td className="text-xs">{row.warehouse?.code || "—"}</Td>
                    <Td className="text-right tabular-nums">{qty}</Td>
                    <Td className="capitalize">{row.condition.replaceAll("_", " ")}</Td>
                    <Td>
                      <Badge tone={row.finance_status === "posted" ? "success" : "warning"}>
                        {row.finance_status}
                      </Badge>
                    </Td>
                    {showFinance ? (
                      <Td className="text-right tabular-nums">
                        {value != null ? value.toFixed(2) : "—"}
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
