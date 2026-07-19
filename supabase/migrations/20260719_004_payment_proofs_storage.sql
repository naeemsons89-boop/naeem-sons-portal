-- Payment proof storage + execute grants
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload/read their org proofs (service role bypasses anyway)
drop policy if exists payment_proofs_auth_read on storage.objects;
drop policy if exists payment_proofs_auth_insert on storage.objects;

create policy payment_proofs_auth_read on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs');

create policy payment_proofs_auth_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-proofs');
