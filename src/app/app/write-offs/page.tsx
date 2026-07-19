import { redirect } from "next/navigation";

import { DocumentSearch } from "@/components/document-search";
import { WriteOffClient } from "@/components/write-off-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export default async function WriteOffsPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "writeOff")) redirect("/app");

  const supabase = await createClient();
  const admin = createServiceClient();

  const [{ data: reasons }, { data: writeOffs }, { data: balances }] = await Promise.all([
    supabase.from("reason_codes").select("code,label").eq("kind", "write_off").eq("is_active", true),
    supabase
      .from("write_offs")
      .select("id,write_off_no,status")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("stock_balances")
      .select(
        "sku_id,batch_id,condition,finance_status,qty_units,sku:skus(product_code,description),batch:batches(batch_code,expiry_date)",
      )
      .gt("qty_units", 0)
      .limit(500),
  ]);

  const stock = (balances ?? []).map((b) => {
    const sku = b.sku as unknown as { product_code?: string; description?: string } | null;
    const batch = b.batch as unknown as { batch_code?: string; expiry_date?: string | null } | null;
    return {
      sku_id: b.sku_id as string,
      batch_id: b.batch_id as string,
      condition: b.condition as string,
      finance_status: b.finance_status as string,
      qty_units: Number(b.qty_units),
      product_code: sku?.product_code ?? "",
      description: sku?.description ?? "",
      batch_code: batch?.batch_code ?? "",
      expiry_date: batch?.expiry_date ?? null,
    };
  });

  return (
    <div>
      <PageHeader
        title="Write-off / Destroy"
        description="Remove expired or damaged stock with audit trail. Fixed auto numbers: WO000001…"
      />
      <div className="mb-4 max-w-xl">
        <DocumentSearch scope="write_off" variant="page" />
      </div>
      <WriteOffClient
        reasons={(reasons ?? []) as { code: string; label: string }[]}
        stock={stock}
        initial={(writeOffs ?? []) as Record<string, unknown>[]}
      />
    </div>
  );
}
