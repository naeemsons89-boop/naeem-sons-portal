export function companyHeader() {
  return {
    name: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Naeem & Sons",
    address:
      process.env.NEXT_PUBLIC_COMPANY_ADDRESS ??
      "17B Small Industrial Estate Behind Allied Bank, Sahiwal, Pakistan",
    phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? "03006931889",
  };
}

export function printStyles() {
  return `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Source Sans 3", Arial, sans-serif;
      color: #14201c;
      font-size: 12px;
      margin: 0;
      background: #fff;
    }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 16px 0 8px; }
    .muted { color: #5b6b64; }
    .header { display:flex; justify-content:space-between; gap:16px; border-bottom:2px solid #0f6b4c; padding-bottom:10px; margin-bottom:12px; }
    .brand { color:#0f6b4c; font-weight:700; font-size:22px; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th, td { border:1px solid #d5cec0; padding:6px 8px; text-align:left; vertical-align:top; }
    th { background:#ebe7de; font-size:11px; text-transform:uppercase; }
    .meta { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; margin:10px 0; }
    .signs { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:16px; margin-top:36px; }
    .sign { border-top:1px solid #14201c; padding-top:6px; min-height:70px; }
    .sign strong { display:block; margin-bottom:28px; }
    .no-print { margin: 12px 0; }
    @media print {
      .no-print { display:none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}
