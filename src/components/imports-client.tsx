"use client";

import { useState } from "react";

import { Button, Card, Label } from "@/components/ui";

type ImportKind = "skus" | "opening_stock" | "customer_openings";

export function ImportsClient() {
  const [kind, setKind] = useState<ImportKind>("skus");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a CSV file first");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    const res = await fetch("/api/imports", { method: "POST", body });
    const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Import failed");
      return;
    }
    setMessage(json.message ?? "Import complete");
    setFile(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <form onSubmit={onUpload} className="space-y-4">
          <div>
            <Label htmlFor="kind">Import type</Label>
            <select
              id="kind"
              className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as ImportKind)}
            >
              <option value="skus">SKU / price list</option>
              <option value="opening_stock">Opening inventory + pricing</option>
              <option value="customer_openings">Customer opening balances</option>
            </select>
          </div>
          <div>
            <Label htmlFor="file">CSV file</Label>
            <input
              id="file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Uploading…" : "Upload CSV"}
          </Button>
        </form>
      </Card>
      <Card className="space-y-3 text-sm text-[var(--ink-muted)]">
        <p className="font-semibold text-[var(--ink)]">CSV formats</p>
        <div>
          <p className="font-medium text-[var(--ink)]">SKU / price list</p>
          <p className="font-mono text-xs">
            product_code,description,barcode,packs_per_carton,gm_per_pack,price_point,purchase_price_pack,sale_price_pack,purchase_price_ctn,sale_price_ctn,default_shelf_life_days,brand
          </p>
        </div>
        <div>
          <p className="font-medium text-[var(--ink)]">Opening inventory</p>
          <p className="font-mono text-xs">
            product_code,batch_code,mfg_date,expiry_date,qty_units,condition,purchase_price_pack,warehouse_code,bin_code
          </p>
        </div>
        <div>
          <p className="font-medium text-[var(--ink)]">Customer openings</p>
          <p className="font-mono text-xs">
            customer_code,customer_name,address,phone,opening_balance,route_code
          </p>
        </div>
        <p>
          Your Excel price list (`PriceList2026.xlsx`) can be saved as CSV and
          uploaded here. Mapping for that sheet is included in the API.
        </p>
      </Card>
    </div>
  );
}
