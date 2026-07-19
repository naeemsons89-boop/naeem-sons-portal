-- Self-service profile: avatar photo + own-row update support.

alter table public.profiles add column if not exists avatar_url text;

-- Public-read avatar bucket; writes are done via the service-role /api/profile
-- route (server-side), so no public.avatars can be forged. We still add
-- storage policies scoped to the caller's own uid-prefixed path so that
-- authenticated direct-from-browser uploads (used by the profile page) are
-- restricted to files under `${auth.uid()}/...`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists avatars_public_read on storage.objects;
drop policy if exists avatars_own_write on storage.objects;
drop policy if exists avatars_own_update on storage.objects;
drop policy if exists avatars_own_delete on storage.objects;

create policy avatars_public_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

create policy avatars_own_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow a user to update a limited set of columns on their own profile row.
-- Role/status/approval fields stay admin-only via a trigger guard below —
-- the /api/profile route also enforces a column whitelist server-side.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins may change anything (existing profiles_update_admin policy).
  if public.has_role('admin'::public.app_role) then
    return new;
  end if;

  -- Non-admins updating their own row may only change name/phone/avatar.
  if new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.rejection_reason is distinct from old.rejection_reason
    or new.email is distinct from old.email
  then
    raise exception 'Only an admin can change role, status, or email';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update
  before update on public.profiles
  for each row execute function public.guard_profile_self_update();
