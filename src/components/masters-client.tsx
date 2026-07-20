"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Card, Input, Label } from "@/components/ui";

type Entity = "skus" | "customers" | "suppliers" | "categories";

type SupplierOption = { id: string; code: string | null; name: string };
type CategoryOption = { id: string; name: string };
type SupplierSkuRow = {
  supplier_id: string;
  sku_id: string;
  supplier_sku_code: string | null;
  default_purchase_price: number | null;
  is_active: boolean;
  supplier?: { id: string; code: string | null; name: string } | null;
};

export function MastersClient({ canEdit }: { canEdit: boolean }) {
  const [entity, setEntity] = useState<Entity>("skus");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);

  const [mapSkuId, setMapSkuId] = useState<string | null>(null);
  const [mapRows, setMapRows] = useState<SupplierSkuRow[]>([]);
  const [mapForm, setMapForm] = useState({
    supplier_id: "",
    supplier_sku_code: "",
    default_purchase_price: "",
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ entity });
    if (q) params.set("q", q);
    const res = await fetch(`/api/masters?${params}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Load failed");
      return;
    }
    setRows(json.rows ?? []);
  }, [entity, q]);

  const loadLookups = useCallback(async () => {
    const [catRes, supRes] = await Promise.all([
      fetch("/api/masters?entity=categories"),
      fetch("/api/masters?entity=suppliers"),
    ]);
    const catJson = await catRes.json();
    const supJson = await supRes.json();
    if (catRes.ok) {
      setCategories(
        ((catJson.rows ?? []) as CategoryOption[]).filter((c) => Boolean(c.id)),
      );
    }
    if (supRes.ok) {
      setSuppliers(
        ((supJson.rows ?? []) as SupplierOption[]).filter((s) => Boolean(s.id)),
      );
    }
  }, []);

  useEffect(() => {
    void load();
    setForm({});
    setEditId(null);
    setMapSkuId(null);
  }, [load]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  async function loadMaps(skuId: string) {
    const res = await fetch(`/api/masters?entity=supplier_skus&sku_id=${skuId}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load supplier maps");
      return;
    }
    setMapRows(json.rows ?? []);
  }

  async function save() {
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/masters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity,
        action: editId ? "update" : "create",
        id: editId ?? undefined,
        data: form,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(json.error ?? "Save failed");
      return;
    }

    // On new SKU, optionally map to a supplier so it appears on POs
    if (
      entity === "skus" &&
      !editId &&
      form.supplier_id &&
      json.row?.id
    ) {
      const mapRes = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "supplier_skus",
          action: "upsert",
          data: {
            supplier_id: form.supplier_id,
            sku_id: json.row.id,
            default_purchase_price: form.purchase_price_pack || null,
            is_active: true,
          },
        }),
      });
      if (!mapRes.ok) {
        const mapJson = await mapRes.json();
        setBusy(false);
        setError(
          mapJson.error ??
            "SKU created, but supplier mapping failed. Use Suppliers on the row.",
        );
        await load();
        return;
      }
    }

    setBusy(false);
    setMessage(
      entity === "skus" && !editId && form.supplier_id
        ? "SKU created and mapped to supplier"
        : editId
          ? "Updated"
          : "Created",
    );
    setForm({});
    setEditId(null);
    await load();
    if (entity === "categories" || entity === "suppliers") await loadLookups();
  }

  async function toggle(id: string, is_active: boolean) {
    setBusy(true);
    await fetch("/api/masters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, action: "toggle", id, is_active }),
    });
    setBusy(false);
    await load();
  }

  async function upsertMap() {
    if (!mapSkuId || !mapForm.supplier_id) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/masters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "supplier_skus",
        action: "upsert",
        data: {
          supplier_id: mapForm.supplier_id,
          sku_id: mapSkuId,
          supplier_sku_code: mapForm.supplier_sku_code || null,
          default_purchase_price: mapForm.default_purchase_price || null,
          is_active: true,
        },
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Map failed");
      return;
    }
    setMapForm({ supplier_id: "", supplier_sku_code: "", default_purchase_price: "" });
    setMessage("Supplier mapped");
    await loadMaps(mapSkuId);
  }

  async function deactivateMap(supplierId: string) {
    if (!mapSkuId) return;
    setBusy(true);
    await fetch("/api/masters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "supplier_skus",
        action: "deactivate",
        supplier_id: supplierId,
        sku_id: mapSkuId,
      }),
    });
    setBusy(false);
    await loadMaps(mapSkuId);
  }

  function startEdit(row: Record<string, unknown>) {
    setEditId(String(row.id));
    if (entity === "skus") {
      const cat = row.category as { id?: string } | null;
      setForm({
        product_code: String(row.product_code ?? ""),
        description: String(row.description ?? ""),
        barcode: String(row.barcode ?? ""),
        category_id: String(row.category_id ?? cat?.id ?? ""),
        packs_per_carton: String(row.packs_per_carton ?? "1"),
        purchase_price_pack: String(row.purchase_price_pack ?? ""),
        sale_price_pack: String(row.sale_price_pack ?? ""),
        default_shelf_life_days: String(row.default_shelf_life_days ?? ""),
      });
    } else if (entity === "customers") {
      setForm({
        name: String(row.name ?? ""),
        phone: String(row.phone ?? ""),
        address: String(row.address ?? ""),
        opening_balance: String(row.opening_balance ?? "0"),
      });
    } else if (entity === "categories") {
      setForm({ name: String(row.name ?? "") });
    } else {
      setForm({
        name: String(row.name ?? ""),
        phone: String(row.phone ?? ""),
        address: String(row.address ?? ""),
      });
    }
  }

  async function openMap(skuId: string) {
    setMapSkuId(skuId);
    setMessage(null);
    await loadMaps(skuId);
  }

  const tabs: { id: Entity; label: string }[] = [
    { id: "skus", label: "SKUs" },
    { id: "categories", label: "Categories" },
    { id: "suppliers", label: "Suppliers" },
    { id: "customers", label: "Customers" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={entity === t.id ? "primary" : "secondary"}
            onClick={() => setEntity(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Card className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Search
        </Button>
      </Card>

      {canEdit ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">{editId ? "Edit" : "Add new"}</h2>
          {entity === "skus" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label>Product code</Label>
                <Input
                  value={form.product_code ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, product_code: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                  value={form.category_id ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {!editId ? (
                <div>
                  <Label>Supplier (for POs)</Label>
                  <select
                    className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                    value={form.supplier_id ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
                  >
                    <option value="">Map later…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `${s.code} — ` : ""}
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <Label>Barcode</Label>
                <Input
                  value={form.barcode ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                />
              </div>
              <div>
                <Label>Packs / carton</Label>
                <Input
                  type="number"
                  value={form.packs_per_carton ?? "1"}
                  onChange={(e) => setForm((f) => ({ ...f, packs_per_carton: e.target.value }))}
                />
              </div>
              <div>
                <Label>Purchase / pack</Label>
                <Input
                  value={form.purchase_price_pack ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, purchase_price_pack: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Sale / pack</Label>
                <Input
                  value={form.sale_price_pack ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, sale_price_pack: e.target.value }))}
                />
              </div>
              <div>
                <Label>Shelf life (days)</Label>
                <Input
                  value={form.default_shelf_life_days ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, default_shelf_life_days: e.target.value }))
                  }
                />
              </div>
            </div>
          ) : entity === "customers" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {editId ? (
                <div className="sm:col-span-2 text-sm text-[var(--ink-muted)]">
                  Code is auto-generated and cannot be changed.
                </div>
              ) : (
                <div className="sm:col-span-2 text-sm text-[var(--ink-muted)]">
                  Customer code will be auto-generated (CUS000001…).
                </div>
              )}
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label>Opening balance</Label>
                <Input
                  value={form.opening_balance ?? "0"}
                  onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Address</Label>
                <Input
                  value={form.address ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
            </div>
          ) : entity === "categories" ? (
            <div>
              <Label>Name</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {editId ? (
                <div className="sm:col-span-2 text-sm text-[var(--ink-muted)]">
                  Code is auto-generated and cannot be changed.
                </div>
              ) : (
                <div className="sm:col-span-2 text-sm text-[var(--ink-muted)]">
                  Supplier code will be auto-generated (SUP000001…).
                </div>
              )}
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Address</Label>
                <Input
                  value={form.address ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : editId ? "Update" : "Create"}
            </Button>
            {editId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditId(null);
                  setForm({});
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <p className="text-sm text-[var(--ink-muted)]">
          View only — ask Admin/Sales to edit masters.
        </p>
      )}

      {mapSkuId && entity === "skus" ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Supplier mapping</h2>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMapSkuId(null)}>
              Close
            </Button>
          </div>
          {canEdit ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Label>Supplier</Label>
                <select
                  className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                  value={mapForm.supplier_id}
                  onChange={(e) => setMapForm((f) => ({ ...f, supplier_id: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code ? `${s.code} — ` : ""}
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Vendor SKU code</Label>
                <Input
                  value={mapForm.supplier_sku_code}
                  onChange={(e) =>
                    setMapForm((f) => ({ ...f, supplier_sku_code: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Default purchase price</Label>
                <Input
                  value={mapForm.default_purchase_price}
                  onChange={(e) =>
                    setMapForm((f) => ({ ...f, default_purchase_price: e.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-4">
                <Button disabled={busy || !mapForm.supplier_id} onClick={() => void upsertMap()}>
                  Attach supplier
                </Button>
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            {mapRows.map((m) => (
              <div
                key={`${m.supplier_id}-${m.sku_id}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 text-sm last:border-0"
              >
                <div>
                  <strong>
                    {m.supplier?.code || "—"} — {m.supplier?.name || m.supplier_id}
                  </strong>
                  {m.supplier_sku_code ? (
                    <span className="ml-2 font-mono text-xs text-[var(--ink-muted)]">
                      {m.supplier_sku_code}
                    </span>
                  ) : null}
                  {m.default_purchase_price != null ? (
                    <span className="ml-2 text-xs text-[var(--ink-muted)]">
                      @ {m.default_purchase_price}
                    </span>
                  ) : null}
                  {!m.is_active ? " (inactive)" : ""}
                </div>
                {canEdit && m.is_active ? (
                  <button
                    type="button"
                    className="text-[var(--ink-muted)]"
                    onClick={() => void deactivateMap(m.supplier_id)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            {mapRows.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No suppliers mapped yet.</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="space-y-2">
        {rows.map((r) => (
          <div
            key={String(r.id)}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 text-sm last:border-0"
          >
            <div>
              {entity === "skus" ? (
                <>
                  <strong>{String(r.product_code)}</strong> — {String(r.description)}
                  {(r.category as { name?: string } | null)?.name ? (
                    <span className="ml-2 text-xs text-[var(--ink-muted)]">
                      [{String((r.category as { name?: string }).name)}]
                    </span>
                  ) : null}
                  {r.barcode ? (
                    <span className="ml-2 font-mono text-xs text-[var(--ink-muted)]">
                      {String(r.barcode)}
                    </span>
                  ) : null}
                  {!r.is_active ? " (inactive)" : ""}
                </>
              ) : entity === "categories" ? (
                <>
                  <strong>{String(r.name)}</strong>
                  {!r.is_active ? " (inactive)" : ""}
                </>
              ) : (
                <>
                  <strong>{String(r.code || "—")}</strong> — {String(r.name)}
                  {!r.is_active ? " (inactive)" : ""}
                </>
              )}
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                {entity === "skus" ? (
                  <button
                    type="button"
                    className="font-semibold text-[var(--brand)]"
                    onClick={() => void openMap(String(r.id))}
                  >
                    Suppliers
                  </button>
                ) : null}
                <button
                  type="button"
                  className="font-semibold text-[var(--brand)]"
                  onClick={() => startEdit(r)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[var(--ink-muted)]"
                  onClick={() => void toggle(String(r.id), !r.is_active)}
                >
                  {r.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No rows. Import CSV or add above.</p>
        ) : null}
      </Card>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
