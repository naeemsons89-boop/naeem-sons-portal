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
2. Apply DB migrations in Supabase SQL editor or CLI (include the latest `20260726_001_auth_email_sync.sql`):

```bash
supabase db push
# or paste each file under supabase/migrations/ into SQL Editor in order
```

3. In Supabase Auth settings:
   - Enable Email provider (password + magic link / OTP)
   - Enable Multi-Factor Auth (TOTP) for optional 2FA on Profile
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

## Auth portal

- `/login` — password or email magic link; honors `?next=` deep links
- `/signup` — request access (pending approval)
- `/forgot-password` + `/reset-password` — recovery flow
- `/mfa` — TOTP challenge when 2FA is enabled
- `/app/profile` — photo, name, phone, email change, password, MFA, sessions
- `/app/admin/users` — invite, approve/reject, suspend/unsuspend, change role

## First admin actions

1. Sign up / log in as `naeem.sons89@gmail.com`
2. **Users** → approve staff and assign roles (or invite by email)
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
