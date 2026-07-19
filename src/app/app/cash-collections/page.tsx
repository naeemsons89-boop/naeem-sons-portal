import { redirect } from "next/navigation";

import { CashCollectionClient } from "@/components/cash-collection-client";
import { DocumentSearch } from "@/components/document-search";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function CashCollectionsPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "cashCollection")) redirect("/app");

  const supabase = await createClient();
  const [
    { data: customers },
    { data: picklists },
    { data: gatePasses },
    { data: collections },
  ] = await Promise.all([
    supabase.from("customers").select("id,code,name").eq("is_active", true).order("name"),
    supabase
      .from("picklists")
      .select("id,picklist_no,delivery_date")
      .not("load_out_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("gate_passes")
      .select("id,gate_pass_no,picklist_id")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("cash_collections")
      .select(
        "id,collection_no,customer:customers(code,name),gate_pass:gate_passes(gate_pass_no)",
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div>
      <PageHeader
        title="Cash collection"
        description="Link to unique gate pass. Fixed auto numbers: CC000001…"
      />
      <div className="mb-4 max-w-xl">
        <DocumentSearch scope="cash_collection" variant="page" />
      </div>
      <CashCollectionClient
        customers={(customers ?? []) as { id: string; code: string; name: string }[]}
        picklists={
          (picklists ?? []) as {
            id: string;
            picklist_no: string;
            delivery_date: string;
          }[]
        }
        gatePasses={
          (gatePasses ?? []) as {
            id: string;
            gate_pass_no: string;
            picklist_id: string;
          }[]
        }
        initial={(collections ?? []) as Record<string, unknown>[]}
      />
    </div>
  );
}
