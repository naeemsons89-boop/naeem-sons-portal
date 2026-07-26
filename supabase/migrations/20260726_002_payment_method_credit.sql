-- Allow credit as a cash-collection payment method
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
