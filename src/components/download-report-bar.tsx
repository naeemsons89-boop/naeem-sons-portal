"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, Input, Label } from "@/components/ui";

function karachiToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

function karachiDaysAgo(days: number) {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }),
  );
  now.setDate(now.getDate() - days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildHref(args: {
  reportType: string;
  documentType?: string;
  hideDates?: boolean;
  from: string;
  to: string;
}) {
  const params = new URLSearchParams({
    type: args.reportType,
    format: "csv",
  });
  if (!args.hideDates) {
    if (args.from) params.set("from", args.from);
    if (args.to) params.set("to", args.to);
  }
  if (args.documentType) params.set("document_type", args.documentType);
  return `/api/reports?${params.toString()}`;
}

export function DownloadReportBar({
  reportType,
  canExport,
  documentType,
  hideDates = false,
  title = "Download report",
}: {
  reportType: string;
  canExport: boolean;
  documentType?: string;
  hideDates?: boolean;
  title?: string;
}) {
  const defaults = useMemo(
    () => ({ from: karachiDaysAgo(30), to: karachiToday() }),
    [],
  );
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!canExport) return null;

  function downloadNow(nextFrom = from, nextTo = to) {
    const href = buildHref({
      reportType,
      documentType,
      hideDates,
      from: nextFrom,
      to: nextTo,
    });
    window.location.href = href;
    setOpen(false);
  }

  return (
    <>
      <div className="mb-0">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            if (hideDates) {
              downloadNow();
              return;
            }
            setOpen(true);
          }}
        >
          {title}
        </Button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="download-report-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-panel)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="download-report-title"
              className="text-lg font-semibold text-[var(--ink)]"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Choose a date range, then download the CSV.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <Label>To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => downloadNow()}>
                Download CSV
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
