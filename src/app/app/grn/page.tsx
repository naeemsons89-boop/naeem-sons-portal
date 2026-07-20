import Link from "next/link";
import { redirect } from "next/navigation";

import { DocumentSearch } from "@/components/document-search";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
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
      "id,grn_no,supplier_delivery_no,delivery_date,status,finance_status,physical_posted_at,truck_no,supplier:suppliers(name),po:purchase_orders(po_no)",
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
    po: { po_no?: string } | null;
  }>;

  return (
    <div>
      <PageHeader
        title="GRN Inward"
        description="Receive against a purchase order. QC then physical receive moves stock to warehouse."
        actions={
          <Link href="/app/grn/new">
            <Button>New GRN</Button>
          </Link>
        }
      />
      <div className="mb-4 max-w-xl">
        <DocumentSearch scope="grn" variant="page" />
      </div>

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
                      {g.po?.po_no ? `${g.po.po_no} · ` : ""}
                      {supplier?.name ?? "Supplier"} · DN{" "}
                      {g.supplier_delivery_no || "—"} · {g.delivery_date}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={g.physical_posted_at ? "success" : "pending"}>
                      {g.physical_posted_at ? "Physical OK" : "Draft / receive"}
                    </Badge>
                    <Badge tone={g.finance_status === "posted" ? "success" : "warning"}>
                      Finance {g.finance_status}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
        {grns.length === 0 ? (
          <EmptyState>No GRNs yet. Create one from an open purchase order.</EmptyState>
        ) : null}
      </div>
    </div>
  );
}
