-- GRN physical + finance posting helpers (optional RPC layer)
-- Safe to run in Supabase SQL Editor after initial schema.

create or replace function public.upsert_stock_qty(
  p_warehouse_id uuid,
  p_sku_id uuid,
  p_batch_id uuid,
  p_condition public.stock_condition,
  p_finance_status public.finance_status,
  p_qty_delta numeric,
  p_bin_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_qty numeric;
begin
  select id, qty_units into v_id, v_qty
  from public.stock_balances
  where warehouse_id = p_warehouse_id
    and sku_id = p_sku_id
    and batch_id = p_batch_id
    and condition = p_condition
    and finance_status = p_finance_status
    and ((p_bin_id is null and bin_id is null) or bin_id = p_bin_id)
  for update;

  if v_id is null then
    if p_qty_delta < 0 then
      raise exception 'Insufficient stock for sku % batch %', p_sku_id, p_batch_id;
    end if;
    insert into public.stock_balances (
      warehouse_id, bin_id, sku_id, batch_id, condition, qty_units, finance_status
    ) values (
      p_warehouse_id, p_bin_id, p_sku_id, p_batch_id, p_condition, p_qty_delta, p_finance_status
    );
  else
    if v_qty + p_qty_delta < 0 then
      raise exception 'Insufficient stock (have %, delta %)', v_qty, p_qty_delta;
    end if;
    update public.stock_balances
      set qty_units = v_qty + p_qty_delta,
          updated_at = now()
      where id = v_id;
  end if;
end;
$$;
