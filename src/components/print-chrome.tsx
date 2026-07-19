"use client";

import { companyHeader, printStyles } from "@/lib/print";

export function PrintChrome({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children: React.ReactNode;
}) {
  const company = companyHeader();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles() }} />
      <div className="no-print" style={{ padding: "12px 16px", display: "flex", gap: 12 }}>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            background: "#0f6b4c",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: "8px 14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Print / Save PDF
        </button>
        <a href={backHref} style={{ alignSelf: "center", color: "#0f6b4c", fontWeight: 600 }}>
          ← Back
        </a>
      </div>
      <div style={{ padding: "0 16px 24px", maxWidth: 900, margin: "0 auto" }}>
        <div className="header">
          <div>
            <div className="brand">{company.name}</div>
            <div className="muted">{company.address}</div>
            <div className="muted">Tel: {company.phone}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h1>{title}</h1>
            <div className="muted">Asia/Karachi</div>
          </div>
        </div>
        {children}
        <div className="signs">
          <div className="sign">
            <strong>Prepared by</strong>
            Name / Sign
          </div>
          <div className="sign">
            <strong>Checked by</strong>
            Name / Sign
          </div>
          <div className="sign">
            <strong>Approved by</strong>
            Name / Sign
          </div>
          <div className="sign">
            <strong>Received / Security</strong>
            Name / Sign
          </div>
        </div>
      </div>
    </>
  );
}
