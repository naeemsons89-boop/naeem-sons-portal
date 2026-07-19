import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUnitsAsCases(
  units: number,
  packsPerCarton: number,
): { cases: number; units: number; label: string } {
  const ppc = packsPerCarton > 0 ? packsPerCarton : 1;
  const cases = Math.floor(units / ppc);
  const rem = Number((units % ppc).toFixed(3));
  return {
    cases,
    units: rem,
    label: `${cases} C / ${rem} U`,
  };
}

export function casesToUnits(cases: number, packsPerCarton: number, looseUnits = 0) {
  return cases * packsPerCarton + looseUnits;
}
