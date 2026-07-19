import { redirect } from "next/navigation";

import { DocumentSearch } from "@/components/document-search";
import { FocClient } from "@/components/foc-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function FocPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "focExchange")) redirect("/app");

  const supabase = await createClient();
  const [{ data: customers }, { data: skus }, { data: reasons }, { data: foc }, { data: wh }] =
    await Promise.all([
      supabase.from("customers").select("id,code,name").eq("is_active", true).order("name"),
      supabase
        .from("skus")
        .select("id,product_code,description")
        .eq("is_active", true)
        .order("product_code")
        .limit(500),
      supabase.from("reason_codes").select("code,label").eq("kind", "foc").eq("is_active", true),
      supabase
        .from("foc_issues")
        .select("id,foc_no,status")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("warehouses").select("id").eq("code", "MAIN_WHS").maybeSingle(),
    ]);

  if (!wh?.id) {
    return (
      <div>
        <PageHeader title="FOC" description="MAIN_WHS missing" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="FOC / Sampling"
        description="Issues free goods from pickable stock. Fixed auto numbers: FOC000001…"
      />
      <div className="mb-4 max-w-xl">
        <DocumentSearch scope="foc" variant="page" />
      </div>
      <FocClient
        customers={(customers ?? []) as { id: string; code: string; name: string }[]}
        skus={(skus ?? []) as { id: string; product_code: string; description: string }[]}
        reasons={(reasons ?? []) as { code: string; label: string }[]}
        warehouseId={wh.id as string}
        initial={(foc ?? []) as Record<string, unknown>[]}
      />
    </div>
  );
}
