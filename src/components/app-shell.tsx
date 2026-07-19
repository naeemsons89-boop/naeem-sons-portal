"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  Gift,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Mail,
  PackagePlus,
  ScanBarcode,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

import { Avatar, Badge } from "@/components/ui";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AppRole, Profile } from "@/types/database";

const menuGroup = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/scan", label: "Scan", icon: ScanBarcode, mobile: true },
  { href: "/app/grn", label: "GRN Inward", icon: PackagePlus },
  { href: "/app/picklists", label: "Picklists", icon: ClipboardList },
  { href: "/app/gate-passes", label: "Gate Passes", icon: Truck },
];

const generalGroup = [
  { href: "/app/returns", label: "Returns", icon: Undo2 },
  { href: "/app/foc", label: "FOC", icon: Gift },
  { href: "/app/exchanges", label: "Exchange", icon: ArrowLeftRight },
  { href: "/app/cash-collections", label: "Collections", icon: Wallet },
  { href: "/app/write-offs", label: "Write-off", icon: Trash2, writeOffOnly: true },
  { href: "/app/stock", label: "Stock", icon: Boxes },
  { href: "/app/stock-ops", label: "Adjust / Transfer", icon: SlidersHorizontal, writeOffOnly: true },
  { href: "/app/masters", label: "Masters", icon: LibraryBig },
  { href: "/app/reports", label: "Reports", icon: BarChart3, reportsOnly: true },
  { href: "/app/warehouse", label: "Warehouse", icon: Warehouse },
  { href: "/app/admin/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/app/admin/imports", label: "CSV Import", icon: Settings, adminOnly: true },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
        active
          ? "bg-white text-[var(--brand-ink)] shadow-sm"
          : "text-white/65 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </Link>
  );
}

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
  const [profileOpen, setProfileOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const menuItems = menuGroup;
  const generalItems = generalGroup.filter((item) => {
    if (item.adminOnly) return can(role, "approveUsers") || can(role, "csvUpload");
    if ("writeOffOnly" in item && item.writeOffOnly) return can(role, "writeOff");
    if ("reportsOnly" in item && item.reportsOnly) return can(role, "viewReports");
    return true;
  });

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  // Print routes: full-page document without chrome
  if (pathname.startsWith("/app/print")) {
    return <div className="min-h-screen bg-white">{children}</div>;
  }

  const roleLabel = role ? ROLE_LABELS[role] : "No role";
  const displayName = profile.full_name ?? profile.email;

  return (
    <div className="min-h-screen bg-[var(--background)] lg:flex lg:gap-4 lg:p-4">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-[264px] lg:shrink-0 lg:flex-col lg:rounded-3xl lg:bg-[var(--brand-ink)] lg:p-4 lg:shadow-[var(--shadow-panel)]">
        <div className="flex items-center gap-2 px-2 py-2">
          <Image
            src="/images/logo-mark.png"
            alt="Naeem & Sons logo"
            width={36}
            height={36}
            className="h-9 w-9 rounded-xl bg-white object-contain p-1"
          />
          <div>
            <p className="font-[family-name:var(--font-display)] text-[15px] font-bold leading-tight text-white">
              Naeem &amp; Sons
            </p>
            <p className="text-[11px] font-medium text-white/50">Warehouse Portal</p>
          </div>
        </div>

        <nav className="mt-6 flex-1 space-y-6 overflow-y-auto">
          <div>
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
              Menu
            </p>
            <div className="space-y-1">
              {menuItems.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isActive(item.href)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
              General
            </p>
            <div className="space-y-1">
              {generalItems.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isActive(item.href)}
                />
              ))}
            </div>
          </div>
        </nav>

        <Link
          href="/app/profile"
          className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 transition hover:bg-white/[0.1]"
        >
          <Avatar src={profile.avatar_url} name={displayName} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{displayName}</p>
            <p className="truncate text-[11px] font-medium text-white/50">{roleLabel}</p>
          </div>
        </Link>
        <div className="mt-2 flex items-center justify-between px-1">
          <Link
            href="/app/profile"
            className="text-xs font-semibold text-white/70 hover:text-white"
          >
            View Profile &rarr;
          </Link>
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:min-h-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <Image
              src="/images/logo-mark.png"
              alt="Naeem & Sons logo"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg bg-white object-contain p-0.5"
            />
            <div>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-[var(--ink)]">
                Naeem &amp; Sons
              </p>
              <p className="text-[11px] text-[var(--ink-muted)]">{roleLabel}</p>
            </div>
          </div>
          <Link href="/app/profile">
            <Avatar src={profile.avatar_url} name={displayName} size="sm" />
          </Link>
        </header>

        {/* Desktop topbar */}
        <header className="hidden items-center gap-4 px-2 pb-4 pt-1 lg:flex">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input
              type="search"
              placeholder="Search task"
              className="w-full rounded-full border border-[var(--line)] bg-white py-2.5 pl-10 pr-4 text-sm outline-none ring-[var(--brand)] placeholder:text-[var(--ink-muted)] focus:ring-2"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="rounded-full border border-[var(--line)] bg-white p-2.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
              title="Messages"
            >
              <Mail className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="relative rounded-full border border-[var(--line)] bg-white p-2.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            </button>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-white py-1.5 pl-1.5 pr-3.5 hover:bg-[var(--surface-2)]"
            >
              <Avatar src={profile.avatar_url} name={displayName} size="sm" />
              <span className="text-left">
                <span className="block text-sm font-semibold leading-tight text-[var(--ink)]">
                  {displayName}
                </span>
                <span className="block text-[11px] leading-tight text-[var(--ink-muted)]">
                  {profile.email}
                </span>
              </span>
            </button>
            {profileOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-48 overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-[var(--shadow-card)]">
                <Link
                  href="/app/profile"
                  onClick={() => setProfileOpen(false)}
                  className="block px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]"
                >
                  View profile
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  className="block w-full px-4 py-2 text-left text-sm font-medium text-[var(--danger)] hover:bg-[var(--surface-2)]"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 sm:px-6 lg:px-2 lg:pb-8">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--line)] bg-[var(--surface)] px-1 py-2 lg:hidden">
          {[
            { href: "/app", label: "Home", icon: LayoutDashboard },
            { href: "/app/scan", label: "Scan", icon: ScanBarcode },
            { href: "/app/grn", label: "GRN", icon: PackagePlus },
            { href: "/app/picklists", label: "Pick", icon: ClipboardList },
            { href: "/app/stock", label: "Stock", icon: Boxes },
          ].map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
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

export function RoleBadge({ role }: { role: AppRole | null }) {
  return <Badge tone="mint">{role ? ROLE_LABELS[role] : "No role"}</Badge>;
}
