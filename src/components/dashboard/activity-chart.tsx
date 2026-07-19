"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

import { SegmentedControl } from "@/components/ui";

export type ActivityPoint = {
  label: string;
  value: number;
};

export type ActivitySeries = {
  day: ActivityPoint[];
  week: ActivityPoint[];
  month: ActivityPoint[];
  year: ActivityPoint[];
};

const PERIODS: Array<{ value: keyof ActivitySeries; label: string }> = [
  { value: "day", label: "1 Day" },
  { value: "week", label: "1 Week" },
  { value: "month", label: "1 Month" },
  { value: "year", label: "1 Year" },
];

function CustomTooltip({
  active,
  payload,
  max,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  max: number;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="rounded-lg bg-[var(--brand-ink)] px-3 py-1.5 text-xs font-bold text-white shadow-lg">
      {pct}%
      <span className="ml-1 font-medium text-white/70">({value})</span>
    </div>
  );
}

export function ActivityChart({
  series,
  unit = "units",
}: {
  series: ActivitySeries;
  unit?: string;
}) {
  const [period, setPeriod] = useState<keyof ActivitySeries>("week");
  const data = series[period];

  const max = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data]);
  const peakIndex = useMemo(() => {
    let idx = 0;
    let best = -Infinity;
    data.forEach((d, i) => {
      if (d.value > best) {
        best = d.value;
        idx = i;
      }
    });
    return idx;
  }, [data]);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Sales summary
          </p>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink)]">
            {total.toLocaleString()} {unit}
          </p>
        </div>
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
      </div>

      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--ink-muted)", fontSize: 12, fontWeight: 600 }}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={<CustomTooltip max={max} />}
            />
            <Bar dataKey="value" radius={[8, 8, 8, 8]} maxBarSize={36}>
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fill={index === peakIndex ? "var(--brand-ink)" : "var(--brand-soft)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
