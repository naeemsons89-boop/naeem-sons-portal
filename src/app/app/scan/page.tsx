"use client";

import { useState } from "react";

import { ScanField } from "@/components/barcode-scanner";
import { Card, PageHeader } from "@/components/ui";

export default function ScanPage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Barcode scan"
        description="Camera scan on Android/iPhone, or Bluetooth scanner as keyboard input. Use Cam on GRN and picklist lines too."
      />
      <Card className="space-y-4">
        <ScanField
          value={code}
          onChange={setCode}
          onResolved={(r) => {
            if (r.kind === "sku" && r.sku) {
              setResult(`SKU ${r.sku.product_code} — ${r.sku.description}`);
            } else if (r.kind === "batch" && r.batch) {
              const sku = r.batch.sku as { product_code?: string } | undefined;
              setResult(`Batch ${r.batch.batch_code} · ${sku?.product_code ?? ""}`);
            } else {
              setResult("No match in catalog");
            }
          }}
        />
        <div className="rounded-lg bg-[var(--surface-2)] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Lookup result
          </p>
          <p className="mt-1 font-semibold">{result ?? "—"}</p>
        </div>
      </Card>
    </div>
  );
}
