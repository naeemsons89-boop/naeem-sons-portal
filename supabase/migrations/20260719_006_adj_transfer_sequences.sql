-- Extra doc sequences for stock ops
insert into public.doc_sequences (doc_type, prefix, next_no) values
  ('adjustment', 'ADJ', 1),
  ('transfer', 'TRF', 1)
on conflict (doc_type) do nothing;
