import Link from "next/link";

import { Button } from "@/components/ui";

export default function HomePage() {
  const company = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Naeem & Sons";

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(15,107,76,0.08)_100%)]" />
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <p className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--brand)]">
          {company}
        </p>
        <div className="flex gap-2">
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

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-20 pt-10">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          Distribution portal
        </p>
        <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl font-bold leading-tight text-[var(--ink)] sm:text-6xl">
          {company}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-[var(--ink-muted)]">
          Receive by batch, pick by FEFO, gate-pass outward, and trace every carton
          from supplier to shop — with finance unlock before dispatch.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup">
            <Button size="lg">Request access</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="secondary">
              Open warehouse app
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
