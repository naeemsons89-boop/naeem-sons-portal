"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button, Card, Input, Label } from "@/components/ui";

type ReportDef = {
  id: string;
  title: string;
  description: string;
  group: "Inventory" | "Documents" | "Finance" | "Masters";
  needsDates?: boolean;
  needsQuery?: boolean;
  queryLabel?: string;
  queryPlaceholder?: string;
};

const REPORTS: ReportDef[] = [
  {
    id: "stock",
    title: "Stock & value",
    description: "Every on-hand balance with SKU, batch, bin, warehouse, and values.",
    group: "Inventory",
  },
  {
    id: "movements",
    title: "Stock movements",
    description: "Full movement ledger with actor user id, name, email, and timestamp.",
    group: "Inventory",
    needsDates: true,
  },
  {
    id: "recall",
    title: "Batch recall",
    description: "Batch match, on-hand, full trail, and customer distribution with actors.",
    group: "Inventory",
    needsQuery: true,
    queryLabel: "Batch / barcode / SKU",
    queryPlaceholder: "Enter batch code or barcode",
  },
  {
    id: "sales",
    title: "Sales (picked lines)",
    description: "Picked picklist lines with customers, routes, load actors, and amounts.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "po",
    title: "Purchase orders",
    description: "PO header + every line, supplier, warehouse, and created-by user.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "grn",
    title: "GRN",
    description: "GRN header + lines with physical/finance post actors and timestamps.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "picklists",
    title: "Picklists",
    description: "All picklist lines with customers, batches, load-out/in actors.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "gate_passes",
    title: "Gate passes",
    description: "Gate-pass lines with issue/approve/security actors and batch detail.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "returns",
    title: "Returns",
    description: "Return lines with reason, batch, posted/created users and times.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "write_offs",
    title: "Write-offs",
    description: "Write-off lines with reason, condition, and posted/created actors.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "exchanges",
    title: "Exchanges",
    description: "Exchange in/out lines with customer, reason, and actor detail.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "foc",
    title: "FOC issues",
    description: "FOC lines with customer, picklist link, and posted/created actors.",
    group: "Documents",
    needsDates: true,
  },
  {
    id: "cash_collections",
    title: "Cash collections",
    description: "Every payment line with collector user, method, refs, and proofs.",
    group: "Finance",
    needsDates: true,
  },
  {
    id: "sale_ledger",
    title: "Sale ledger",
    description: "Customer ledger entries with links, signed amounts, and created-by.",
    group: "Finance",
    needsDates: true,
  },
  {
    id: "skus",
    title: "SKU master",
    description: "Full SKU catalog with brand, category, prices, and timestamps.",
    group: "Masters",
  },
  {
    id: "customers",
    title: "Customers",
    description: "Customer master with route, opening balance, and contact fields.",
    group: "Masters",
  },
  {
    id: "suppliers",
    title: "Suppliers",
    description: "Supplier master with codes, contact, and active status.",
    group: "Masters",
  },
];

const GROUPS: ReportDef["group"][] = ["Inventory", "Documents", "Finance", "Masters"];

function karachiToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

function karachiDaysAgo(days: number) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  now.setDate(now.getDate() - days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ReportsClient({ canExport }: { canExport: boolean }) {
  const defaults = useMemo(
    () => ({ from: karachiDaysAgo(30), to: karachiToday() }),
    [],
  );
  const [filter, setFilter] = useState("");
  const [fromByReport, setFromByReport] = useState<Record<string, string>>({});
  const [toByReport, setToByReport] = useState<Record<string, string>>({});
  const [qByReport, setQByReport] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const s = filter.trim().toLowerCase();
    if (!s) return REPORTS;
    return REPORTS.filter(
      (r) =>
        r.title.toLowerCase().includes(s) ||
        r.description.toLowerCase().includes(s) ||
        r.group.toLowerCase().includes(s),
    );
  }, [filter]);

  function getFrom(id: string) {
    return fromByReport[id] ?? defaults.from;
  }

  function getTo(id: string) {
    return toByReport[id] ?? defaults.to;
  }

  function getQ(id: string) {
    return qByReport[id] ?? "";
  }

  function download(report: ReportDef) {
    if (!canExport) return;
    if (report.needsQuery && !getQ(report.id).trim()) {
      setError(`Enter ${report.queryLabel ?? "a search value"} for ${report.title}.`);
      return;
    }
    setError(null);
    setBusyId(report.id);
    const params = new URLSearchParams({ type: report.id, format: "csv" });
    if (report.needsDates) {
      const from = getFrom(report.id);
      const to = getTo(report.id);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    if (report.needsQuery) params.set("q", getQ(report.id).trim());
    window.location.href = `/api/reports?${params}`;
    window.setTimeout(() => setBusyId(null), 1200);
  }

  if (!canExport) {
    return (
      <Card>
        <p className="text-sm text-[var(--ink-muted)]">
          You can view this page, but CSV download requires export permission.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-sm text-[var(--ink-muted)]">
            Download deep-detail CSVs for every portal dataset. Each file includes linked
            columns plus user id, name, email, and activity timestamps where available.
          </p>
        </div>
        <div className="w-full sm:max-w-xs">
          <Label>Filter reports</Label>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search report name…"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {GROUPS.map((group) => {
        const items = visible.filter((r) => r.group === group);
        if (!items.length) return null;
        return (
          <section key={group} className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">
              {group}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((report) => (
                <Card key={report.id} className="flex flex-col gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-[var(--ink)]">{report.title}</h3>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{report.description}</p>
                  </div>

                  {report.needsDates ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>From</Label>
                        <Input
                          type="date"
                          value={getFrom(report.id)}
                          onChange={(e) =>
                            setFromByReport((prev) => ({
                              ...prev,
                              [report.id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>To</Label>
                        <Input
                          type="date"
                          value={getTo(report.id)}
                          onChange={(e) =>
                            setToByReport((prev) => ({
                              ...prev,
                              [report.id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  {report.needsQuery ? (
                    <div>
                      <Label>{report.queryLabel}</Label>
                      <Input
                        value={getQ(report.id)}
                        onChange={(e) =>
                          setQByReport((prev) => ({
                            ...prev,
                            [report.id]: e.target.value,
                          }))
                        }
                        placeholder={report.queryPlaceholder}
                      />
                    </div>
                  ) : null}

                  <div className="mt-auto pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === report.id}
                      onClick={() => download(report)}
                      className="w-full sm:w-auto"
                    >
                      <Download className="size-3.5" />
                      {busyId === report.id ? "Preparing…" : "Download CSV"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      {visible.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">No reports match that filter.</p>
      ) : null}
    </div>
  );
}
