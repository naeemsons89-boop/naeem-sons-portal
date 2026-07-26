"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";

import { Button, Card, Label } from "@/components/ui";
import {
  IMPORT_FORMATS,
  type ImportKind,
} from "@/lib/import-formats";

export function ImportsClient() {
  const [kind, setKind] = useState<ImportKind>("skus");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const format = IMPORT_FORMATS[kind];

  function downloadTemplate() {
    const rows = [format.columns];
    if (format.sample) rows.push(format.sample);
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = format.columns.map((col) => ({
      wch: Math.max(col.length + 2, 14),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Template");
    XLSX.writeFile(workbook, format.fileName);
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an Excel or CSV file first");
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
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ImportKind);
                setFile(null);
                setError(null);
                setMessage(null);
              }}
            >
              <option value="skus">SKU / price list</option>
              <option value="opening_stock">Opening inventory + pricing</option>
              <option value="customer_openings">Customer opening balances</option>
            </select>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3">
            <p className="text-sm font-medium text-[var(--ink)]">
              Step 1 — Download format
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Download the Excel template for <span className="font-medium text-[var(--ink)]">{format.label}</span>, fill in your data, then upload it below.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={downloadTemplate}
            >
              <Download className="size-3.5" />
              Download Excel format
            </Button>
          </div>

          <div>
            <Label htmlFor="file">Step 2 — Upload filled file</Label>
            <input
              id="file"
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Accepts Excel (.xlsx / .xls) or CSV
            </p>
          </div>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Uploading…" : "Upload file"}
          </Button>
        </form>
      </Card>
      <Card className="space-y-3 text-sm text-[var(--ink-muted)]">
        <p className="text-sm font-medium text-[var(--ink)]">Expected columns</p>
        <div>
          <p className="font-medium text-[var(--ink)]">{format.label}</p>
          <p className="mt-1 font-mono text-xs break-all">
            {format.columns.join(", ")}
          </p>
        </div>
        <p>
          Use <span className="font-medium text-[var(--ink)]">Download Excel format</span> after
          choosing an import type. Keep the header row unchanged. You can delete the sample row
          before uploading. Existing Excel price lists (e.g. `PriceList2026.xlsx`) can also be
          uploaded directly for SKUs.
        </p>
      </Card>
    </div>
  );
}
