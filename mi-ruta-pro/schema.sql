-- MI RUTA PRO: proyecto Supabase NUEVO, nunca ejecutar sobre FHERDANI PRO.
-- Auth: correo/contraseña mediante Supabase Auth. Toda la información es por cuenta.
create extension if not exists pgcrypto;
create table public.profiles(id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id) on delete cascade,display_name text default '',created_at timestamptz not null default now());
create table public.vehicles(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,brand text not null,model text not null,year int not null check(year between 1950 and 2100),odometer_initial numeric(12,1) not null check(odometer_initial>=0),target_per_km numeric(12,2) not null default 2,created_at timestamptz not null default now());
create unique index vehicles_one_per_user on public.vehicles(user_id);
create table public.shifts(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,date date not null,odometer_start numeric(12,1) not null,odometer_end numeric(12,1) not null,km_total numeric(12,1) not null,km_work numeric(12,1) not null,note text default '',created_at timestamptz not null default now(),unique(user_id,date),check(odometer_end>odometer_start),check(km_total=odometer_end-odometer_start),check(km_work>=0 and km_work<=km_total));
create table public.movements(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,date date not null,kind text not null check(kind in ('ingreso','gasto_operativo','gasto_personal','recarga_app')),category text not null,amount numeric(12,2) not null check(amount>0),note text default '',created_at timestamptz not null default now());
create table public.fuel(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,date date not null,fuel_type text not null check(fuel_type in ('GLP','Gasolina','GNV')),odometer numeric(12,1) not null check(odometer>=0),amount numeric(12,2) not null check(amount>0),quantity numeric(12,3) not null check(quantity>0),full_tank boolean not null default false,note text default '',created_at timestamptz not null default now());
create table public.goals(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null,target numeric(12,2) not null check(target>0),reserved numeric(12,2) not null default 0 check(reserved>=0),deadline date not null,created_at timestamptz not null default now());
create table public.maintenance(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null,due_km numeric(12,1) not null check(due_km>=0),estimated_cost numeric(12,2) not null default 0 check(estimated_cost>=0),created_at timestamptz not null default now());
-- Políticas independientes por usuario. No se permite leer ni escribir datos de otras cuentas.
do $$ declare tbl text; begin foreach tbl in array array['profiles','vehicles','shifts','movements','fuel','goals','maintenance'] loop
 execute format('alter table public.%I enable row level security',tbl);
 execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid())=user_id)',tbl);
 execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',tbl);
 execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',tbl);
 execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid())=user_id)',tbl);
 execute format('grant select,insert,update,delete on public.%I to authenticated',tbl);
 end loop; end $$;
create index shifts_user_date on public.shifts(user_id,date);
create index movements_user_date on public.movements(user_id,date);
create index fuel_user_date on public.fuel(user_id,date);