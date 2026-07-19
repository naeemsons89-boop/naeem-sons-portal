import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  ClipboardCheck,
  PackageSearch,
  ScanBarcode,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui";

const features = [
  {
    icon: Boxes,
    title: "Batch receiving",
    description: "Every GRN is logged by batch and expiry so nothing gets lost in transit.",
  },
  {
    icon: ClipboardCheck,
    title: "FEFO picking",
    description: "Picklists always surface first-expiry stock, cutting shrink and write-offs.",
  },
  {
    icon: ShieldCheck,
    title: "Gate-pass control",
    description: "Every outward carton is authorised, tracked, and reconciled at the gate.",
  },
  {
    icon: ScanBarcode,
    title: "Full traceability",
    description: "Trace any carton from supplier intake to shop delivery in one search.",
  },
];

const stats = [
  { value: "12k+", label: "Cartons tracked / month" },
  { value: "99.4%", label: "Pick accuracy" },
  { value: "3.2x", label: "Faster gate clearance" },
  { value: "24/7", label: "Live warehouse visibility" },
];

const marqueeItems = [
  "Batch Receiving",
  "FEFO Picking",
  "Gate-Pass Outward",
  "Carton Traceability",
  "Finance Unlock",
  "Live Stock Sync",
];

export default function HomePage() {
  const company = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Naeem & Sons";

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--background)]">
      {/* Ambient animated background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="animate-blob absolute -left-32 -top-24 h-[420px] w-[420px] rounded-full bg-[var(--brand)]/15 blur-3xl"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="animate-blob absolute -right-24 top-40 h-[380px] w-[380px] rounded-full bg-[var(--accent)]/15 blur-3xl"
          style={{ animationDelay: "3s" }}
        />
        <div
          className="animate-blob absolute bottom-[-8rem] left-1/3 h-[360px] w-[360px] rounded-full bg-[var(--brand)]/10 blur-3xl"
          style={{ animationDelay: "6s" }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <Image
            src="/images/logo-mark.png"
            alt={`${company} logo`}
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl object-contain shadow-[var(--shadow-card)]"
            priority
          />
          <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--brand-ink)] sm:text-xl">
            {company}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="secondary" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Sign up</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-10 sm:px-10 lg:grid-cols-2 lg:gap-8 lg:py-16">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/70 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)] shadow-sm backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-ring absolute inline-flex h-2 w-2 rounded-full bg-[var(--brand)]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand)]" />
            </span>
            Live distribution portal
          </span>

          <h1 className="mt-5 max-w-xl font-[family-name:var(--font-display)] text-4xl font-bold leading-[1.08] tracking-tight text-[var(--ink)] sm:text-6xl">
            Warehouse &amp; distribution,
            <span className="text-[var(--brand)]"> run in real time.</span>
          </h1>

          <p className="mt-5 max-w-lg text-lg text-[var(--ink-muted)]">
            One connected portal for receiving, picking, dispatch, and finance — built for
            fast-moving FMCG distribution teams.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button size="lg" className="group">
                Request access
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary">
                Open warehouse app
              </Button>
            </Link>
          </div>

          <div className="mt-10 grid max-w-lg grid-cols-2 gap-5 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--brand-ink)]">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-[var(--ink-muted)]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Animated hero visual */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="animate-float relative rounded-[28px] border border-[var(--line)] bg-white/60 p-3 shadow-[var(--shadow-panel)] backdrop-blur">
            <div className="overflow-hidden rounded-3xl">
              <Image
                src="/images/hero-warehouse.png"
                alt="Modern warehouse logistics with beverage crates being loaded for distribution"
                width={1024}
                height={768}
                className="h-auto w-full object-cover"
                priority
              />
            </div>
          </div>

          <div
            className="animate-float absolute -left-4 top-6 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-card)] sm:-left-8"
            style={{ animationDelay: "1.2s" }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-soft)]">
              <BadgeCheck className="h-4 w-4 text-[var(--brand-dark)]" />
            </span>
            <div className="text-xs">
              <p className="font-bold text-[var(--ink)]">GRN Verified</p>
              <p className="text-[var(--ink-muted)]">Batch #4821</p>
            </div>
          </div>

          <div
            className="animate-float absolute -bottom-4 right-2 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-card)] sm:-right-8"
            style={{ animationDelay: "2.4s" }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pill-peach-bg)]">
              <Truck className="h-4 w-4 text-[var(--pill-peach-fg)]" />
            </span>
            <div className="text-xs">
              <p className="font-bold text-[var(--ink)]">Gate-Pass Cleared</p>
              <p className="text-[var(--ink-muted)]">12 cartons out</p>
            </div>
          </div>

          <div
            className="animate-float absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--brand-ink)] px-3.5 py-2.5 text-white shadow-[var(--shadow-panel)] sm:flex"
            style={{ animationDelay: "0.6s" }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <PackageSearch className="h-4 w-4" />
            </span>
            <div className="text-xs">
              <p className="font-bold">FEFO Pick Ready</p>
              <p className="text-white/70">Nearest expiry first</p>
            </div>
          </div>
        </div>
      </section>

      {/* Scrolling marquee strip */}
      <section className="relative z-10 overflow-hidden border-y border-[var(--line)] bg-[var(--brand-ink)] py-3.5">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/70"
            >
              <Warehouse className="h-3.5 w-3.5 text-white/40" />
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
            End-to-end operations
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            Every carton, tracked from dock to doorstep
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-panel)]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-soft)] transition group-hover:scale-110">
                  <Icon className="h-5 w-5 text-[var(--brand-dark)]" />
                </span>
                <h3 className="mt-4 font-[family-name:var(--font-display)] text-base font-bold text-[var(--ink)]">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA band */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 sm:px-10">
        <div className="relative overflow-hidden rounded-[28px] bg-[var(--brand-ink)] px-8 py-12 text-center shadow-[var(--shadow-panel)] sm:px-16">
          <div className="animate-blob pointer-events-none absolute -top-20 right-0 h-64 w-64 rounded-full bg-[var(--brand)]/30 blur-3xl" />
          <div className="animate-blob pointer-events-none absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-[var(--accent)]/25 blur-3xl" />
          <h2 className="relative font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to run your warehouse in real time?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/70">
            Get your team onboarded onto the {company} distribution portal in a day, not a
            quarter.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/signup">
              <Button size="lg">Request access</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border-white/20">
                Open warehouse app
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--line)] px-6 py-6 sm:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 sm:flex-row">
          <p className="text-xs text-[var(--ink-muted)]">
            © {new Date().getFullYear()} {company}. All rights reserved.
          </p>
          <p className="text-xs text-[var(--ink-muted)]">Distribution &amp; warehouse portal</p>
        </div>
      </footer>
    </main>
  );
}
