"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card } from "@/components/ui";

export function ReturnDetailClient({
  id,
  canApprove,
}: {
  id: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<{
    receipt: Record<string, unknown>;
    lines: Record<string, unknown>[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/returns/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j);
      });
  }, [id]);

  async function approve() {
    setBusy(true);
    const res = await fetch(`/api/returns/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_and_post" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error);
      return;
    }
    router.refresh();
    const j = await fetch(`/api/returns/${id}`).then((r) => r.json());
    setData(j);
  }

  if (!data) return <Card>{error ?? "Loading…"}</Card>;
  const r = data.receipt;
  const customer = r.customer as { code?: string; name?: string } | null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{String(r.return_no)}</p>
            <p className="text-sm text-[var(--ink-muted)]">
              {customer?.code} — {customer?.name} · {String(r.status)}
            </p>
          </div>
          <a
            href={`/app/print/return/${id}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[var(--brand)]"
          >
            Print PDF
          </a>
        </div>
      </Card>
      <Card>
        <ul className="space-y-2 text-sm">
          {data.lines.map((l) => {
            const sku = l.sku as { product_code?: string } | null;
            const batch = l.batch as { batch_code?: string; is_unknown?: boolean } | null;
            return (
              <li key={l.id as string}>
                {sku?.product_code} · {batch?.batch_code}
                {batch?.is_unknown ? " (unknown)" : ""} · {String(l.condition)} ×{" "}
                {String(l.qty_units)}
              </li>
            );
          })}
        </ul>
      </Card>
      {canApprove && r.requires_unknown_batch_approval ? (
        <Button disabled={busy} onClick={() => void approve()}>
          Approve unknown batch & post
        </Button>
      ) : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
