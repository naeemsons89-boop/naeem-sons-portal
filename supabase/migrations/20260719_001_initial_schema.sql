-- Naeem & Sons — SAFE RESET + FULL SCHEMA (idempotent)
-- Use this in Supabase SQL Editor when the previous run failed with:
--   ERROR: type "app_role" already exists
--
-- This drops ONLY public schema objects and rebuilds them.
-- Safe because you have no live warehouse data yet.

-- ─── 0) Reset public schema ──────────────────────────────────────────────────

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

create extension if not exists "pgcrypto" with schema extensions;

-- ─── 1) Enums ────────────────────────────────────────────────────────────────

do $$ begin create type public.app_role as enum (
  'admin','warehouse_manager','warehouse_operator','sales_office','viewer'
); exception when duplicate_object then null; end $$;

do $$ begin create type public.user_status as enum (
  'pending','approved','rejected','suspended'
); exception when duplicate_object then null; end $$;

do $$ begin create type public.stock_condition as enum (
  'good','near_expiry','damaged','hold'
); exception when duplicate_object then null; end $$;

do $$ begin create type public.finance_status as enum (
  'pending','posted'
); exception when duplicate_object then null; end $$;

do $$ begin create type public.doc_status as enum (
  'draft','submitted','approved','posted','cancelled','closed'
); exception when duplicate_object then null; end $$;

do $$ begin create type public.payment_method as enum (
  'cash','online','cheque'
); exception when duplicate_object then null; end $$;

do $$ begin create type public.movement_type as enum (
  'grn_in','opening_in','return_in','load_in_good','load_in_bad','exchange_in',
  'adjustment_in','transfer_in','pick_out','gate_pass_out','foc_out','exchange_out',
  'write_off','adjustment_out','transfer_out'
); exception when duplicate_object then null; end $$;

-- ─── 2) Tables ───────────────────────────────────────────────────────────────

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Naeem & Sons',
  address text not null default '17B Small Industrial Estate Behind Allied Bank, Sahiwal, Pakistan',
  phone text not null default '03006931889',
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  role public.app_role,
  status public.user_status not null default 'pending',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_role_idx on public.profiles (role);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  code text not null unique,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.racks (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  code text not null,
  name text,
  is_active boolean not null default true,
  unique (warehouse_id, code)
);

create table if not exists public.bins (
  id uuid primary key default gen_random_uuid(),
  rack_id uuid not null references public.racks (id) on delete cascade,
  code text not null,
  name text,
  is_active boolean not null default true,
  unique (rack_id, code)
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true
);

create table if not exists public.skus (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  description text not null,
  brand_id uuid references public.brands (id),
  category_id uuid references public.categories (id),
  barcode text,
  price_point numeric(12, 2),
  gm_per_pack numeric(12, 3),
  packs_per_carton integer not null default 1 check (packs_per_carton > 0),
  kg_per_case numeric(12, 4),
  purchase_price_pack numeric(14, 4),
  sale_price_pack numeric(14, 4),
  purchase_price_ctn numeric(14, 4),
  sale_price_ctn numeric(14, 4),
  default_shelf_life_days integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists skus_barcode_idx on public.skus (barcode);
create index if not exists skus_description_idx on public.skus using gin (to_tsvector('english', description));

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  phone text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  route_type text check (route_type in ('psr', 'da', 'mixed')),
  is_active boolean not null default true
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  phone text,
  route_id uuid references public.routes (id),
  opening_balance numeric(14, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reason_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  kind text not null check (kind in ('return', 'foc', 'write_off', 'adjustment', 'exchange')),
  is_active boolean not null default true
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id),
  batch_code text not null,
  mfg_date date,
  expiry_date date,
  is_unknown boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (sku_id, batch_code)
);

create index if not exists batches_expiry_idx on public.batches (expiry_date);

create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id),
  bin_id uuid references public.bins (id),
  sku_id uuid not null references public.skus (id),
  batch_id uuid not null references public.batches (id),
  condition public.stock_condition not null default 'good',
  qty_units numeric(14, 3) not null default 0 check (qty_units >= 0),
  finance_status public.finance_status not null default 'pending',
  updated_at timestamptz not null default now()
);

