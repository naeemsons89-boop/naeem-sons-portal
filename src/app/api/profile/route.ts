import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Columns a signed-in user is allowed to change on their own profile row. */
const EDITABLE_FIELDS = ["full_name", "phone", "avatar_url"] as const;

export async function PATCH(request: Request) {
  const { userId } = await getSessionProfile();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, string | null> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      const value = body[field];
      patch[field] = typeof value === "string" ? value.trim() || null : null;
    }
  }

  if (patch.full_name === null || patch.full_name === "") {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, profile: data });
}
