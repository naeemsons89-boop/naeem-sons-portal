import Link from "next/link";

import { Card, PageHeader } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export default async function DashboardPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole | null;
  const supabase = await createClient();

  const [{ count: pendingUsers }, { count: skuCount }, warehouseRes] =
    await Promise.all([
      can(role, "approveUsers")
        ? supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending")
        : Promise.resolve({ count: 0 }),
      supabase.from("skus").select("*", { count: "exact", head: true }),
      supabase
        .from("warehouses")
        .select("code,name")
        .eq("code", "MAIN_WHS")
        .maybeSingle(),
    ]);

  const warehouse = warehouseRes.data as { code: string; name: string } | null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${profile?.full_name ? `, ${profile.full_name}` : ""}. Warehouse ops for Naeem & Sons.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Warehouse
          </p>
          <p className="mt-2 text-xl font-bold">
            {warehouse?.code ?? "MAIN_WHS"}
          </p>
          <p className="text-sm text-[var(--ink-muted)]">
            {warehouse?.name ?? "Main Warehouse"}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            SKUs
          </p>
          <p className="mt-2 text-xl font-bold">{skuCount ?? 0}</p>
          <p className="text-sm text-[var(--ink-muted)]">Active catalog</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Pending users
          </p>
          <p className="mt-2 text-xl font-bold">{pendingUsers ?? 0}</p>
          {can(role, "approveUsers") ? (
            <Link
              href="/app/admin/users"
              className="mt-1 inline-block text-sm font-semibold text-[var(--brand)]"
            >
              Review →
            </Link>
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">Admin only</p>
          )}
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Your role
          </p>
          <p className="mt-2 text-xl font-bold capitalize">
            {role?.replaceAll("_", " ")}
          </p>
          <p className="text-sm text-[var(--ink-muted)]">Asia/Karachi</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Quick actions</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="text-[var(--brand)] hover:underline" href="/app/scan">
                Open phone scanner
              </Link>
            </li>
            <li>
              <Link className="text-[var(--brand)] hover:underline" href="/app/grn">
                Create / receive GRN
              </Link>
            </li>
            <li>
              <Link
                className="text-[var(--brand)] hover:underline"
                href="/app/picklists"
              >
                Picklists & load-out
              </Link>
            </li>
            <li>
              <Link className="text-[var(--brand)] hover:underline" href="/app/reports">
                Reports & batch recall
              </Link>
            </li>
            <li>
              <Link className="text-[var(--brand)] hover:underline" href="/app/masters">
                Masters (SKU / customer / supplier)
              </Link>
            </li>
            {can(role, "csvUpload") ? (
              <li>
                <Link
                  className="text-[var(--brand)] hover:underline"
                  href="/app/admin/imports"
                >
                  Import SKUs / openings (CSV)
                </Link>
              </li>
            ) : null}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Operating rules</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
            <li>Physical GRN can land stock before finance.</li>
            <li>Only finance-posted batches are pickable / dispatchable.</li>
            <li>Picklist suggests FEFO; alternate scan needs manager on gate pass.</li>
            <li>Cash / online / cheque proofs attach per customer on collection.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
