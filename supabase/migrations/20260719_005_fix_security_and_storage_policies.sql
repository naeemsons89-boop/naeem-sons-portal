-- Fix CRITICAL: v_pickable_stock should use invoker security (RLS of caller)
drop view if exists public.v_pickable_stock;

create view public.v_pickable_stock
with (security_invoker = true)
as
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

-- Storage policies for payment proofs (bucket already created)
drop policy if exists payment_proofs_auth_read on storage.objects;
drop policy if exists payment_proofs_auth_insert on storage.objects;

create policy payment_proofs_auth_read on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs');

create policy payment_proofs_auth_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-proofs');
