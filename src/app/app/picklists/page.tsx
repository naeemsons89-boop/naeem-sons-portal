import Link from "next/link";
import { redirect } from "next/navigation";

import { DownloadReportBar } from "@/components/download-report-bar";
import {
  Badge,
  Button,
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
        download={
          <DownloadReportBar
            reportType="picklists"
            canExport={can(role, "exportPdfCsv")}
          />
        }
        actions={
          can(role, "createPicklist") ? (
            <Link href="/app/picklists/new">
              <Button>New picklist</Button>
            </Link>
          ) : null
        }
      />
      {picklists.length === 0 ? (
        <EmptyState>
          No picklists yet. Create one after finance-posted stock is available.
        </EmptyState>
      ) : (
        <ListPanel>
          {picklists.map((p) => (
            <ListRow
              key={p.id}
              href={`/app/picklists/${p.id}`}
              primary={p.picklist_no}
              meta={`${p.warehouse?.code ?? "MAIN_WHS"} · ${p.delivery_date}`}
              trailing={
                <>
                  <Badge tone={statusTone(p.status)} className="capitalize">
                    {p.status}
                  </Badge>
                  {p.load_out_at ? <Badge tone="success">Out</Badge> : null}
                  {p.load_in_at ? <Badge tone="warning">In</Badge> : null}
                </>
              }
            />
          ))}
        </ListPanel>
      )}
    </div>
  );
}
