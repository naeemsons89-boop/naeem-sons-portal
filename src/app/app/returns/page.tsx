import { redirect } from "next/navigation";

import { DocumentSearch } from "@/components/document-search";
import { ReturnsClient } from "@/components/returns-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function ReturnsPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole;
  if (!can(role, "returns")) redirect("/app");

  const supabase = await createClient();
  const [{ data: customers }, { data: skus }, { data: reasons }, { data: returns }] =
    await Promise.all([
      supabase.from("customers").select("id,code,name").eq("is_active", true).order("name"),
      supabase
        .from("skus")
        .select("id,product_code,description")
        .eq("is_active", true)
        .order("product_code")
        .limit(500),
      supabase
        .from("reason_codes")
        .select("code,label")
        .eq("kind", "return")
        .eq("is_active", true),
      supabase
        .from("return_receipts")
        .select(
          "id,return_no,status,requires_unknown_batch_approval,customer:customers(code,name)",
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  return (
    <div>
      <PageHeader
        title="Returns"
        description="Customer returns by condition. Fixed auto numbers: RET000001…"
      />
      <div className="mb-4 max-w-xl">
        <DocumentSearch scope="return" variant="page" />
      </div>
      <ReturnsClient
        customers={(customers ?? []) as { id: string; code: string; name: string }[]}
        skus={(skus ?? []) as { id: string; product_code: string; description: string }[]}
        reasons={(reasons ?? []) as { code: string; label: string }[]}
        initialReturns={(returns ?? []) as never[]}
        canApprove={can(role, "approveUnknownBatch")}
      />
    </div>
  );
}
