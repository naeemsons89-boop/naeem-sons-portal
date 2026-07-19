import { casesToUnits } from "@/lib/utils";

export type GrnHeader = {
  id: string;
  grn_no: string;
  supplier_id: string | null;
  warehouse_id: string;
  supplier_delivery_no: string | null;
  delivery_date: string;
  truck_no: string | null;
  transporter_name: string | null;
  remarks: string | null;
  status: string;
  physical_posted_at: string | null;
  finance_status: "pending" | "posted";
  finance_posted_at: string | null;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  invoice_tax_amount: number | null;
  invoice_discount_amount: number | null;
  invoice_total_amount: number | null;
  created_at: string;
};

export type GrnLine = {
  id: string;
  grn_id: string;
  line_no: number;
  sku_id: string;
  batch_id: string | null;
  batch_code: string | null;
  mfg_date: string | null;
  expiry_date: string | null;
  qty_cases: number | null;
  qty_units: number;
  shortage_units: number;
  damage_units: number;
  purchase_price_pack: number | null;
  purchase_price_ctn: number | null;
  line_amount: number | null;
  finance_status: "pending" | "posted";
  bin_id: string | null;
  sku?: {
    product_code: string;
    description: string;
    barcode: string | null;
    packs_per_carton: number;
    purchase_price_pack: number | null;
    purchase_price_ctn: number | null;
    default_shelf_life_days: number | null;
  };
};

export type GrnLineInput = {
  sku_id: string;
  batch_code: string;
  mfg_date?: string | null;
  expiry_date?: string | null;
  qty_cases?: number;
  qty_units?: number;
  shortage_units?: number;
  damage_units?: number;
  purchase_price_pack?: number | null;
  purchase_price_ctn?: number | null;
  packs_per_carton?: number;
};

export function lineUnits(line: {
  qty_cases?: number | null;
  qty_units?: number | null;
  packs_per_carton?: number;
}) {
  const ppc = line.packs_per_carton && line.packs_per_carton > 0 ? line.packs_per_carton : 1;
  const cases = Number(line.qty_cases ?? 0);
  const units = Number(line.qty_units ?? 0);
  // If both provided, treat qty_units as loose units on top of cases
  return casesToUnits(cases, ppc, units);
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
