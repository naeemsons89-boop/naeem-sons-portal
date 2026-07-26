import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type DashCategory = "stock" | "sale" | "credit" | "reports";

const categoryStyles: Record<
  DashCategory,
  {
    section: string;
    label: string;
    tile: string;
    iconWrap: string;
    accent: string;
  }
> = {
  stock: {
    section: "border-[var(--dash-stock-border)] bg-[var(--dash-stock-bg)]/70",
    label: "text-[var(--dash-stock-fg)]",
    tile: "dash-tile dash-tile-stock border-[var(--dash-stock-border)]/80 bg-white/80",
    iconWrap: "bg-[var(--dash-stock-bg)] text-[var(--dash-stock-fg)]",
    accent: "text-[var(--dash-stock-fg)]",
  },
  sale: {
    section: "border-[var(--dash-sale-border)] bg-[var(--dash-sale-bg)]/70",
    label: "text-[var(--dash-sale-fg)]",
    tile: "dash-tile dash-tile-sale border-[var(--dash-sale-border)]/80 bg-white/80",
    iconWrap: "bg-[var(--dash-sale-bg)] text-[var(--dash-sale-fg)]",
    accent: "text-[var(--dash-sale-fg)]",
  },
  credit: {
    section: "border-[var(--dash-credit-border)] bg-[var(--dash-credit-bg)]/70",
    label: "text-[var(--dash-credit-fg)]",
    tile: "dash-tile dash-tile-credit border-[var(--dash-credit-border)]/80 bg-white/80",
    iconWrap: "bg-[var(--dash-credit-bg)] text-[var(--dash-credit-fg)]",
    accent: "text-[var(--dash-credit-fg)]",
  },
  reports: {
    section: "border-[var(--dash-reports-border)] bg-[var(--dash-reports-bg)]/70",
    label: "text-[var(--dash-reports-fg)]",
    tile: "dash-tile dash-tile-reports border-[var(--dash-reports-border)]/80 bg-white/80",
    iconWrap: "bg-[var(--dash-reports-bg)] text-[var(--dash-reports-fg)]",
    accent: "text-[var(--dash-reports-fg)]",
  },
};

export function DashSection({
  category,
  title,
  hint,
  delay = 0,
  children,
  className,
}: {
  category: DashCategory;
  title: string;
  hint?: string;
  delay?: number;
  children: ReactNode;
  className?: string;
}) {
  const styles = categoryStyles[category];
  return (
    <section
      className={cn(
        "dash-section animate-fade-up rounded-2xl border p-3 sm:p-4",
        styles.section,
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.1em]",
            styles.label,
          )}
        >
          {title}
        </h2>
        {hint ? (
          <p className="text-[11px] text-[var(--ink-muted)]">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function DashMetric({
  category,
  label,
  value,
  trend,
  href,
  icon: Icon,
  delay = 0,
}: {
  category: DashCategory;
  label: string;
  value: ReactNode;
  trend?: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  delay?: number;
}) {
  const styles = categoryStyles[category];
  const body = (
    <div
      className={cn(
        "group flex h-full flex-col justify-between gap-2 rounded-xl border p-3 transition duration-300",
        styles.tile,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-lg transition duration-300 group-hover:scale-110",
              styles.iconWrap,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl",
        )}
      >
        {value}
      </p>
      {trend ? (
        <p className={cn("text-xs font-medium", styles.accent)}>{trend}</p>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full animate-fade-up">
        {body}
      </Link>
    );
  }
  return <div className="h-full animate-fade-up">{body}</div>;
}

export function DashTaskLink({
  category,
  title,
  subtitle,
  href,
  icon: Icon,
  delay = 0,
}: {
  category: DashCategory;
  title: string;
  subtitle: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  delay?: number;
}) {
  const styles = categoryStyles[category];
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-xl border px-2.5 py-2 transition duration-300 animate-fade-up",
        styles.tile,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition duration-300 group-hover:scale-110",
            styles.iconWrap,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--ink)]">{title}</p>
          <p className="truncate text-xs text-[var(--ink-muted)]">{subtitle}</p>
        </div>
      </div>
      <ArrowUpRight
        className={cn(
          "h-4 w-4 shrink-0 transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
          styles.accent,
        )}
      />
    </Link>
  );
}

export function DashPanel({
  category,
  children,
  className,
  delay = 0,
}: {
  category: DashCategory;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const styles = categoryStyles[category];
  return (
    <div
      className={cn(
        "animate-fade-up rounded-xl border bg-white/90 p-3 shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px_rgba(20,32,28,0.18)]",
        category === "stock" && "border-[var(--dash-stock-border)]",
        category === "sale" && "border-[var(--dash-sale-border)]",
        category === "credit" && "border-[var(--dash-credit-border)]",
        category === "reports" && "border-[var(--dash-reports-border)]",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
