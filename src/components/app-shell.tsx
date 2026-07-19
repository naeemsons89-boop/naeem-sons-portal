"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardList,
  Gift,
  Hammer,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Mail,
  Menu,
  PackagePlus,
  RefreshCw,
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
  X,
} from "lucide-react";

import { Avatar, Badge } from "@/components/ui";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AppRole, Profile } from "@/types/database";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  writeOffOnly?: boolean;
  reportsOnly?: boolean;
};

const topMenu: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
];

const warehouseChildren: NavItem[] = [
  { href: "/app/scan", label: "Scan", icon: ScanBarcode },
  { href: "/app/grn", label: "GRN Inward", icon: PackagePlus },
  { href: "/app/picklists", label: "Picklists", icon: ClipboardList },
  { href: "/app/gate-passes", label: "Gate Passes", icon: Truck },
  { href: "/app/stock", label: "Stock", icon: Boxes },
];

const movementsChildren: NavItem[] = [
  { href: "/app/returns", label: "Returns", icon: Undo2 },
  {
    href: "/app/stock-ops",
    label: "Adjust / Transfer",
    icon: SlidersHorizontal,
    writeOffOnly: true,
  },
  { href: "/app/write-offs", label: "Write-off", icon: Trash2, writeOffOnly: true },
  { href: "/app/exchanges", label: "Exchange", icon: ArrowLeftRight },
  { href: "/app/foc", label: "FOC", icon: Gift },
];

const buildChildren: NavItem[] = [
  { href: "/app/masters", label: "Masters", icon: LibraryBig },
  { href: "/app/warehouse", label: "Racks & Bins", icon: Warehouse },
  { href: "/app/admin/users", label: "Users", icon: Users, adminOnly: true },
];

const generalGroup: NavItem[] = [
  { href: "/app/cash-collections", label: "Collections", icon: Wallet },
  { href: "/app/reports", label: "Reports", icon: BarChart3, reportsOnly: true },
  { href: "/app/admin/imports", label: "CSV Import", icon: Settings, adminOnly: true },
];

function filterNav(items: NavItem[], role: AppRole | null) {
  return items.filter((item) => {
    if (item.adminOnly) return can(role, "approveUsers") || can(role, "csvUpload");
    if (item.writeOffOnly) return can(role, "writeOff");
    if (item.reportsOnly) return can(role, "viewReports");
    return true;
  });
}

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  nested = false,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl text-sm font-semibold transition",
        nested ? "px-3 py-2" : "px-3 py-2.5",
        active
          ? "bg-white text-[var(--brand-ink)] shadow-sm"
          : "text-white/65 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {label}
    </Link>
  );
}

