create or replace function public.ensure_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
begin
  if to_regclass('public.user_roles') is null then
    return false;
  end if;

  select count(*) into admin_count from public.user_roles where role = 'admin';
  if admin_count = 0 then
    insert into public.user_roles (user_id, role)
    values (auth.uid(), 'admin')
    on conflict do nothing;
    return true;
  end if;

  return exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'editor')
  );
end;
$$;

revoke all on function public.ensure_first_admin() from public, anon;
grant execute on function public.ensure_first_admin() to authenticated, service_role;

notify pgrst, 'reload schema';
