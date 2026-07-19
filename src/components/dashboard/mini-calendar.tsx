"use client";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function MiniCalendar({ month = new Date() }: { month?: Date }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === monthIndex;

  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--ink)]">{monthLabel}</p>
      </div>
      <div className="grid grid-cols-7 gap-y-1.5 text-center text-[11px]">
        {WEEKDAYS.map((d) => (
          <span key={d} className="font-semibold text-[var(--ink-muted)]">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          const isToday = isCurrentMonth && day === today.getDate();
          return (
            <span
              key={i}
              className={
                day == null
                  ? ""
                  : isToday
                    ? "mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-ink)] font-bold text-white"
                    : "mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[var(--ink)]"
              }
            >
              {day ?? ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
