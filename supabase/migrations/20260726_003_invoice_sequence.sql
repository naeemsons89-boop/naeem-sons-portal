-- Sequence for auto-generated picklist customer invoices
insert into public.doc_sequences (doc_type, prefix, next_no) values
  ('invoice', 'INV', 1)
on conflict (doc_type) do nothing;
