import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const company = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Naeem & Sons";

export const metadata: Metadata = {
  title: {
    default: `${company} Portal`,
    template: `%s · ${company}`,
  },
  description:
    "Warehouse distribution portal — GRN, picklist, gate pass, batch traceability, and stock.",
  applicationName: `${company} Portal`,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: company,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f6b4c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${body.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
