-- Auto-generated master / location / batch codes
insert into public.doc_sequences (doc_type, prefix, next_no) values
  ('sku', 'SKU', 1),
  ('warehouse', 'WH', 1),
  ('rack', 'RK', 1),
  ('bin', 'BN', 1),
  ('route', 'RTE', 1),
  ('batch', 'BAT', 1),
  ('vendor_sku', 'VSKU', 1)
on conflict (doc_type) do nothing;
