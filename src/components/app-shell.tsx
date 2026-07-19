"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  FileBarChart2,
  Gift,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  ScanBarcode,
  Settings,
  SlidersHorizontal,
  Trash2,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  BookOpen,
} from "lucide-react";

import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AppRole, Profile } from "@/types/database";

const nav = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/scan", label: "Scan", icon: ScanBarcode, mobile: true },
  { href: "/app/grn", label: "GRN Inward", icon: PackagePlus },
  { href: "/app/picklists", label: "Picklists", icon: ClipboardList },
  { href: "/app/gate-passes", label: "Gate Passes", icon: Truck },
  { href: "/app/returns", label: "Returns", icon: Undo2 },
  { href: "/app/foc", label: "FOC", icon: Gift },
  { href: "/app/exchanges", label: "Exchange", icon: ArrowLeftRight },
  { href: "/app/cash-collections", label: "Collections", icon: Wallet },
  { href: "/app/write-offs", label: "Write-off", icon: Trash2, writeOffOnly: true },
  { href: "/app/stock-ops", label: "Adjust / Transfer", icon: SlidersHorizontal, writeOffOnly: true },
  { href: "/app/stock", label: "Stock", icon: Boxes },
  { href: "/app/reports", label: "Reports", icon: FileBarChart2 },
  { href: "/app/masters", label: "Masters", icon: BookOpen },
  { href: "/app/warehouse", label: "Warehouse", icon: Warehouse },
  { href: "/app/admin/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/app/admin/imports", label: "CSV Import", icon: Settings, adminOnly: true },
];

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const role = profile.role as AppRole | null;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = nav.filter((item) => {
    if (item.adminOnly) return can(role, "approveUsers") || can(role, "csvUpload");
    if ("writeOffOnly" in item && item.writeOffOnly) return can(role, "writeOff");
    return true;
  });

  // Print routes: full-page document without chrome
  if (pathname.startsWith("/app/print")) {
    return <div className="min-h-screen bg-white">{children}</div>;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-[var(--line)] bg-[var(--surface)] lg:flex lg:flex-col">
        <div className="border-b border-[var(--line)] px-5 py-5">
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--brand)]">
            Naeem & Sons
          </p>
          <p className="mt-1 truncate text-xs text-[var(--ink-muted)]">
            {profile.full_name ?? profile.email}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            {role?.replaceAll("_", " ") ?? "no role"}
          </p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/app"
                ? pathname === "/app"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-[var(--brand-soft)] text-[var(--brand-dark)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--line)] p-3">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur lg:hidden">
          <div>
            <p className="font-[family-name:var(--font-display)] font-bold text-[var(--brand)]">
              Naeem & Sons
            </p>
            <p className="text-xs text-[var(--ink-muted)]">
              {role?.replaceAll("_", " ")}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold"
          >
            Sign out
          </button>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--line)] bg-[var(--surface)] px-1 py-2 lg:hidden">
          {[
            { href: "/app", label: "Home", icon: LayoutDashboard },
            { href: "/app/scan", label: "Scan", icon: ScanBarcode },
            { href: "/app/grn", label: "GRN", icon: PackagePlus },
            { href: "/app/picklists", label: "Pick", icon: ClipboardList },
            { href: "/app/stock", label: "Stock", icon: Boxes },
          ].map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/app"
                ? pathname === "/app"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-semibold",
                  active ? "text-[var(--brand)]" : "text-[var(--ink-muted)]",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
