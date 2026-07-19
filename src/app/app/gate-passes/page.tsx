import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { canTouchPicklist } from "@/lib/picklist-server";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function GatePassesPage() {
  const { profile } = await getSessionProfile();
  if (!canTouchPicklist(profile?.role as AppRole)) redirect("/app");

  const supabase = await createClient();
  const { data: raw } = await supabase
    .from("gate_passes")
    .select(
      "id,gate_pass_no,status,issued_at,security_out_by_name,picklist:picklists(id,picklist_no,delivery_date)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (raw ?? []) as Array<{
    id: string;
    gate_pass_no: string;
    status: string;
    issued_at: string | null;
    security_out_by_name: string | null;
    picklist: {
      id: string;
      picklist_no: string;
      delivery_date: string;
    } | null;
  }>;

  return (
    <div>
      <PageHeader
        title="Gate passes"
        description="Each picklist gets one unique outward gate pass after manager approval."
      />
      <div className="space-y-3">
        {rows.map((g) => (
          <Card key={g.id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{g.gate_pass_no}</p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {g.picklist?.picklist_no} · {g.picklist?.delivery_date}
                  {g.security_out_by_name
                    ? ` · Security: ${g.security_out_by_name}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`/app/print/gate-pass/${g.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-[var(--brand)]"
                >
                  Print PDF
                </a>
                {g.picklist ? (
                  <Link
                    href={`/app/picklists/${g.picklist.id}`}
                    className="text-sm font-semibold text-[var(--brand)]"
                  >
                    Open picklist →
                  </Link>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
        {rows.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--ink-muted)]">
              No gate passes yet. Issue one from a picklist after picking.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
