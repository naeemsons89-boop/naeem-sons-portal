"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAppShell } from "@/components/app-shell-context";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";

export function UserProfileMenu({ className }: { className?: string }) {
  const { profile, displayName, signOut } = useAppShell();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-[var(--line)] bg-white p-0.5 hover:bg-[var(--surface-2)]"
        title={displayName}
        aria-label={displayName}
        aria-expanded={open}
      >
        <Avatar
          src={profile.avatar_url}
          name={displayName}
          size="sm"
        />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-48 overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-[var(--shadow-card)]">
          <p className="truncate border-b border-[var(--line)] px-4 py-2 text-xs text-[var(--ink-muted)]">
            {displayName}
          </p>
          <Link
            href="/app/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]"
          >
            View profile
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="block w-full px-4 py-2 text-left text-sm font-medium text-[var(--danger)] hover:bg-[var(--surface-2)]"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
