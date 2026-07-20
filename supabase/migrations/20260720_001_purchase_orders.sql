-- Purchase orders, supplier–SKU mapping, auto codes for supplier/customer/PO

insert into public.doc_sequences (doc_type, prefix, next_no) values
  ('supplier', 'SUP', 1),
  ('customer', 'CUS', 1),
  ('po', 'PO', 1)
on conflict (doc_type) do nothing;

-- ─── Supplier ↔ SKU mapping ─────────────────────────────────────────────────

create table if not exists public.supplier_skus (
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  supplier_sku_code text,
  default_purchase_price numeric(14, 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (supplier_id, sku_id)
);

create index if not exists supplier_skus_sku_idx on public.supplier_skus (sku_id);
create index if not exists supplier_skus_supplier_active_idx
  on public.supplier_skus (supplier_id) where is_active;

-- ─── Purchase orders ────────────────────────────────────────────────────────

do $$ begin
  create type public.po_status as enum (
    'draft',
    'pending',
    'partial',
    'received',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique,
  supplier_id uuid not null references public.suppliers (id),
  warehouse_id uuid not null references public.warehouses (id),
  order_date date not null default (timezone('Asia/Karachi', now()))::date,
  expected_date date,
  remarks text,
  status public.po_status not null default 'pending',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status);
create index if not exists purchase_orders_created_idx on public.purchase_orders (created_at desc);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  line_no integer not null,
  sku_id uuid not null references public.skus (id),
  uom text not null check (uom in ('pcs', 'pack', 'carton')),
  qty_ordered numeric(14, 3) not null check (qty_ordered > 0),
  qty_ordered_units numeric(14, 3) not null check (qty_ordered_units > 0),
  qty_received_units numeric(14, 3) not null default 0 check (qty_received_units >= 0),
  unit_price numeric(14, 4) not null default 0,
  line_amount numeric(14, 2) not null default 0,
  unique (po_id, line_no)
);

create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines (po_id);
create index if not exists purchase_order_lines_sku_idx on public.purchase_order_lines (sku_id);

-- ─── Link GRN → PO (nullable for legacy rows; app requires for new GRNs) ────

alter table public.grns
  add column if not exists po_id uuid references public.purchase_orders (id);

alter table public.grn_lines
  add column if not exists po_line_id uuid references public.purchase_order_lines (id);

create index if not exists grns_po_idx on public.grns (po_id);
create index if not exists grn_lines_po_line_idx on public.grn_lines (po_line_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.supplier_skus enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;

drop policy if exists supplier_skus_read on public.supplier_skus;
create policy supplier_skus_read on public.supplier_skus
  for select using (public.is_approved());

drop policy if exists supplier_skus_write on public.supplier_skus;
create policy supplier_skus_write on public.supplier_skus for all using (
  public.has_role(
    'admin'::public.app_role,
    'warehouse_manager'::public.app_role,
    'sales_office'::public.app_role
  )
);

drop policy if exists purchase_orders_all on public.purchase_orders;
create policy purchase_orders_all on public.purchase_orders for all using (
  public.has_role(
    'admin'::public.app_role,
    'warehouse_manager'::public.app_role,
    'warehouse_operator'::public.app_role,
    'sales_office'::public.app_role
  )
);

drop policy if exists purchase_order_lines_all on public.purchase_order_lines;
create policy purchase_order_lines_all on public.purchase_order_lines for all using (
  public.has_role(
    'admin'::public.app_role,
    'warehouse_manager'::public.app_role,
    'warehouse_operator'::public.app_role,
    'sales_office'::public.app_role
  )
);
