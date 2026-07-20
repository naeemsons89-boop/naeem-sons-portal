import { redirect } from "next/navigation";

import { PoCreateForm } from "@/components/po-create-form";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function NewPoPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "createPo")) redirect("/app/po");

  const supabase = await createClient();
  const [{ data: suppliers }, { data: warehouses }, { data: skus }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id,code,name")
        .eq("is_active", true)
        .order("name"),
      supabase.from("warehouses").select("id,code,name").order("code"),
      supabase
        .from("skus")
        .select(
          "id,product_code,description,barcode,packs_per_carton,purchase_price_pack",
        )
        .eq("is_active", true)
        .order("product_code")
        .limit(1000),
    ]);

  return (
    <div>
      <PageHeader
        title="New purchase order"
        description="Pick a supplier, search any SKU, set qty / UOM / price, then create the PO."
      />
      <PoCreateForm
        suppliers={
          (suppliers ?? []) as { id: string; code: string | null; name: string }[]
        }
        warehouses={(warehouses ?? []) as { id: string; code: string; name: string }[]}
        skus={
          (skus ?? []) as {
            id: string;
            product_code: string;
            description: string;
            barcode: string | null;
            packs_per_carton: number;
            purchase_price_pack: number | null;
          }[]
        }
      />
    </div>
  );
}
