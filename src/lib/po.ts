export type PoStatus = "draft" | "pending" | "partial" | "received" | "cancelled";
export type PoUom = "pcs" | "pack" | "carton";

export type PoLineInput = {
  sku_id: string;
  uom: PoUom;
  qty_ordered: number;
  unit_price: number;
};

/** Convert ordered qty in UOM to base stock units (packs). pcs ≈ pack for v1. */
export function uomToUnits(qty: number, uom: PoUom, packsPerCarton: number): number {
  const ppc = packsPerCarton > 0 ? packsPerCarton : 1;
  if (uom === "carton") return qty * ppc;
  // pcs and pack both map 1:1 to stock units for v1
  return qty;
}

export function remainingUnits(line: {
  qty_ordered_units: number;
  qty_received_units: number;
}) {
  return Math.max(0, Number(line.qty_ordered_units) - Number(line.qty_received_units));
}

export function derivePoStatus(
  lines: { qty_ordered_units: number; qty_received_units: number }[],
  current: PoStatus,
): PoStatus {
  if (current === "cancelled") return "cancelled";
  if (!lines.length) return current === "draft" ? "draft" : "pending";

  const anyReceived = lines.some((l) => Number(l.qty_received_units) > 0);
  const allReceived = lines.every(
    (l) => Number(l.qty_received_units) >= Number(l.qty_ordered_units),
  );

  if (allReceived) return "received";
  if (anyReceived) return "partial";
  return current === "draft" ? "draft" : "pending";
}
