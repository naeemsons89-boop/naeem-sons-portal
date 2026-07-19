import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { nextDocNo } from "@/lib/ops";
import { can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function GET() {
  const { profile } = await getSessionProfile();
  if (!can(profile?.role as AppRole, "cashCollection")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_collections")
    .select(
      "id,collection_no,invoice_no,outstanding_balance,collected_at,created_at,customer:customers(code,name),picklist:picklists(picklist_no),gate_pass:gate_passes(gate_pass_no)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ collections: data });
}

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "cashCollection")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const picklistId = String(form.get("picklist_id") ?? "");
  const gatePassId = String(form.get("gate_pass_id") ?? "");
  const customerId = String(form.get("customer_id") ?? "");
  const invoiceNo = String(form.get("invoice_no") ?? "");
  const outstanding = Number(form.get("outstanding_balance") ?? 0);
  const remarks = String(form.get("remarks") ?? "");
  const paymentsRaw = String(form.get("payments") ?? "[]");

  let payments: Array<{
    method: "cash" | "online" | "cheque";
    amount: number;
    cheque_no?: string;
    bank_name?: string;
    online_ref?: string;
    notes?: string;
    proof_index?: number;
  }> = [];

  try {
    payments = JSON.parse(paymentsRaw);
  } catch {
    return NextResponse.json({ error: "Invalid payments JSON" }, { status: 400 });
  }

  if (!picklistId || !gatePassId || !customerId || !payments.length) {
    return NextResponse.json(
      { error: "Picklist, gate pass, customer, and at least one payment required" },
      { status: 400 },
    );
  }

  const admin = createServiceClient();

  // Validate gate pass belongs to picklist
  const { data: gp } = await admin
    .from("gate_passes")
    .select("id,picklist_id")
    .eq("id", gatePassId)
    .maybeSingle();
  if (!gp || gp.picklist_id !== picklistId) {
    return NextResponse.json(
      { error: "Gate pass must belong to the selected picklist" },
      { status: 400 },
    );
  }

  const collectionNo = await nextDocNo(admin, "cash_collection", "CC");
  const { data: collection, error } = await admin
    .from("cash_collections")
    .insert({
      collection_no: collectionNo,
      picklist_id: picklistId,
      gate_pass_id: gatePassId,
      customer_id: customerId,
      invoice_no: invoiceNo || null,
      outstanding_balance: outstanding,
      collected_by: userId,
      collected_at: new Date().toISOString(),
      remarks: remarks || null,
    })
    .select("*")
    .single();

  if (error || !collection) {
    return NextResponse.json({ error: error?.message ?? "Create failed" }, { status: 400 });
  }

  try {
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!["cash", "online", "cheque"].includes(p.method)) {
        throw new Error(`Invalid payment method on line ${i + 1}`);
      }
      if (Number(p.amount) < 0) throw new Error("Amount cannot be negative");

      let proofPath: string | null = null;
      const file = form.get(`proof_${i}`);
      if (file instanceof File && file.size > 0) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${collection.id}/${i}-${Date.now()}.${ext}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { error: upErr } = await admin.storage
          .from("payment-proofs")
          .upload(path, bytes, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          // Bucket may not exist yet — keep collection without file, surface warning
          throw new Error(
            `Proof upload failed (${upErr.message}). Run payment-proofs storage migration in Supabase.`,
          );
        }
        proofPath = path;
      }

      const { error: payErr } = await admin.from("cash_collection_payments").insert({
        cash_collection_id: collection.id,
        method: p.method,
        amount: Number(p.amount),
        cheque_no: p.cheque_no || null,
        bank_name: p.bank_name || null,
        online_ref: p.online_ref || null,
        proof_path: proofPath,
        notes: p.notes || null,
      });
      if (payErr) throw new Error(payErr.message);
    }

    return NextResponse.json({
      collection,
      message: `Collection ${collection.collection_no} saved`,
    });
  } catch (e) {
    await admin.from("cash_collections").delete().eq("id", collection.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Collection failed" },
      { status: 400 },
    );
  }
}
