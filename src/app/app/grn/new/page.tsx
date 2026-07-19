import { redirect } from "next/navigation";

import { GrnCreateForm } from "@/components/grn-create-form";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { canTouchGrn } from "@/lib/grn-server";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function NewGrnPage() {
  const { profile } = await getSessionProfile();
  if (!canTouchGrn(profile?.role as AppRole)) redirect("/app");

  const supabase = await createClient();
  const [{ data: suppliers }, { data: skus }] = await Promise.all([
    supabase.from("suppliers").select("id,code,name").eq("is_active", true).order("name"),
    supabase
      .from("skus")
      .select(
        "id,product_code,description,barcode,packs_per_carton,purchase_price_pack,purchase_price_ctn,default_shelf_life_days",
      )
      .eq("is_active", true)
      .order("product_code")
      .limit(500),
  ]);

  return (
    <div>
      <PageHeader
        title="New GRN"
        description="Enter supplier delivery note lines with batch + mfg/expiry. Prices default from price list."
      />
      <GrnCreateForm
        suppliers={(suppliers ?? []) as { id: string; code: string | null; name: string }[]}
        skus={
          (skus ?? []) as {
            id: string;
            product_code: string;
            description: string;
            barcode: string | null;
            packs_per_carton: number;
            purchase_price_pack: number | null;
            purchase_price_ctn: number | null;
            default_shelf_life_days: number | null;
          }[]
        }
      />
    </div>
  );
}