function CollapsibleGroup({
  label,
  icon: Icon,
  open,
  onToggle,
  childActive,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
  childActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
          childActive && !open
            ? "bg-white/10 text-white"
            : "text-white/65 hover:bg-white/[0.06] hover:text-white",
        )}
        aria-expanded={open}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 opacity-70 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-1">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SidebarNav({
  pathname,
  role,
  onNavigate,
}: {
  pathname: string;
  role: AppRole | null;
  onNavigate?: () => void;
}) {
  const menuItems = topMenu;
  const warehouseItems = filterNav(warehouseChildren, role);
  const movementsItems = filterNav(movementsChildren, role);
  const buildItems = filterNav(buildChildren, role);
  const generalItems = filterNav(generalGroup, role);

  const warehouseChildActive = warehouseItems.some((item) =>
    isActive(pathname, item.href),
  );
  const movementsChildActive = movementsItems.some((item) =>
    isActive(pathname, item.href),
  );
  const buildChildActive = buildItems.some((item) => isActive(pathname, item.href));

  const [warehouseOpen, setWarehouseOpen] = useState(warehouseChildActive);
  const [movementsOpen, setMovementsOpen] = useState(movementsChildActive);
  const [buildOpen, setBuildOpen] = useState(buildChildActive);

  useEffect(() => {
    if (warehouseChildActive) setWarehouseOpen(true);
  }, [warehouseChildActive]);
  useEffect(() => {
    if (movementsChildActive) setMovementsOpen(true);
  }, [movementsChildActive]);
  useEffect(() => {
    if (buildChildActive) setBuildOpen(true);
  }, [buildChildActive]);

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto overscroll-contain">
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
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}

          <CollapsibleGroup
            label="Warehouse"
            icon={Warehouse}
            open={warehouseOpen}
            onToggle={() => setWarehouseOpen((o) => !o)}
            childActive={warehouseChildActive}
          >
            {warehouseItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item.href)}
                nested
                onNavigate={onNavigate}
              />
            ))}
          </CollapsibleGroup>

          <CollapsibleGroup
            label="Movements"
            icon={RefreshCw}
            open={movementsOpen}
            onToggle={() => setMovementsOpen((o) => !o)}
            childActive={movementsChildActive}
          >
            {movementsItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item.href)}
                nested
                onNavigate={onNavigate}
              />
            ))}
          </CollapsibleGroup>

          {buildItems.length > 0 ? (
            <CollapsibleGroup
              label="Build"
              icon={Hammer}
              open={buildOpen}
              onToggle={() => setBuildOpen((o) => !o)}
              childActive={buildChildActive}
            >
              {buildItems.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isActive(pathname, item.href)}
                  nested
                  onNavigate={onNavigate}
                />
              ))}
            </CollapsibleGroup>
          ) : null}
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
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </nav>
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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (pathname.startsWith("/app/print")) {
    return <div className="min-h-screen bg-white">{children}</div>;
  }

  const roleLabel = role ? ROLE_LABELS[role] : "No role";
  const displayName = profile.full_name ?? profile.email;

  const bottomItems = [
    { href: "/app", label: "Home", icon: LayoutDashboard },
    { href: "/app/scan", label: "Scan", icon: ScanBarcode },
    { href: "/app/picklists", label: "Pick", icon: ClipboardList },
    { href: "/app/stock", label: "Stock", icon: Boxes },
  ];

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

        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <SidebarNav pathname={pathname} role={role} />
        </div>

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

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          className={cn(
            "absolute inset-0 bg-black/45 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(100%,300px)] flex-col bg-[var(--brand-ink)] p-4 shadow-2xl transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <div className="flex items-center gap-2">
              <Image
                src="/images/logo-mark.png"
                alt="Naeem & Sons logo"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg bg-white object-contain p-0.5"
              />
              <div>
                <p className="font-[family-name:var(--font-display)] text-sm font-bold text-white">
                  Naeem &amp; Sons
                </p>
                <p className="text-[10px] font-medium text-white/50">{roleLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <SidebarNav
              pathname={pathname}
              role={role}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>

          <div className="mt-3 border-t border-white/10 pt-3">
            <Link
              href="/app/profile"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3"
            >
              <Avatar src={profile.avatar_url} name={displayName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                <p className="truncate text-[11px] text-white/50">View profile</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/65 hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>
      </div>

      <div className="flex min-h-screen flex-1 flex-col lg:min-h-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)]/95 px-3 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-xl border border-[var(--line)] bg-white p-2.5 text-[var(--ink)] shadow-sm"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-[family-name:var(--font-display)] text-sm font-bold text-[var(--ink)]">
              Naeem &amp; Sons
            </p>
            <p className="truncate text-[11px] text-[var(--ink-muted)]">{roleLabel}</p>
          </div>
          <Link href="/app/profile" className="shrink-0">
            <Avatar src={profile.avatar_url} name={displayName} size="sm" />
          </Link>
        </header>

        {/* Desktop topbar */}
        <header className="hidden items-center gap-4 px-2 pb-4 pt-1 lg:flex">
          <div className="relative max-w-md flex-1">
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

        {/* Mobile bottom bar — shortcuts + Menu */}
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--surface)]/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden">
          <div className="grid grid-cols-5">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold",
                    active ? "text-[var(--brand)]" : "text-[var(--ink-muted)]",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold",
                mobileOpen ? "text-[var(--brand)]" : "text-[var(--ink-muted)]",
              )}
            >
              <Menu className="h-5 w-5" />
              Menu
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

export function RoleBadge({ role }: { role: AppRole | null }) {
  return <Badge tone="mint">{role ? ROLE_LABELS[role] : "No role"}</Badge>;
}
