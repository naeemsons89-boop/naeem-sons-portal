# Naeem & Sons Distribution Portal

Web + PWA portal for snack distribution warehouse ops (Sahiwal).

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, Storage later)
- Vercel hosting
- Installable PWA for Android / iPhone camera scanning

## Locked business rules

- Physical GRN can receive stock without prices
- Only **Admin / Warehouse Manager** post finance (GRN header + line prices)
- Stock is **not pickable/dispatchable** until finance is posted (per GRN and/or line)
- Picklist prints **FEFO batch**; picker may scan another batch → Manager confirms on **unique gate pass**
- Cash collection supports **cash / online / cheque** (multiple) with proof images, linked to gate pass
- Admin CSV import: SKUs, opening inventory + pricing, customer openings
- Timezone: `Asia/Karachi`
- Warehouse: `MAIN_WHS` (more warehouses supported)

## Setup

1. Copy `.env.example` → `.env.local` (already configured locally; never commit secrets)
2. Apply DB migration in Supabase SQL editor or CLI:

```bash
supabase db push
# or paste supabase/migrations/20260719_001_initial_schema.sql into SQL Editor
```

3. In Supabase Auth settings:
   - Enable Email provider
   - Site URL: your Vercel URL (and `http://localhost:3000` for local)
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://YOUR_DOMAIN/auth/callback`

4. Run locally:

```bash
npm install
npm run dev
```

5. Sign up with **naeem.sons89@gmail.com** — this email is auto-approved as **Admin** by the DB trigger.

## Vercel

Connect the GitHub repo `naeemsons89-boop/naeem-sons-portal` and set the same env vars as `.env.example`.

## First admin actions

1. Sign up / log in as `naeem.sons89@gmail.com`
2. **Users** → approve staff and assign roles
3. **CSV Import** → upload price list / openings
4. Start GRN receiving

## Roles

| Role | Key powers |
|---|---|
| Admin | Everything, approvals, CSV import |
| Warehouse Manager | Finance post, gate pass approve, write-off, exports |
| Warehouse Operator | Scan receive / pick / load-in |
| Sales / Office | Picklists, customers, cash collection |
| Viewer | Reports only |
