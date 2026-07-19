import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { postReturn } from "@/lib/returns";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "returns")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const admin = createServiceClient();
  const { data: receipt, error } = await admin
    .from("return_receipts")
    .select(
      "*, customer:customers(code,name), reason:reason_codes(code,label)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: lines } = await admin
    .from("return_lines")
    .select(
      "*, sku:skus(product_code,description), batch:batches(batch_code,is_unknown)",
    )
    .eq("return_id", id);

  return NextResponse.json({ receipt, lines: lines ?? [] });
}

export async function POST(request: Request, ctx: Ctx) {
  const { userId, profile } = await getSessionProfile();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await request.json()) as { action: "approve_and_post" };
  if (body.action !== "approve_and_post") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (!can(profile?.role as AppRole, "approveUnknownBatch")) {
    return NextResponse.json({ error: "Manager/Admin only" }, { status: 403 });
  }

  const admin = createServiceClient();
  try {
    await postReturn(admin, id, userId, true);
    return NextResponse.json({ ok: true, message: "Return posted to stock" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Post failed" },
      { status: 400 },
    );
  }
}