create unique index if not exists stock_balances_unique_idx
  on public.stock_balances (
    warehouse_id,
    sku_id,
    batch_id,
    condition,
    finance_status,
    (coalesce(bin_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type public.movement_type not null,
  warehouse_id uuid not null references public.warehouses (id),
  bin_id uuid references public.bins (id),
  sku_id uuid not null references public.skus (id),
  batch_id uuid not null references public.batches (id),
  condition public.stock_condition not null default 'good',
  qty_units numeric(14, 3) not null,
  unit_purchase_price numeric(14, 4),
  unit_sale_price numeric(14, 4),
  finance_status public.finance_status not null default 'pending',
  document_type text,
  document_id uuid,
  document_no text,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_doc_idx on public.stock_movements (document_type, document_id);
create index if not exists stock_movements_batch_idx on public.stock_movements (batch_id);
create index if not exists stock_movements_sku_idx on public.stock_movements (sku_id);

create table if not exists public.grns (
  id uuid primary key default gen_random_uuid(),
  grn_no text not null unique,
  supplier_id uuid references public.suppliers (id),
  warehouse_id uuid not null references public.warehouses (id),
  supplier_delivery_no text,
  delivery_date date not null default (timezone('Asia/Karachi', now()))::date,
  truck_no text,
  transporter_name text,
  remarks text,
  status public.doc_status not null default 'draft',
  physical_posted_at timestamptz,
  physical_posted_by uuid references public.profiles (id),
  finance_status public.finance_status not null default 'pending',
  finance_posted_at timestamptz,
  finance_posted_by uuid references public.profiles (id),
  supplier_invoice_no text,
  supplier_invoice_date date,
  invoice_tax_amount numeric(14, 2) default 0,
  invoice_discount_amount numeric(14, 2) default 0,
  invoice_total_amount numeric(14, 2),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grn_lines (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.grns (id) on delete cascade,
  line_no integer not null,
  sku_id uuid not null references public.skus (id),
  batch_id uuid references public.batches (id),
  batch_code text,
  mfg_date date,
  expiry_date date,
  qty_cases numeric(14, 3) default 0,
  qty_units numeric(14, 3) not null default 0,
  shortage_units numeric(14, 3) not null default 0,
  damage_units numeric(14, 3) not null default 0,
  purchase_price_pack numeric(14, 4),
  purchase_price_ctn numeric(14, 4),
  line_amount numeric(14, 2),
  finance_status public.finance_status not null default 'pending',
  bin_id uuid references public.bins (id),
  unique (grn_id, line_no)
);

create table if not exists public.picklists (
  id uuid primary key default gen_random_uuid(),
  picklist_no text not null unique,
  warehouse_id uuid not null references public.warehouses (id),
  delivery_date date not null,
  psr_route_id uuid references public.routes (id),
  da_route_id uuid references public.routes (id),
  status public.doc_status not null default 'draft',
  load_out_at timestamptz,
  load_out_by uuid references public.profiles (id),
  load_in_at timestamptz,
  load_in_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.picklist_customers (
  id uuid primary key default gen_random_uuid(),
  picklist_id uuid not null references public.picklists (id) on delete cascade,
  customer_id uuid not null references public.customers (id),
  invoice_no text,
  sequence_no integer not null default 1,
  notes text
);

create table if not exists public.picklist_lines (
  id uuid primary key default gen_random_uuid(),
  picklist_id uuid not null references public.picklists (id) on delete cascade,
  picklist_customer_id uuid references public.picklist_customers (id) on delete set null,
  line_no integer not null,
  sku_id uuid not null references public.skus (id),
  suggested_batch_id uuid references public.batches (id),
  scanned_batch_id uuid references public.batches (id),
  approved_batch_id uuid references public.batches (id),
  batch_override_pending boolean not null default false,
  qty_ordered_units numeric(14, 3) not null default 0,
  qty_foc_units numeric(14, 3) not null default 0,
  qty_exchange_units numeric(14, 3) not null default 0,
  qty_picked_units numeric(14, 3) not null default 0,
  qty_delivered_units numeric(14, 3) not null default 0,
  qty_load_in_good_units numeric(14, 3) not null default 0,
  qty_load_in_bad_units numeric(14, 3) not null default 0,
  sale_price_pack numeric(14, 4),
  line_sale_amount numeric(14, 2)
);

create table if not exists public.gate_passes (
  id uuid primary key default gen_random_uuid(),
  gate_pass_no text not null unique,
  picklist_id uuid not null unique references public.picklists (id),
  warehouse_id uuid not null references public.warehouses (id),
  status public.doc_status not null default 'draft',
  issued_at timestamptz,
  issued_by uuid references public.profiles (id),
  manager_approved_at timestamptz,
  manager_approved_by uuid references public.profiles (id),
  security_out_at timestamptz,
  security_out_by_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.gate_pass_lines (
  id uuid primary key default gen_random_uuid(),
  gate_pass_id uuid not null references public.gate_passes (id) on delete cascade,
  picklist_line_id uuid references public.picklist_lines (id),
  sku_id uuid not null references public.skus (id),
  batch_id uuid not null references public.batches (id),
  qty_units numeric(14, 3) not null,
  is_override boolean not null default false,
  override_approved_by uuid references public.profiles (id)
);

create table if not exists public.return_receipts (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  customer_id uuid not null references public.customers (id),
  warehouse_id uuid not null references public.warehouses (id),
  picklist_id uuid references public.picklists (id),
  invoice_no text,
  reason_id uuid references public.reason_codes (id),
  status public.doc_status not null default 'draft',
  requires_unknown_batch_approval boolean not null default false,
  unknown_batch_approved_by uuid references public.profiles (id),
  posted_at timestamptz,
  posted_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.return_receipts (id) on delete cascade,
  sku_id uuid not null references public.skus (id),
  batch_id uuid references public.batches (id),
  is_unknown_batch boolean not null default false,
  condition public.stock_condition not null default 'good',
  qty_units numeric(14, 3) not null
);

create table if not exists public.exchange_notes (
  id uuid primary key default gen_random_uuid(),
  exchange_no text not null unique,
  customer_id uuid not null references public.customers (id),
  warehouse_id uuid not null references public.warehouses (id),
  reason_id uuid references public.reason_codes (id),
  status public.doc_status not null default 'draft',
  posted_at timestamptz,
  posted_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.exchange_lines (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references public.exchange_notes (id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  sku_id uuid not null references public.skus (id),
  batch_id uuid references public.batches (id),
  condition public.stock_condition not null default 'good',
  qty_units numeric(14, 3) not null
);

create table if not exists public.foc_issues (
  id uuid primary key default gen_random_uuid(),
  foc_no text not null unique,
  customer_id uuid references public.customers (id),
  warehouse_id uuid not null references public.warehouses (id),
  picklist_id uuid references public.picklists (id),
  reason_id uuid references public.reason_codes (id),
  status public.doc_status not null default 'draft',
  posted_at timestamptz,
  posted_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.foc_lines (
  id uuid primary key default gen_random_uuid(),
  foc_id uuid not null references public.foc_issues (id) on delete cascade,
  sku_id uuid not null references public.skus (id),
  batch_id uuid not null references public.batches (id),
  qty_units numeric(14, 3) not null
);

create table if not exists public.write_offs (
  id uuid primary key default gen_random_uuid(),
  write_off_no text not null unique,
  warehouse_id uuid not null references public.warehouses (id),
  reason_id uuid references public.reason_codes (id),
  status public.doc_status not null default 'draft',
  posted_at timestamptz,
  posted_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.write_off_lines (
  id uuid primary key default gen_random_uuid(),
  write_off_id uuid not null references public.write_offs (id) on delete cascade,
  sku_id uuid not null references public.skus (id),
  batch_id uuid not null references public.batches (id),
  condition public.stock_condition not null,
  qty_units numeric(14, 3) not null
);

create table if not exists public.cash_collections (
  id uuid primary key default gen_random_uuid(),
  collection_no text not null unique,
  picklist_id uuid not null references public.picklists (id),
  gate_pass_id uuid not null references public.gate_passes (id),
  customer_id uuid not null references public.customers (id),
  invoice_no text,
  outstanding_balance numeric(14, 2) default 0,
  collected_by uuid references public.profiles (id),
  collected_at timestamptz,
  remarks text,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_collection_payments (
  id uuid primary key default gen_random_uuid(),
  cash_collection_id uuid not null references public.cash_collections (id) on delete cascade,
  method public.payment_method not null,
  amount numeric(14, 2) not null check (amount >= 0),
  cheque_no text,
  bank_name text,
  online_ref text,
  proof_path text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.doc_sequences (
  doc_type text primary key,
  prefix text not null,
  next_no bigint not null default 1
);

insert into public.doc_sequences (doc_type, prefix, next_no) values
  ('grn', 'GRN', 1),
  ('picklist', 'PL', 1),
  ('gate_pass', 'GP', 1),
  ('return', 'RET', 1),
  ('exchange', 'EX', 1),
  ('foc', 'FOC', 1),
  ('write_off', 'WO', 1),
  ('cash_collection', 'CC', 1)
on conflict (doc_type) do nothing;

-- ─── 3) Functions / triggers ─────────────────────────────────────────────────

create or replace function public.next_doc_no(p_doc_type text)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_no bigint;
begin
  update public.doc_sequences
    set next_no = next_no + 1
    where doc_type = p_doc_type
    returning prefix, next_no - 1 into v_prefix, v_no;
  if v_prefix is null then
    raise exception 'Unknown doc type %', p_doc_type;
  end if;
  return v_prefix || lpad(v_no::text, 6, '0');
end;
$$;

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.has_role(variadic roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'approved'
      and role = any (roles)
  );
$$;

create or replace function public.is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(new.email);
  v_role public.app_role := null;
  v_status public.user_status := 'pending';
begin
  if v_email = 'naeem.sons89@gmail.com' then
    v_role := 'admin';
    v_status := 'approved';
  end if;

  insert into public.profiles (id, email, full_name, role, status, approved_at)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(v_email, '@', 1)),
    v_role,
    v_status,
    case when v_status = 'approved' then now() else null end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists skus_updated_at on public.skus;
create trigger skus_updated_at before update on public.skus
  for each row execute function public.set_updated_at();

drop trigger if exists grns_updated_at on public.grns;
create trigger grns_updated_at before update on public.grns
  for each row execute function public.set_updated_at();

drop trigger if exists picklists_updated_at on public.picklists;
create trigger picklists_updated_at before update on public.picklists
  for each row execute function public.set_updated_at();

create or replace view public.v_pickable_stock as
select
  sb.*,
  b.batch_code,
  b.mfg_date,
  b.expiry_date,
  s.product_code,
  s.description,
  s.packs_per_carton
from public.stock_balances sb
join public.batches b on b.id = sb.batch_id
join public.skus s on s.id = sb.sku_id
where sb.qty_units > 0
  and sb.condition = 'good'
  and sb.finance_status = 'posted';

-- ─── 4) RLS ──────────────────────────────────────────────────────────────────

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.warehouses enable row level security;
alter table public.racks enable row level security;
alter table public.bins enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.skus enable row level security;
alter table public.suppliers enable row level security;
alter table public.routes enable row level security;
alter table public.customers enable row level security;
alter table public.reason_codes enable row level security;
alter table public.batches enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.grns enable row level security;
alter table public.grn_lines enable row level security;
alter table public.picklists enable row level security;
alter table public.picklist_customers enable row level security;
alter table public.picklist_lines enable row level security;
alter table public.gate_passes enable row level security;
alter table public.gate_pass_lines enable row level security;
alter table public.return_receipts enable row level security;
alter table public.return_lines enable row level security;
alter table public.exchange_notes enable row level security;
alter table public.exchange_lines enable row level security;
alter table public.foc_issues enable row level security;
alter table public.foc_lines enable row level security;
alter table public.write_offs enable row level security;
alter table public.write_off_lines enable row level security;
alter table public.cash_collections enable row level security;
alter table public.cash_collection_payments enable row level security;
alter table public.doc_sequences enable row level security;

do $$ 
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.has_role('admin'::public.app_role));
create policy profiles_update_admin on public.profiles
  for update using (public.has_role('admin'::public.app_role));
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

create policy companies_read on public.companies for select using (public.is_approved());
create policy warehouses_read on public.warehouses for select using (public.is_approved());
create policy racks_read on public.racks for select using (public.is_approved());
create policy bins_read on public.bins for select using (public.is_approved());
create policy brands_read on public.brands for select using (public.is_approved());
create policy categories_read on public.categories for select using (public.is_approved());
create policy skus_read on public.skus for select using (public.is_approved());
create policy suppliers_read on public.suppliers for select using (public.is_approved());
create policy routes_read on public.routes for select using (public.is_approved());
create policy customers_read on public.customers for select using (public.is_approved());
create policy reason_codes_read on public.reason_codes for select using (public.is_approved());
create policy batches_read on public.batches for select using (public.is_approved());
create policy stock_balances_read on public.stock_balances for select using (public.is_approved());
create policy stock_movements_read on public.stock_movements for select using (public.is_approved());

create policy warehouses_write on public.warehouses for all using (public.is_admin_or_manager());
create policy racks_write on public.racks for all using (public.is_admin_or_manager());
create policy bins_write on public.bins for all using (public.is_admin_or_manager());
create policy brands_write on public.brands for all using (public.is_admin_or_manager());
create policy categories_write on public.categories for all using (public.is_admin_or_manager());
create policy skus_write on public.skus for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);
create policy suppliers_write on public.suppliers for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);
create policy routes_write on public.routes for all using (
  public.has_role('admin'::public.app_role, 'sales_office'::public.app_role)
);
create policy customers_write on public.customers for all using (
  public.has_role('admin'::public.app_role, 'sales_office'::public.app_role)
);
create policy reason_codes_write on public.reason_codes for all using (public.is_admin_or_manager());
create policy batches_write on public.batches for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy stock_balances_write on public.stock_balances for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role)
);
create policy stock_movements_write on public.stock_movements for insert with check (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);

create policy grns_all on public.grns for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy grn_lines_all on public.grn_lines for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy picklists_all on public.picklists for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy picklist_customers_all on public.picklist_customers for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy picklist_lines_all on public.picklist_lines for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy gate_passes_all on public.gate_passes for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy gate_pass_lines_all on public.gate_pass_lines for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy returns_all on public.return_receipts for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy return_lines_all on public.return_lines for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'warehouse_operator'::public.app_role, 'sales_office'::public.app_role)
);
create policy exchanges_all on public.exchange_notes for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);
create policy exchange_lines_all on public.exchange_lines for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);
create policy foc_all on public.foc_issues for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);
create policy foc_lines_all on public.foc_lines for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);
create policy write_offs_all on public.write_offs for all using (public.is_admin_or_manager());
create policy write_off_lines_all on public.write_off_lines for all using (public.is_admin_or_manager());
create policy cash_collections_all on public.cash_collections for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);
create policy cash_payments_all on public.cash_collection_payments for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);
create policy doc_sequences_admin on public.doc_sequences for all using (public.has_role('admin'::public.app_role));
create policy doc_sequences_read on public.doc_sequences for select using (public.is_approved());
create policy companies_admin on public.companies for all using (public.has_role('admin'::public.app_role));

