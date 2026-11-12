-- Mi Ruta PRO V5 — licencias controladas por el propietario.
-- Migration already applied to Supabase project Mi Ruta PRO; never run on FHERDANI PRO.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

create table if not exists public.app_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on table public.app_admins from public,anon,authenticated;
grant select on table public.app_admins to authenticated;
create policy admins_see_self on public.app_admins for select to authenticated
using (user_id = (select auth.uid()));

create table if not exists public.customer_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null default '',
 status text not null default 'pending' check (status in ('pending','active','suspended')),
 plan text not null default 'Mensual' check (plan in ('Mensual','Trimestral','Anual','Cortesía')),
 expires_at date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status<>'active' or expires_at is not null)
);
create index if not exists customer_accounts_status_expiry on public.customer_accounts(status,expires_at);
alter table public.customer_accounts enable row level security;
revoke all on table public.customer_accounts from public,anon,authenticated;
grant select,update on table public.customer_accounts to authenticated;
create policy customer_accounts_owner_or_admin_read on public.customer_accounts
for select to authenticated
using(user_id=(select auth.uid()) or
 exists(select 1 from public.app_admins aa where aa.user_id=(select auth.uid())));
create policy customer_accounts_admin_update on public.customer_accounts
for update to authenticated
using(exists(select 1 from public.app_admins aa where aa.user_id=(select auth.uid())))
with check(exists(select 1 from public.app_admins aa where aa.user_id=(select auth.uid())));

create or replace function private.customer_on_auth_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.customer_accounts(user_id,email,status)
 values(new.id,coalesce(new.email,''),'pending')
 on conflict(user_id) do update set email=excluded.email;
 return new;
end; $$;
revoke all on function private.customer_on_auth_user() from public,anon,authenticated;
drop trigger if exists mi_ruta_customer_created on auth.users;
create trigger mi_ruta_customer_created after insert on auth.users
for each row execute function private.customer_on_auth_user();

create or replace function private.customer_email_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.customer_accounts
 set email=coalesce(new.email,''), updated_at=now()
 where user_id=new.id;
 return new;
end; $$;
revoke all on function private.customer_email_changed() from public,anon,authenticated;
drop trigger if exists mi_ruta_customer_email_changed on auth.users;
create trigger mi_ruta_customer_email_changed after update of email on auth.users
for each row when(old.email is distinct from new.email)
execute function private.customer_email_changed();

insert into public.customer_accounts(user_id,email,status)
select id,coalesce(email,''),'pending' from auth.users
on conflict(user_id) do nothing;

create or replace function public.account_can_use()
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.customer_accounts ca
  where ca.user_id=(select auth.uid()) and ca.status='active'
  and ca.expires_at >= (now() at time zone 'America/Lima')::date);
$$;
revoke all on function public.account_can_use() from public,anon;
grant execute on function public.account_can_use() to authenticated;

do $$
declare tbl text;
begin
 foreach tbl in array array['profiles','vehicles','shifts','movements','fuel','goals','maintenance','debts','debt_actions'] loop
  execute format('drop policy if exists owner_select on public.%I',tbl);
  execute format('drop policy if exists owner_insert on public.%I',tbl);
  execute format('drop policy if exists owner_update on public.%I',tbl);
  execute format('drop policy if exists owner_delete on public.%I',tbl);
  execute format('create policy owner_select on public.%I for select to authenticated using (user_id=(select auth.uid()) and (select public.account_can_use()))',tbl);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id=(select auth.uid()) and (select public.account_can_use()))',tbl);
  execute format('create policy owner_update on public.%I for update to authenticated using (user_id=(select auth.uid()) and (select public.account_can_use())) with check (user_id=(select auth.uid()) and (select public.account_can_use()))',tbl);
  execute format('create policy owner_delete on public.%I for delete to authenticated using (user_id=(select auth.uid()) and (select public.account_can_use()))',tbl);
 end loop;
end $$;
