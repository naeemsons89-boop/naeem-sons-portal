import { redirect } from "next/navigation";

import { PicklistCreateForm } from "@/components/picklist-create-form";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function NewPicklistPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "createPicklist")) redirect("/app/picklists");

  const supabase = await createClient();
  const [{ data: customers }, { data: skus }] = await Promise.all([
    supabase
      .from("customers")
      .select("id,code,name")
      .eq("is_active", true)
      .order("name")
      .limit(300),
    supabase
      .from("skus")
      .select("id,product_code,description,packs_per_carton,barcode")
      .eq("is_active", true)
      .order("product_code")
      .limit(500),
  ]);

  return (
    <div>
      <PageHeader
        title="New picklist"
        description="Add route + customers + SKU qtys. FEFO batches are suggested automatically from pickable stock."
      />
      <PicklistCreateForm
        customers={(customers ?? []) as { id: string; code: string; name: string }[]}
        skus={
          (skus ?? []) as {
            id: string;
            product_code: string;
            description: string;
            packs_per_carton: number;
            barcode: string | null;
          }[]
        }
      />
    </div>
  );
}
