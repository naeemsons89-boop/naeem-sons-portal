"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Card, Input, Label } from "@/components/ui";

type Entity = "skus" | "customers" | "suppliers";

export function MastersClient({ canEdit }: { canEdit: boolean }) {
  const [entity, setEntity] = useState<Entity>("skus");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);

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

  useEffect(() => {
    void load();
    setForm({});
    setEditId(null);
  }, [load]);

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
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Save failed");
      return;
    }
    setMessage(editId ? "Updated" : "Created");
    setForm({});
    setEditId(null);
    await load();
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

  function startEdit(row: Record<string, unknown>) {
    setEditId(String(row.id));
    if (entity === "skus") {
      setForm({
        product_code: String(row.product_code ?? ""),
        description: String(row.description ?? ""),
        barcode: String(row.barcode ?? ""),
        packs_per_carton: String(row.packs_per_carton ?? "1"),
        purchase_price_pack: String(row.purchase_price_pack ?? ""),
        sale_price_pack: String(row.sale_price_pack ?? ""),
        default_shelf_life_days: String(row.default_shelf_life_days ?? ""),
      });
    } else if (entity === "customers") {
      setForm({
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
        phone: String(row.phone ?? ""),
        address: String(row.address ?? ""),
        opening_balance: String(row.opening_balance ?? "0"),
      });
    } else {
      setForm({
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
        phone: String(row.phone ?? ""),
        address: String(row.address ?? ""),
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["skus", "customers", "suppliers"] as Entity[]).map((e) => (
          <Button
            key={e}
            type="button"
            size="sm"
            variant={entity === e ? "primary" : "secondary"}
            onClick={() => setEntity(e)}
          >
            {e === "skus" ? "SKUs" : e === "customers" ? "Customers" : "Suppliers"}
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
              <div>
                <Label>Code</Label>
                <Input
                  value={form.code ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
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
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label>Code</Label>
                <Input
                  value={form.code ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
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
        <p className="text-sm text-[var(--ink-muted)]">View only — ask Admin/Sales to edit masters.</p>
      )}

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
                  {r.barcode ? (
                    <span className="ml-2 font-mono text-xs text-[var(--ink-muted)]">
                      {String(r.barcode)}
                    </span>
                  ) : null}
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
