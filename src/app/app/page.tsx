import {
  ArrowUpRight,
  ClipboardList,
  Gift,
  PackagePlus,
  Trash2,
  Truck,
  UserCheck,
} from "lucide-react";
import Link from "next/link";

import type { ActivitySeries } from "@/components/dashboard/activity-chart";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { MiniCalendar } from "@/components/dashboard/mini-calendar";
import type { PillTone } from "@/components/ui";
import {
  Avatar,
  Badge,
  Card,
  PageHeader,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

type MovementRow = { qty_units: number; created_at: string; movement_type: string };

const DISPATCH_TYPES = new Set(["pick_out", "gate_pass_out", "foc_out", "exchange_out"]);

function bucketByDay(rows: MovementRow[], days: number): { label: string; value: number }[] {
  const now = new Date();
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (days - 1 - i));
    return { key: d.toDateString(), label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1), value: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const row of rows) {
    const key = new Date(row.created_at).toDateString();
    const bucket = byKey.get(key);
    if (bucket) bucket.value += Number(row.qty_units) || 0;
  }
  return buckets.map(({ label, value }) => ({ label, value: Math.round(value) }));
}

function bucketByHour(rows: MovementRow[]): { label: string; value: number }[] {
  const labels = ["12a", "4a", "8a", "12p", "4p", "8p"];
  const buckets = labels.map((label) => ({ label, value: 0 }));
  const today = new Date().toDateString();
  for (const row of rows) {
    const d = new Date(row.created_at);
    if (d.toDateString() !== today) continue;
    const idx = Math.min(5, Math.floor(d.getHours() / 4));
    buckets[idx].value += Number(row.qty_units) || 0;
  }
  return buckets.map((b) => ({ ...b, value: Math.round(b.value) }));
}

function bucketByWeekOfMonth(rows: MovementRow[]): { label: string; value: number }[] {
  const buckets = [0, 1, 2, 3, 4].map((i) => ({ label: `W${i + 1}`, value: 0 }));
  const now = new Date();
  for (const row of rows) {
    const d = new Date(row.created_at);
    if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
    const idx = Math.min(4, Math.floor((d.getDate() - 1) / 7));
    buckets[idx].value += Number(row.qty_units) || 0;
  }
  return buckets.map((b) => ({ ...b, value: Math.round(b.value) }));
}

function bucketByMonth(rows: MovementRow[]): { label: string; value: number }[] {
  const now = new Date();
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-US", { month: "short" }), value: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const row of rows) {
    const d = new Date(row.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.value += Number(row.qty_units) || 0;
  }
  return buckets.map(({ label, value }) => ({ label, value: Math.round(value) }));
}

