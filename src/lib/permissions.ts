import type { AppRole } from "@/types/database";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  warehouse_manager: "Warehouse Manager",
  warehouse_operator: "Warehouse Operator",
  sales_office: "Sales / Office",
  viewer: "Viewer",
};

export const ALL_ROLES: AppRole[] = [
  "admin",
  "warehouse_manager",
  "warehouse_operator",
  "sales_office",
  "viewer",
];

/** Permission matrix for UI gating */
export const permissions = {
  approveUsers: ["admin"] as AppRole[],
  manageMasters: ["admin", "warehouse_manager", "sales_office"] as AppRole[],
  manageWarehouseStructure: ["admin", "warehouse_manager"] as AppRole[],
  createPo: ["admin", "warehouse_manager", "sales_office"] as AppRole[],
  editPo: ["admin", "warehouse_manager", "sales_office"] as AppRole[],
  physicalReceive: [
    "admin",
    "warehouse_manager",
    "warehouse_operator",
  ] as AppRole[],
  postFinance: ["admin", "warehouse_manager"] as AppRole[],
  createPicklist: ["admin", "warehouse_manager", "sales_office"] as AppRole[],
  scanPick: ["admin", "warehouse_manager", "warehouse_operator"] as AppRole[],
  approveGatePass: ["admin", "warehouse_manager"] as AppRole[],
  returns: [
    "admin",
    "warehouse_manager",
    "warehouse_operator",
    "sales_office",
  ] as AppRole[],
  focExchange: ["admin", "warehouse_manager", "sales_office"] as AppRole[],
  approveUnknownBatch: ["admin", "warehouse_manager"] as AppRole[],
  cashCollection: ["admin", "warehouse_manager", "sales_office"] as AppRole[],
  csvUpload: ["admin"] as AppRole[],
  exportPdfCsv: ["admin", "warehouse_manager"] as AppRole[],
  writeOff: ["admin", "warehouse_manager"] as AppRole[],
  viewReports: [
    "admin",
    "warehouse_manager",
    "sales_office",
    "viewer",
  ] as AppRole[],
  viewFinancialStock: ["admin", "warehouse_manager"] as AppRole[],
};

export function can(role: AppRole | null | undefined, key: keyof typeof permissions) {
  if (!role) return false;
  return permissions[key].includes(role);
}
