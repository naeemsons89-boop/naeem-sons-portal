export type ImportKind = "skus" | "opening_stock" | "customer_openings";

export type ImportFormat = {
  kind: ImportKind;
  label: string;
  fileName: string;
  columns: string[];
  /** Optional sample row so the sheet is easier to fill in Excel */
  sample?: string[];
};

export const IMPORT_FORMATS: Record<ImportKind, ImportFormat> = {
  skus: {
    kind: "skus",
    label: "SKU / price list",
    fileName: "sku-price-list-template.xlsx",
    columns: [
      "product_code",
      "description",
      "barcode",
      "packs_per_carton",
      "gm_per_pack",
      "price_point",
      "purchase_price_pack",
      "sale_price_pack",
      "purchase_price_ctn",
      "sale_price_ctn",
      "default_shelf_life_days",
      "brand",
    ],
    sample: [
      "46204",
      "Sample Product Name",
      "1234567890123",
      "24",
      "50",
      "100",
      "80",
      "100",
      "1920",
      "2400",
      "365",
      "BrandName",
    ],
  },
  opening_stock: {
    kind: "opening_stock",
    label: "Opening inventory + pricing",
    fileName: "opening-inventory-template.xlsx",
    columns: [
      "product_code",
      "batch_code",
      "mfg_date",
      "expiry_date",
      "qty_units",
      "condition",
      "purchase_price_pack",
      "warehouse_code",
      "bin_code",
    ],
    sample: [
      "46204",
      "BATCH-001",
      "2025-01-15",
      "2026-01-15",
      "100",
      "good",
      "80",
      "MAIN_WHS",
      "",
    ],
  },
  customer_openings: {
    kind: "customer_openings",
    label: "Customer opening balances",
    fileName: "customer-openings-template.xlsx",
    columns: [
      "customer_code",
      "customer_name",
      "address",
      "phone",
      "opening_balance",
      "route_code",
    ],
    sample: [
      "C-001",
      "Sample Customer",
      "Shop address",
      "03001234567",
      "5000",
      "R1",
    ],
  },
};
