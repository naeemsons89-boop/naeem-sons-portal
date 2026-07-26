import Link from "next/link";
import { redirect } from "next/navigation";

import { DownloadReportBar } from "@/components/download-report-bar";
import {
  Badge,
  EmptyState,
  ListPanel,
  ListRow,
  PageHeader,
  statusTone,
} from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canTouchPicklist } from "@/lib/picklist-server";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function GatePassesPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  if (!canTouchPicklist(role)) redirect("/app");

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
        download={
          <DownloadReportBar
            reportType="gate_passes"
            canExport={can(role, "exportPdfCsv")}
          />
        }
      />
      {rows.length === 0 ? (
        <EmptyState>No gate passes yet. Issue one from a picklist after picking.</EmptyState>
      ) : (
        <ListPanel>
          {rows.map((g) => (
            <ListRow
              key={g.id}
              primary={g.gate_pass_no}
              meta={
                <>
                  {g.picklist?.picklist_no} · {g.picklist?.delivery_date}
                  {g.security_out_by_name
                    ? ` · Security: ${g.security_out_by_name}`
                    : ""}
                </>
              }
              trailing={
                <>
                  <Badge tone={statusTone(g.status)} className="capitalize">
                    {g.status}
                  </Badge>
                  <a
                    href={`/app/print/gate-pass/${g.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-[var(--brand)]"
                  >
                    Print
                  </a>
                  {g.picklist ? (
                    <Link
                      href={`/app/picklists/${g.picklist.id}`}
                      className="text-xs font-medium text-[var(--brand)]"
                    >
                      Picklist →
                    </Link>
                  ) : null}
                </>
              }
            />
          ))}
        </ListPanel>
      )}
    </div>
  );
}
