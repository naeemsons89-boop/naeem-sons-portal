import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-50",
        size === "sm" && "px-3.5 py-1.5 text-xs",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-6 py-3 text-base",
        variant === "primary" &&
          "bg-[var(--brand-ink)] text-white shadow-sm hover:bg-[var(--brand-dark)]",
        variant === "secondary" &&
          "border border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--surface-2)]",
        variant === "danger" && "bg-[var(--danger)] text-white hover:bg-red-800",
        variant === "ghost" && "text-[var(--ink-muted)] hover:bg-[var(--surface-2)]",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--brand)] placeholder:text-[var(--ink-muted)] focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1 block text-sm font-medium text-[var(--ink)]", className)}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-[var(--ink-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function TextLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("font-medium text-[var(--brand)] hover:underline", className)}
    >
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------------------- */
/* Dashboard / design-system primitives                                    */
/* ---------------------------------------------------------------------- */

export type PillTone =
  | "purple"
  | "blue"
  | "mint"
  | "peach"
  | "success"
  | "warning"
  | "pending"
  | "danger"
  | "neutral";

const pillToneClasses: Record<PillTone, string> = {
  purple: "bg-[var(--pill-purple-bg)] text-[var(--pill-purple-fg)]",
  blue: "bg-[var(--pill-blue-bg)] text-[var(--pill-blue-fg)]",
  mint: "bg-[var(--pill-mint-bg)] text-[var(--pill-mint-fg)]",
  peach: "bg-[var(--pill-peach-bg)] text-[var(--pill-peach-fg)]",
  success: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]",
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  neutral: "bg-[var(--surface-2)] text-[var(--ink-muted)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        pillToneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Maps common domain statuses to a sensible pill tone. */
export function statusTone(status: string | null | undefined): PillTone {
  const s = (status ?? "").toLowerCase();
  if (["posted", "approved", "completed", "done", "active", "good"].includes(s))
    return "success";
  if (["pending", "draft", "hold", "waiting"].includes(s)) return "pending";
  if (["in_progress", "in progress", "picking", "loaded", "review"].includes(s))
    return "warning";
  if (["rejected", "damaged", "cancelled", "suspended"].includes(s)) return "danger";
  return "neutral";
}

export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

  const sizeClasses =
    size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "Avatar"}
        className={cn("rounded-full object-cover", sizeClasses, className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-[var(--brand-soft)] font-bold text-[var(--brand-dark)]",
        sizeClasses,
        className,
      )}
    >
      {initials}
    </div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]/70",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] p-1",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            value === opt.value
              ? "bg-[var(--brand-ink)] text-white shadow-sm"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  trend,
  trendTone = "success",
  featured = false,
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  trend?: string;
  trendTone?: "success" | "warning" | "danger";
  featured?: boolean;
  href?: string;
  className?: string;
}) {
  const trendClasses =
    trendTone === "success"
      ? "bg-white/15 text-white"
      : trendTone === "warning"
        ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
        : "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]";

  const content = (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-3 rounded-2xl p-5 shadow-[var(--shadow-card)]",
        featured
          ? "bg-[var(--brand-ink)] text-white"
          : "border border-[var(--line)] bg-white text-[var(--ink)]",
        className,
      )}
    >
      <p
        className={cn(
          "text-[11px] font-bold uppercase tracking-wide",
          featured ? "text-white/70" : "text-[var(--ink-muted)]",
        )}
      >
        {label}
      </p>
      <p className="font-[family-name:var(--font-display)] text-2xl font-bold sm:text-[26px]">
        {value}
      </p>
      {trend ? (
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            featured
              ? trendClasses
              : trendTone === "success"
                ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                : trendTone === "warning"
                  ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
                  : "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
          )}
        >
          {trend}
        </span>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }
  return content;
}

export function Table({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-[var(--line)] py-2.5 pr-4 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("border-b border-[var(--line)] py-3 pr-4", className)} {...props}>
      {children}
    </td>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--ink-muted)]">
      {children}
    </p>
  );
}