export default async function DashboardPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole | null;
  const supabase = await createClient();

  const yearAgo = new Date();
  yearAgo.setDate(yearAgo.getDate() - 370);

  const [
    { count: pendingUsers },
    { count: openGrns },
    { count: activePicklists },
    { count: pendingGatePasses },
    { count: pendingWriteOffs },
    movementsRes,
    collectionsRes,
    stockRes,
  ] = await Promise.all([
    can(role, "approveUsers")
      ? supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
    supabase.from("grns").select("*", { count: "exact", head: true }).eq("finance_status", "pending"),
    supabase
      .from("picklists")
      .select("*", { count: "exact", head: true })
      .not("status", "in", "(closed,cancelled)"),
    supabase.from("gate_passes").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    can(role, "writeOff")
      ? supabase.from("write_offs").select("*", { count: "exact", head: true }).eq("status", "submitted")
      : Promise.resolve({ count: 0 }),
    supabase
      .from("stock_movements")
      .select("qty_units,created_at,movement_type")
      .gte("created_at", yearAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("cash_collections")
      .select(
        "id,collection_no,collected_at,created_at,customer:customers(code,name),cash_collection_payments(amount,method)",
      )
      .order("created_at", { ascending: false })
      .limit(6),
    can(role, "viewFinancialStock")
      ? supabase
          .from("stock_balances")
          .select("qty_units,finance_status,sku:skus(purchase_price_pack)")
          .gt("qty_units", 0)
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ]);

  const movements = (movementsRes.data ?? []) as MovementRow[];
  const dispatchMovements = movements.filter((m) => DISPATCH_TYPES.has(m.movement_type));

  const series: ActivitySeries = {
    day: bucketByHour(dispatchMovements),
    week: bucketByDay(dispatchMovements, 7),
    month: bucketByWeekOfMonth(dispatchMovements),
    year: bucketByMonth(dispatchMovements),
  };

  const collections = (collectionsRes.data ?? []) as Array<{
    id: string;
    collection_no: string;
    collected_at: string | null;
    created_at: string;
    customer: { code?: string; name?: string } | null;
    cash_collection_payments: Array<{ amount: number; method: string }>;
  }>;

  const now = new Date();
  const mtdTotal = collections
    .filter((c) => {
      const d = new Date(c.collected_at ?? c.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce(
      (sum, c) => sum + c.cash_collection_payments.reduce((s, p) => s + Number(p.amount), 0),
      0,
    );

  const stockRows = (stockRes.data ?? []) as Array<{
    qty_units: number;
    finance_status: string;
    sku: { purchase_price_pack?: number } | null;
  }>;
  const stockValue = stockRows
    .filter((r) => r.finance_status === "posted")
    .reduce((sum, r) => sum + Number(r.qty_units) * Number(r.sku?.purchase_price_pack ?? 0), 0);

  const tasks: Array<{
    tone: PillTone;
    title: string;
    subtitle: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [];

  if ((openGrns ?? 0) > 0) {
    tasks.push({
      tone: "purple",
      title: `${openGrns} GRN${openGrns === 1 ? "" : "s"} awaiting finance post`,
      subtitle: "Physical received, needs finance unlock",
      href: "/app/grn",
      icon: PackagePlus,
    });
  }
  if ((pendingGatePasses ?? 0) > 0) {
    tasks.push({
      tone: "blue",
      title: `${pendingGatePasses} gate pass${pendingGatePasses === 1 ? "" : "es"} pending approval`,
      subtitle: "Manager sign-off required before load-out",
      href: "/app/gate-passes",
      icon: Truck,
    });
  }
  if ((activePicklists ?? 0) > 0) {
    tasks.push({
      tone: "mint",
      title: `${activePicklists} active picklist${activePicklists === 1 ? "" : "s"}`,
      subtitle: "FEFO pick → gate pass → load-in",
      href: "/app/picklists",
      icon: ClipboardList,
    });
  }
  if ((pendingWriteOffs ?? 0) > 0) {
    tasks.push({
      tone: "peach",
      title: `${pendingWriteOffs} write-off${pendingWriteOffs === 1 ? "" : "s"} pending`,
      subtitle: "Awaiting admin / manager approval",
      href: "/app/write-offs",
      icon: Trash2,
    });
  }
  if (can(role, "approveUsers") && (pendingUsers ?? 0) > 0) {
    tasks.push({
      tone: "purple",
      title: `${pendingUsers} user${pendingUsers === 1 ? "" : "s"} awaiting approval`,
      subtitle: "Assign a role to unlock portal access",
      href: "/app/admin/users",
      icon: UserCheck,
    });
  }
  if (tasks.length === 0) {
    tasks.push({
      tone: "mint",
      title: "All caught up",
      subtitle: "No pending approvals right now",
      href: "/app",
      icon: Gift,
    });
  }

  return (
    <div>
      <PageHeader
        title="Performance Summary"
        description={`Welcome back${profile?.full_name ? `, ${profile.full_name}` : ""}. Warehouse ops for Naeem & Sons.`}
        actions={
          <>
            <Link
              href="/app/grn/new"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-ink)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-dark)]"
            >
              + New GRN
            </Link>
            <Link
              href="/app/admin/imports"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
            >
              Import Data
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          featured
          label="Stock Value (posted)"
          value={can(role, "viewFinancialStock") ? `Rs ${Math.round(stockValue).toLocaleString()}` : "Restricted"}
          trend={can(role, "viewFinancialStock") ? "↑ Live" : undefined}
        />
        <StatCard
          label="Open GRNs"
          value={openGrns ?? 0}
          trend={openGrns ? `${openGrns} pending finance` : "All posted"}
          trendTone={openGrns ? "warning" : "success"}
          href="/app/grn"
        />
        <StatCard
          label="Active Picklists"
          value={activePicklists ?? 0}
          trend="In the pipeline"
          href="/app/picklists"
        />
        <StatCard
          label="Pending Approvals"
          value={(pendingGatePasses ?? 0) + (pendingUsers ?? 0)}
          trend={pendingGatePasses ? `${pendingGatePasses} gate pass` : "On hold: 0"}
          trendTone={pendingGatePasses ? "warning" : "success"}
          href="/app/gate-passes"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <ActivityChart series={series} unit="units dispatched" />
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--ink)]">Tasks &amp; Reports</h2>
            <Link
              href="/app/grn/new"
              className="text-xs font-semibold text-[var(--brand)] hover:underline"
            >
              + New
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {tasks.map((task, i) => {
              const Icon = task.icon;
              return (
                <Link
                  key={i}
                  href={task.href}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:brightness-[0.98]"
                  style={{
                    backgroundColor:
                      task.tone === "purple"
                        ? "var(--pill-purple-bg)"
                        : task.tone === "blue"
                          ? "var(--pill-blue-bg)"
                          : task.tone === "mint"
                            ? "var(--pill-mint-bg)"
                            : "var(--pill-peach-bg)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={
                        task.tone === "purple"
                          ? "h-4 w-4 shrink-0 text-[var(--pill-purple-fg)]"
                          : task.tone === "blue"
                            ? "h-4 w-4 shrink-0 text-[var(--pill-blue-fg)]"
                            : task.tone === "mint"
                              ? "h-4 w-4 shrink-0 text-[var(--pill-mint-fg)]"
                              : "h-4 w-4 shrink-0 text-[var(--pill-peach-fg)]"
                      }
                    />
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{task.title}</p>
                      <p className="text-xs text-[var(--ink-muted)]">{task.subtitle}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--ink)]">Recent Collections</h2>
            <Link href="/app/cash-collections" className="text-xs font-semibold text-[var(--brand)] hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-3">
            <Table>
              <thead>
                <tr>
                  <Th>Collection</Th>
                  <Th>Customer</Th>
                  <Th>Method</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {collections.map((c) => {
                  const total = c.cash_collection_payments.reduce((s, p) => s + Number(p.amount), 0);
                  const methods = [...new Set(c.cash_collection_payments.map((p) => p.method))];
                  const posted = Boolean(c.collected_at);
                  return (
                    <tr key={c.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Avatar name={c.customer?.name ?? c.collection_no} size="sm" />
                          <span className="font-medium">{c.collection_no}</span>
                        </div>
                      </Td>
                      <Td className="text-[var(--ink-muted)]">{c.customer?.code ?? "—"}</Td>
                      <Td className="capitalize text-[var(--ink-muted)]">{methods.join(", ") || "—"}</Td>
                      <Td className="font-semibold">Rs {total.toLocaleString()}</Td>
                      <Td>
                        <Badge tone={posted ? "success" : "pending"}>
                          {posted ? "Completed" : "Pending"}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
                {collections.length === 0 ? (
                  <tr>
                    <Td colSpan={5} className="text-center text-[var(--ink-muted)]">
                      No collections yet.
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Collections MTD
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
            Rs {Math.round(mtdTotal).toLocaleString()}
          </p>
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <MiniCalendar />
          </div>
        </Card>
      </div>
    </div>
  );
}
