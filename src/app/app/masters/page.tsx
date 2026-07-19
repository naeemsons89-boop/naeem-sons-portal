import { redirect } from "next/navigation";

import { DocumentSearch } from "@/components/document-search";
import { MastersClient } from "@/components/masters-client";
import { PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

export default async function MastersPage() {
  const { profile } = await getSessionProfile();
  if (!profile) redirect("/login");

  return (
    <div>
      <PageHeader
        title="Masters"
        description="SKUs, customers (unique code), and suppliers. Search customer code above or in the top bar."
      />
      <div className="mb-4 max-w-xl">
        <DocumentSearch scope="customer" variant="page" />
      </div>
      <MastersClient canEdit={can(profile.role as AppRole, "manageMasters")} />
    </div>
  );
}
