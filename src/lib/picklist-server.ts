import type { SupabaseClient } from "@supabase/supabase-js";

import { can } from "@/lib/permissions";
import type { AppRole } from "@/types/database";

export function canTouchPicklist(role: AppRole | null | undefined) {
  return (
    can(role, "createPicklist") ||
    can(role, "scanPick") ||
    can(role, "approveGatePass")
  );
}

export async function nextDocNo(
  admin: SupabaseClient,
  docType: string,
  prefix: string,
) {
  const { data, error } = await admin.rpc("next_doc_no", {
    p_doc_type: docType,
  });
  if (!error && data) return String(data);
  return `${prefix}${Date.now().toString().slice(-8)}`;
}
