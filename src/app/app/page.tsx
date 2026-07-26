import {
  Boxes,
  ClipboardList,
  CreditCard,
  FileBarChart2,
  Gift,
  PackagePlus,
  Trash2,
  Truck,
  UserCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import type { ActivitySeries } from "@/components/dashboard/activity-chart";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import {
  DashMetric,
  DashPanel,
  DashSection,
  DashTaskLink,
} from "@/components/dashboard/dash-tiles";
import { MiniCalendar } from "@/components/dashboard/mini-calendar";
import {
  Avatar,
  Badge,
  PageHeader,
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
    return {
      key: d.toDateString(),
      label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1),
      value: 0,
    };
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
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      value: 0,
    };
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

function money(n: number) {
  return `Rs ${Math.round(n).toLocaleString()}`;
}

export default async function DashboardPage() {
  const { profile } = await getSessionProfile();
  const role = profile?.role as AppRole | null;
  const supabase = await createClient();

  const yearAgo = new Date();
  yearAgo.setDate(yearAgo.getDate() - 370);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthStartIso = monthStart.toISOString().slice(0, 10);

  const [
    { count: pendingUsers },
    { count: openGrns },
    { count: activePicklists },
    { count: pendingGatePasses },
    { count: pendingWriteOffs },
    movementsRes,
    collectionsRes,
    mtdPaymentsRes,
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
    supabase
      .from("cash_collections")
      .select("collected_at,created_at,cash_collection_payments(amount,method)")
      .or(`collected_at.gte.${monthStartIso},created_at.gte.${monthStart.toISOString()}`)
      .limit(2000),
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

  const mtdCollections = (mtdPaymentsRes.data ?? []) as Array<{
    collected_at: string | null;
    created_at: string;
    cash_collection_payments: Array<{ amount: number; method: string }>;
  }>;
  const now = new Date();
  const mtdPayments = mtdCollections
    .filter((c) => {
      const d = new Date(c.collected_at ?? c.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .flatMap((c) => c.cash_collection_payments ?? []);

  const collectionsMtd = mtdPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const creditMtd = mtdPayments
    .filter((p) => p.method === "credit")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const saleCollectedMtd = collectionsMtd - creditMtd;
  const creditShare =
    collectionsMtd > 0 ? Math.round((creditMtd / collectionsMtd) * 100) : 0;

  const stockRows = (stockRes.data ?? []) as Array<{
    qty_units: number;
    finance_status: string;
    sku: { purchase_price_pack?: number } | null;
  }>;
  const stockValue = stockRows
    .filter((r) => r.finance_status === "posted")
    .reduce(
      (sum, r) => sum + Number(r.qty_units) * Number(r.sku?.purchase_price_pack ?? 0),
      0,
    );

  const pendingApprovals = (pendingGatePasses ?? 0) + (pendingUsers ?? 0);

  type TaskItem = {
    category: "stock" | "sale" | "credit" | "reports";
    title: string;
    subtitle: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  };

  const tasks: TaskItem[] = [];

  if ((openGrns ?? 0) > 0) {
    tasks.push({
      category: "stock",
      title: `${openGrns} GRN${openGrns === 1 ? "" : "s"} awaiting finance`,
      subtitle: "Physical received — unlock picking",
      href: "/app/grn",
      icon: PackagePlus,
    });
  }
  if ((activePicklists ?? 0) > 0) {
    tasks.push({
      category: "sale",
      title: `${activePicklists} active picklist${activePicklists === 1 ? "" : "s"}`,
      subtitle: "Open for picking / dispatch",
      href: "/app/picklists",
      icon: ClipboardList,
    });
  }
  if ((pendingGatePasses ?? 0) > 0) {
    tasks.push({
      category: "reports",
      title: `${pendingGatePasses} gate pass${pendingGatePasses === 1 ? "" : "es"} pending`,
      subtitle: "Manager sign-off before load-out",
      href: "/app/gate-passes",
      icon: Truck,
    });
  }
  if ((pendingWriteOffs ?? 0) > 0) {
    tasks.push({
      category: "stock",
      title: `${pendingWriteOffs} write-off${pendingWriteOffs === 1 ? "" : "s"} pending`,
      subtitle: "Awaiting admin / manager approval",
      href: "/app/write-offs",
      icon: Trash2,
    });
  }
  if (can(role, "approveUsers") && (pendingUsers ?? 0) > 0) {
    tasks.push({
      category: "reports",
      title: `${pendingUsers} user${pendingUsers === 1 ? "" : "s"} awaiting approval`,
      subtitle: "Assign a role to unlock access",
      href: "/app/admin/users",
      icon: UserCheck,
    });
  }
  if (tasks.length === 0) {
    tasks.push({
      category: "reports",
      title: "All caught up",
      subtitle: "No pending approvals right now",
      href: "/app",
      icon: Gift,
    });
  }

  return (
    <div>
      <PageHeader title="Performance Summary" />

      <div className="grid gap-3 lg:grid-cols-2">
        {/* STOCK */}
        <DashSection
          category="stock"
          title="Stock"
          hint="Inventory & inbound"
          delay={40}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <DashMetric
              category="stock"
              label="Stock value"
              value={
                can(role, "viewFinancialStock")
                  ? money(stockValue)
                  : "Restricted"
              }
              trend={can(role, "viewFinancialStock") ? "Posted balances" : "No access"}
              icon={Boxes}
              delay={80}
            />
            <DashMetric
              category="stock"
              label="Open GRNs"
              value={openGrns ?? 0}
              trend={openGrns ? "Pending finance" : "All posted"}
              href="/app/grn"
              icon={PackagePlus}
              delay={120}
            />
            <DashMetric
              category="stock"
              label="Active picklists"
              value={activePicklists ?? 0}
              trend="In the pipeline"
              href="/app/picklists"
              icon={ClipboardList}
              delay={160}
            />
          </div>
        </DashSection>

        {/* SALE */}
        <DashSection
          category="sale"
          title="Sale"
          hint="Collections & dispatch"
          delay={80}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <DashMetric
              category="sale"
              label="Collected MTD"
              value={money(saleCollectedMtd)}
              trend="Cash / online / cheque"
              href="/app/cash-collections"
              icon={Wallet}
              delay={120}
            />
            <DashMetric
              category="sale"
              label="Total collections MTD"
              value={money(collectionsMtd)}
              trend="Including credit lines"
              href="/app/cash-collections"
              icon={Wallet}
              delay={160}
            />
          </div>
        </DashSection>

        {/* CREDIT */}
        <DashSection
          category="credit"
          title="Credit"
          hint="On-account this month"
          delay={120}
        >
          <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr]">
            <DashMetric
              category="credit"
              label="Credit MTD"
              value={money(creditMtd)}
              trend={creditMtd ? "Recorded on credit" : "No credit this month"}
              href="/app/sale-ledger"
              icon={CreditCard}
              delay={160}
            />
            <DashPanel category="credit" delay={200} className="flex flex-col justify-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                Share of collections
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--dash-credit-fg)]">
                {creditShare}%
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--dash-credit-bg)]">
                <div
                  className="h-full rounded-full bg-[var(--dash-credit-fg)] transition-all duration-700"
                  style={{ width: `${Math.min(100, creditShare)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                Credit vs total collections MTD
              </p>
            </DashPanel>
          </div>
        </DashSection>

        {/* REPORTS */}
        <DashSection
          category="reports"
          title="Reports"
          hint="Approvals & follow-ups"
          delay={160}
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr]">
            <DashMetric
              category="reports"
              label="Pending approvals"
              value={pendingApprovals}
              trend={
                pendingGatePasses
                  ? `${pendingGatePasses} gate pass`
                  : "Nothing on hold"
              }
              href="/app/gate-passes"
              icon={FileBarChart2}
              delay={200}
            />
            <div className="space-y-1.5">
              {tasks.slice(0, 3).map((task, i) => (
                <DashTaskLink
                  key={`${task.href}-${i}`}
                  category={task.category}
                  title={task.title}
                  subtitle={task.subtitle}
                  href={task.href}
                  icon={task.icon}
                  delay={220 + i * 40}
                />
              ))}
            </div>
          </div>
        </DashSection>
      </div>

      {/* Sale deep dive */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <DashPanel category="sale" delay={240}>
          <ActivityChart series={series} unit="units dispatched" />
        </DashPanel>

        <DashPanel category="reports" delay={280}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--dash-reports-fg)]">
            This month
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
            {money(collectionsMtd)}
          </p>
          <p className="text-xs text-[var(--ink-muted)]">Collections MTD overview</p>
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <MiniCalendar />
          </div>
        </DashPanel>
      </div>

      <DashSection
        category="sale"
        title="Recent collections"
        hint="Latest receipts"
        delay={300}
        className="mt-3"
      >
        <div className="flex items-center justify-end">
          <Link
            href="/app/cash-collections"
            className="text-xs font-medium text-[var(--dash-sale-fg)] hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-[var(--dash-sale-border)] bg-white/90">
          <Table tableClassName="table-fixed">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr>
                <Th className="text-left">Collection</Th>
                <Th className="text-left">Customer</Th>
                <Th className="text-left">Method</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => {
                const total = c.cash_collection_payments.reduce(
                  (s, p) => s + Number(p.amount),
                  0,
                );
                const methods = [
                  ...new Set(c.cash_collection_payments.map((p) => p.method)),
                ];
                const posted = Boolean(c.collected_at);
                return (
                  <tr key={c.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={c.customer?.name ?? c.collection_no}
                          size="sm"
                        />
                        <span className="font-medium">{c.collection_no}</span>
                      </div>
                    </Td>
                    <Td className="text-[var(--ink-muted)]">
                      {c.customer?.code ?? "—"}
                    </Td>
                    <Td className="capitalize text-[var(--ink-muted)]">
                      {methods.join(", ") || "—"}
                    </Td>
                    <Td className="text-right font-medium tabular-nums">
                      Rs {total.toLocaleString()}
                    </Td>
                    <Td className="text-right">
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
      </DashSection>
    </div>
  );
}
