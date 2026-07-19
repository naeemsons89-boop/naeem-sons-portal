/** Context-aware document search helpers */

export type DocScope =
  | "all"
  | "grn"
  | "picklist"
  | "gate_pass"
  | "return"
  | "foc"
  | "exchange"
  | "write_off"
  | "cash_collection"
  | "customer"
  | "sku";

export type SearchHit = {
  type: DocScope;
  id: string;
  number: string;
  label: string;
  href: string;
};

export function searchScopeFromPath(pathname: string): DocScope {
  if (pathname.startsWith("/app/grn")) return "grn";
  if (pathname.startsWith("/app/picklists")) return "picklist";
  if (pathname.startsWith("/app/gate-passes")) return "gate_pass";
  if (pathname.startsWith("/app/returns")) return "return";
  if (pathname.startsWith("/app/foc")) return "foc";
  if (pathname.startsWith("/app/exchanges")) return "exchange";
  if (pathname.startsWith("/app/write-offs")) return "write_off";
  if (pathname.startsWith("/app/cash-collections")) return "cash_collection";
  if (pathname.startsWith("/app/masters")) return "customer";
  if (pathname.startsWith("/app/stock")) return "sku";
  return "all";
}

export function searchPlaceholder(scope: DocScope): string {
  switch (scope) {
    case "grn":
      return "Search GRN no / supplier DN…";
    case "picklist":
      return "Search picklist no…";
    case "gate_pass":
      return "Search gate pass no…";
    case "return":
      return "Search return no…";
    case "foc":
      return "Search FOC no…";
    case "exchange":
      return "Search exchange no…";
    case "write_off":
      return "Search write-off no…";
    case "cash_collection":
      return "Search collection no…";
    case "customer":
      return "Search customer code / name…";
    case "sku":
      return "Search SKU / barcode…";
    default:
      return "Search document no…";
  }
}

export function scopeLabel(scope: DocScope): string {
  switch (scope) {
    case "grn":
      return "GRN";
    case "picklist":
      return "Picklist";
    case "gate_pass":
      return "Gate pass";
    case "return":
      return "Return";
    case "foc":
      return "FOC";
    case "exchange":
      return "Exchange";
    case "write_off":
      return "Write-off";
    case "cash_collection":
      return "Collection";
    case "customer":
      return "Customer";
    case "sku":
      return "SKU";
    default:
      return "Document";
  }
}
