-- Customer AR / sale ledger

-- Ensure credit exists on payment_method (may not have been applied yet)
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'payment_method'
      and e.enumlabel = 'credit'
  ) then
    alter type public.payment_method add value 'credit';
  end if;
end $$;

do $$ begin
  create type public.ledger_entry_type as enum (
    'opening',
    'sale',
    'payment',
    'credit_memo',
    'return_credit'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.customer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  entry_type public.ledger_entry_type not null,
  amount numeric(14, 2) not null check (amount > 0),
  signed_amount numeric(14, 2) not null,
  affects_balance boolean not null default true,
  payment_method public.payment_method,
  picklist_id uuid references public.picklists (id),
  gate_pass_id uuid references public.gate_passes (id),
  picklist_customer_id uuid references public.picklist_customers (id),
  invoice_no text,
  cash_collection_id uuid references public.cash_collections (id) on delete cascade,
  cash_collection_payment_id uuid references public.cash_collection_payments (id) on delete cascade,
  return_receipt_id uuid references public.return_receipts (id) on delete set null,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint customer_ledger_signed_check check (
    (affects_balance = false and signed_amount = 0)
    or (affects_balance = true and abs(signed_amount) = amount)
  )
);

-- One sale per picklist customer (idempotent gate-pass posting)
create unique index if not exists customer_ledger_sale_pc_uidx
  on public.customer_ledger_entries (picklist_customer_id)
  where entry_type = 'sale' and picklist_customer_id is not null;

-- One opening per customer
create unique index if not exists customer_ledger_opening_uidx
  on public.customer_ledger_entries (customer_id)
  where entry_type = 'opening';

-- One ledger row per collection payment line
create unique index if not exists customer_ledger_payment_uidx
  on public.customer_ledger_entries (cash_collection_payment_id)
  where cash_collection_payment_id is not null;

-- One return credit per return receipt
create unique index if not exists customer_ledger_return_uidx
  on public.customer_ledger_entries (return_receipt_id)
  where entry_type = 'return_credit' and return_receipt_id is not null;

create index if not exists customer_ledger_customer_created_idx
  on public.customer_ledger_entries (customer_id, created_at);

create or replace view public.v_customer_balances as
select
  c.id as customer_id,
  c.code,
  c.name,
  c.opening_balance as master_opening_balance,
  coalesce(sum(case when e.affects_balance then e.signed_amount else 0 end), 0)::numeric(14, 2) as outstanding
from public.customers c
left join public.customer_ledger_entries e on e.customer_id = c.id
group by c.id, c.code, c.name, c.opening_balance;

alter table public.customer_ledger_entries enable row level security;

drop policy if exists customer_ledger_all on public.customer_ledger_entries;
create policy customer_ledger_all on public.customer_ledger_entries for all using (
  public.has_role('admin'::public.app_role, 'warehouse_manager'::public.app_role, 'sales_office'::public.app_role)
);

-- Backfill: opening balances
insert into public.customer_ledger_entries (
  customer_id, entry_type, amount, signed_amount, affects_balance, notes
)
select
  c.id,
  'opening',
  abs(c.opening_balance),
  c.opening_balance,
  true,
  'Seeded from customers.opening_balance'
from public.customers c
where c.opening_balance <> 0
  and not exists (
    select 1 from public.customer_ledger_entries e
    where e.customer_id = c.id and e.entry_type = 'opening'
  );

-- Backfill: sales for gate-passed picklist customers
insert into public.customer_ledger_entries (
  customer_id,
  entry_type,
  amount,
  signed_amount,
  affects_balance,
  picklist_id,
  gate_pass_id,
  picklist_customer_id,
  invoice_no,
  notes,
  created_at
)
select
  pc.customer_id,
  'sale',
  round(sale.amt, 2),
  round(sale.amt, 2),
  true,
  pc.picklist_id,
  gp.id,
  pc.id,
  pc.invoice_no,
  'Backfill from gate pass',
  coalesce(gp.issued_at, p.load_out_at, p.created_at)
from public.picklist_customers pc
join public.picklists p on p.id = pc.picklist_id
join public.gate_passes gp on gp.picklist_id = p.id
join lateral (
  select coalesce(sum(
    coalesce(pl.sale_price_pack, 0) * coalesce(pl.qty_delivered_units, pl.qty_picked_units, 0)
  ), 0) as amt
  from public.picklist_lines pl
  where pl.picklist_customer_id = pc.id
) sale on true
where sale.amt > 0
  and not exists (
    select 1 from public.customer_ledger_entries e
    where e.entry_type = 'sale' and e.picklist_customer_id = pc.id
  );

-- Backfill: payments from existing collections
-- Compare method as text so Postgres does not require 'credit' enum at parse time
insert into public.customer_ledger_entries (
  customer_id,
  entry_type,
  amount,
  signed_amount,
  affects_balance,
  payment_method,
  picklist_id,
  gate_pass_id,
  invoice_no,
  cash_collection_id,
  cash_collection_payment_id,
  notes,
  created_at
)
select
  cc.customer_id,
  case when pay.method::text = 'credit' then 'credit_memo'::public.ledger_entry_type
       else 'payment'::public.ledger_entry_type end,
  pay.amount,
  case when pay.method::text = 'credit' then 0 else -pay.amount end,
  pay.method::text <> 'credit',
  pay.method,
  cc.picklist_id,
  cc.gate_pass_id,
  cc.invoice_no,
  cc.id,
  pay.id,
  'Backfill from cash collection ' || cc.collection_no,
  coalesce(cc.collected_at, pay.created_at, cc.created_at)
from public.cash_collection_payments pay
join public.cash_collections cc on cc.id = pay.cash_collection_id
where pay.amount > 0
  and not exists (
    select 1 from public.customer_ledger_entries e
    where e.cash_collection_payment_id = pay.id
  );

grant select on public.v_customer_balances to authenticated, anon, service_role;
grant select, insert, update, delete on public.customer_ledger_entries to authenticated, service_role;
