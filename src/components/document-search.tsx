"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";

import {
  searchPlaceholder,
  searchScopeFromPath,
  type DocScope,
  type SearchHit,
} from "@/lib/doc-search";
import { cn } from "@/lib/utils";

export function DocumentSearch({
  pathname,
  scope: scopeProp,
  className,
  variant = "topbar",
}: {
  pathname?: string;
  scope?: DocScope;
  className?: string;
  variant?: "topbar" | "page";
}) {
  const router = useRouter();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const scope =
    scopeProp ??
    (pathname ? searchScopeFromPath(pathname) : ("all" as DocScope));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setHits([]);
      setError(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setBusy(true);
        setError(null);
        const res = await fetch(
          `/api/search/documents?scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(term)}`,
        );
        const json = await res.json();
        setBusy(false);
        if (!res.ok) {
          setError(json.error ?? "Search failed");
          setHits([]);
          return;
        }
        setHits(json.results ?? []);
        setActiveIdx(0);
        setOpen(true);
      })();
    }, 220);
    return () => clearTimeout(t);
  }, [q, scope]);

  function go(hit: SearchHit) {
    setOpen(false);
    setQ("");
    router.push(hit.href);
  }

  async function submitExact() {
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    const res = await fetch(
      `/api/search/documents?scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(term)}`,
    );
    const json = await res.json();
    setBusy(false);
    const list = (json.results ?? []) as SearchHit[];
    if (!list.length) {
      setError("No document found");
      setOpen(true);
      return;
    }
    const exact = list.find(
      (h) => h.number.toUpperCase() === term.toUpperCase(),
    );
    go(exact ?? list[0]);
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2",
          variant === "topbar" ? "text-[var(--ink-muted)]" : "text-[var(--ink-muted)]",
        )}
      />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setError(null);
          setOpen(true);
        }}
        onFocus={() => {
          if (hits.length || error) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (hits[activeIdx]) go(hits[activeIdx]);
            else void submitExact();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={searchPlaceholder(scope)}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        className={cn(
          "w-full rounded-full border border-[var(--line)] bg-white py-2.5 pl-10 pr-4 text-sm outline-none ring-[var(--brand)] placeholder:text-[var(--ink-muted)] focus:ring-2",
          variant === "page" && "rounded-xl",
        )}
      />
      {open && (hits.length > 0 || error || busy) ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-auto rounded-xl border border-[var(--line)] bg-white py-1 shadow-[var(--shadow-card)]"
        >
          {busy && hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--ink-muted)]">Searching…</p>
          ) : null}
          {error ? (
            <p className="px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
          ) : null}
          {hits.map((hit, idx) => (
            <button
              key={`${hit.type}-${hit.id}`}
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              className={cn(
                "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]",
                idx === activeIdx && "bg-[var(--brand-soft)]",
              )}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => go(hit)}
            >
              <span className="font-semibold text-[var(--ink)]">{hit.number}</span>
              <span className="text-xs text-[var(--ink-muted)]">{hit.label}</span>
            </button>
          ))}
          {!busy && !error && hits.length === 0 && q.trim() ? (
            <p className="px-3 py-2 text-sm text-[var(--ink-muted)]">No matches</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
