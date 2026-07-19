import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, Card, PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { canTouchGrn } from "@/lib/grn-server";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function GrnListPage() {
  const { profile } = await getSessionProfile();
  if (!canTouchGrn(profile?.role as AppRole)) redirect("/app");

  const supabase = await createClient();
  const { data: grnsRaw } = await supabase
    .from("grns")
    .select(
      "id,grn_no,supplier_delivery_no,delivery_date,status,finance_status,physical_posted_at,truck_no,supplier:suppliers(name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const grns = (grnsRaw ?? []) as Array<{
    id: string;
    grn_no: string;
    supplier_delivery_no: string | null;
    delivery_date: string;
    status: string;
    finance_status: string;
    physical_posted_at: string | null;
    truck_no: string | null;
    supplier: { name?: string } | null;
  }>;

  return (
    <div>
      <PageHeader
        title="GRN Inward"
        description="Physical receive first. Finance unlock makes stock pickable."
        actions={
          <Link href="/app/grn/new">
            <Button>New GRN</Button>
          </Link>
        }
      />

      <div className="space-y-3">
        {grns.map((g) => {
          const supplier = g.supplier;
          return (
            <Link key={g.id} href={`/app/grn/${g.id}`}>
              <Card className="mb-3 transition hover:border-[var(--brand)]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{g.grn_no}</p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      {supplier?.name ?? "Supplier"} · DN{" "}
                      {g.supplier_delivery_no || "—"} · {g.delivery_date}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase">
                    <span className="rounded-full bg-[var(--surface-2)] px-2 py-1">
                      {g.physical_posted_at ? "Physical OK" : "Draft / receive"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 ${
                        g.finance_status === "posted"
                          ? "bg-[var(--brand-soft)] text-[var(--brand-dark)]"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      Finance {g.finance_status}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
        {grns.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--ink-muted)]">
              No GRNs yet. Create one from a supplier delivery note.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
