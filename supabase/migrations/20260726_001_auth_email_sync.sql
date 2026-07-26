-- Keep profiles.email in sync when auth.users email changes (email-change flow).
-- Also teach the self-update guard to allow a controlled bypass for that sync,
-- and accept phone + invited_role from signup / invite metadata.

create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.bypass_profile_guard', true) = '1' then
    return new;
  end if;

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

create or replace function public.handle_user_email_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    perform set_config('app.bypass_profile_guard', '1', true);
    update public.profiles
    set email = lower(new.email),
        updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_updated();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(new.email);
  v_name text := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    split_part(v_email, '@', 1)
  );
  v_phone text := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  v_invited text := nullif(trim(coalesce(new.raw_user_meta_data->>'invited_role', '')), '');
  v_role public.app_role := null;
  v_status public.user_status := 'pending';
begin
  if v_email = 'naeem.sons89@gmail.com' then
    v_role := 'admin';
    v_status := 'approved';
  elsif v_invited in (
    'admin', 'warehouse_manager', 'warehouse_operator', 'sales_office', 'viewer'
  ) then
    v_role := v_invited::public.app_role;
    v_status := 'approved';
  end if;

  insert into public.profiles (id, email, full_name, phone, role, status, approved_at)
  values (
    new.id,
    v_email,
    v_name,
    v_phone,
    v_role,
    v_status,
    case when v_status = 'approved' then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