-- ─── 5) Seed data ────────────────────────────────────────────────────────────

insert into public.companies (name, address, phone, timezone)
select 'Naeem & Sons',
       '17B Small Industrial Estate Behind Allied Bank, Sahiwal, Pakistan',
       '03006931889',
       'Asia/Karachi'
where not exists (select 1 from public.companies);

insert into public.warehouses (company_id, code, name, address)
select c.id, 'MAIN_WHS', 'Main Warehouse',
       '17B Small Industrial Estate Behind Allied Bank, Sahiwal, Pakistan'
from public.companies c
where not exists (select 1 from public.warehouses where code = 'MAIN_WHS')
limit 1;

insert into public.categories (name) values ('Snacks') on conflict (name) do nothing;

insert into public.reason_codes (code, label, kind) values
  ('RET_EXP', 'Expiry / near expiry return', 'return'),
  ('RET_DMG', 'Damaged return', 'return'),
  ('RET_GOOD', 'Good saleable return', 'return'),
  ('RET_QUALITY', 'Quality complaint', 'return'),
  ('FOC_SAMPLE', 'Sampling', 'foc'),
  ('FOC_PROMO', 'Promotion', 'foc'),
  ('WO_EXP', 'Expired destroy', 'write_off'),
  ('WO_DMG', 'Damaged destroy', 'write_off'),
  ('EX_SWAP', 'Product exchange', 'exchange'),
  ('ADJ_COUNT', 'Cycle count variance', 'adjustment')
on conflict (code) do nothing;

insert into public.suppliers (code, name) values
  ('PCI', 'Pepsi Cola International (Pvt) Ltd')
on conflict (code) do nothing;

-- Done. Verify with:
-- select code, name from public.warehouses;
-- select code, label from public.reason_codes;
