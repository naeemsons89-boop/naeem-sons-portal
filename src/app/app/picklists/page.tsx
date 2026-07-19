import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, Card, PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canTouchPicklist } from "@/lib/picklist-server";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function PicklistsPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  if (!canTouchPicklist(role)) redirect("/app");

  const supabase = await createClient();
  const { data: raw } = await supabase
    .from("picklists")
    .select(
      "id,picklist_no,delivery_date,status,load_out_at,load_in_at,warehouse:warehouses(code)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const picklists = (raw ?? []) as Array<{
    id: string;
    picklist_no: string;
    delivery_date: string;
    status: string;
    load_out_at: string | null;
    load_in_at: string | null;
    warehouse: { code?: string } | null;
  }>;

  return (
    <div>
      <PageHeader
        title="Picklists"
        description="FEFO pick → manager gate pass → load-in good/bad."
        actions={
          can(role, "createPicklist") ? (
            <Link href="/app/picklists/new">
              <Button>New picklist</Button>
            </Link>
          ) : null
        }
      />
      <div className="space-y-3">
        {picklists.map((p) => (
          <Link key={p.id} href={`/app/picklists/${p.id}`}>
            <Card className="mb-3 transition hover:border-[var(--brand)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{p.picklist_no}</p>
                  <p className="text-sm text-[var(--ink-muted)]">
                    {p.warehouse?.code ?? "MAIN_WHS"} · {p.delivery_date}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase">
                  <span className="rounded-full bg-[var(--surface-2)] px-2 py-1">
                    {p.status}
                  </span>
                  {p.load_out_at ? (
                    <span className="rounded-full bg-[var(--brand-soft)] px-2 py-1 text-[var(--brand-dark)]">
                      Out
                    </span>
                  ) : null}
                  {p.load_in_at ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">
                      In
                    </span>
                  ) : null}
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {picklists.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--ink-muted)]">
              No picklists yet. Create one after finance-posted stock is available.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
