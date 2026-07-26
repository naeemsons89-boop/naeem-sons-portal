import { redirect } from "next/navigation";

import { SaleLedgerClient } from "@/components/sale-ledger-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function SaleLedgerPage() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "cashCollection")) redirect("/app");

  const supabase = await createClient();
  const { data } = await supabase
    .from("v_customer_balances")
    .select("customer_id,code,name,outstanding")
    .order("name")
    .limit(200);

  return (
    <div>
      <PageHeader
        title="Sale ledger"
        description="Customer-wise sales, payments, and outstanding balance"
      />
      <SaleLedgerClient
        initialCustomers={
          (data ?? []) as Array<{
            customer_id: string;
            code: string;
            name: string;
            outstanding: number;
          }>
        }
      />
    </div>
  );
}
