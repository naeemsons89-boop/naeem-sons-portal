"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useAppShellOptional } from "@/components/app-shell-context";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { DocumentSearch } from "@/components/document-search";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  actions,
  download,
  className,
}: {
  title: string;
  /** Unused; accepted so old call sites do not break */
  description?: string;
  actions?: ReactNode;
  download?: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const shell = useAppShellOptional();
  const inApp = Boolean(shell) && pathname?.startsWith("/app");

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:gap-3">
        <h1 className="shrink-0 font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl">
          {title}
        </h1>
        {inApp ? (
          <DocumentSearch
            pathname={pathname}
            className="min-w-[10rem] flex-1 basis-[12rem]"
          />
        ) : null}
        {download ? <div className="shrink-0">{download}</div> : null}
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
        {inApp ? <UserProfileMenu className="hidden lg:block" /> : null}
      </div>
    </div>
  );
}
