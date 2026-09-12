create policy "admins insert roles" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admins update roles" on public.user_roles for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admins delete roles" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare admin_count int;
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    select count(*) into admin_count from public.user_roles where role = 'admin';
    if admin_count <= 1 then
      raise exception 'অন্তত একজন অ্যাডমিন থাকতে হবে';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.protect_last_admin() from public, anon, authenticated;

create trigger user_roles_protect_last_admin
before update or delete on public.user_roles
for each row execute function public.protect_last_admin();