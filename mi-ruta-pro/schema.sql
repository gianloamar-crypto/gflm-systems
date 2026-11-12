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

-- Complementos de Mi Ruta PRO Intelligence: grifos + cierre de jornada atómico.
-- Mi Ruta PRO V2: SOLO para proyecto Supabase de Mi Ruta PRO.
-- No ejecutar en el proyecto de FHERDANI PRO.
ALTER TABLE public.fuel ADD COLUMN IF NOT EXISTS station text NOT NULL DEFAULT '';
ALTER TABLE public.fuel ADD COLUMN IF NOT EXISTS exclusive_usage boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS fuel_user_station ON public.fuel (user_id, fuel_type, station);

-- Cierre diario atómico: o se guardan jornada, ingresos y combustible, o nada.
-- SECURITY INVOKER respeta las políticas RLS de cada cuenta.
CREATE OR REPLACE FUNCTION public.save_day_close(
    p_date date,
    p_odometer_end numeric,
    p_km_work numeric,
    p_income numeric DEFAULT 0,
    p_operating numeric DEFAULT 0,
    p_personal numeric DEFAULT 0,
    p_wallet_reload numeric DEFAULT 0,
    p_fuel_type text DEFAULT NULL,
    p_fuel_amount numeric DEFAULT 0,
    p_fuel_quantity numeric DEFAULT 0,
    p_fuel_station text DEFAULT NULL,
    p_fuel_odometer numeric DEFAULT NULL,
    p_fuel_full boolean DEFAULT false,
    p_fuel_exclusive boolean DEFAULT false,
    p_note text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_user uuid := auth.uid();
    v_baseline numeric;
    v_last_date date;
    v_total numeric;
    v_shift uuid;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Inicia sesión para registrar tu jornada.'; END IF;
    IF p_date IS NULL OR p_odometer_end IS NULL OR p_km_work IS NULL THEN
        RAISE EXCEPTION 'Completa la fecha, odómetro y kilómetros de trabajo.';
    END IF;
    IF p_income < 0 OR p_operating < 0 OR p_personal < 0 OR p_wallet_reload < 0 OR
        p_income IS NULL OR p_operating IS NULL OR p_personal IS NULL OR p_wallet_reload IS NULL THEN
        RAISE EXCEPTION 'Los importes no pueden ser negativos.';
    END IF;
    SELECT odometer_initial INTO v_baseline FROM public.vehicles
        WHERE user_id = v_user;
    IF v_baseline IS NULL THEN RAISE EXCEPTION 'Primero configura tu vehículo y odómetro inicial.'; END IF;
    SELECT date, odometer_end INTO v_last_date, v_baseline
        FROM public.shifts WHERE user_id = v_user ORDER BY date DESC LIMIT 1;
    IF v_baseline IS NULL THEN
        SELECT odometer_initial INTO v_baseline FROM public.vehicles WHERE user_id=v_user;
    END IF;
    IF v_last_date IS NOT NULL AND p_date <= v_last_date THEN
        RAISE EXCEPTION 'Registra una fecha posterior a tu última jornada, sin duplicados.';
    END IF;
    v_total := p_odometer_end - v_baseline;
    IF v_total <= 0 OR p_km_work < 0 OR p_km_work > v_total THEN
        RAISE EXCEPTION 'Revisa el odómetro: los kilómetros de trabajo no pueden superar lo recorrido.';
    END IF;
    IF p_fuel_type IS NOT NULL THEN
        IF p_fuel_type NOT IN ('GLP','Gasolina','GNV') OR
            p_fuel_amount <= 0 OR p_fuel_quantity <= 0 OR
            length(btrim(coalesce(p_fuel_station,''))) = 0 OR
            p_fuel_odometer IS NULL OR p_fuel_odometer < v_baseline OR p_fuel_odometer > p_odometer_end THEN
            RAISE EXCEPTION 'Completa el grifo, cantidad, importe y odómetro del abastecimiento.';
        END IF;
    ELSIF coalesce(p_fuel_amount,0) <> 0 OR coalesce(p_fuel_quantity,0) <> 0 THEN
        RAISE EXCEPTION 'Selecciona el tipo de combustible para registrar una recarga.';
    END IF;

    INSERT INTO public.shifts(user_id,date,odometer_start,odometer_end,km_total,km_work,note)
        VALUES(v_user,p_date,v_baseline,p_odometer_end,v_total,p_km_work,coalesce(p_note,''))
        RETURNING id INTO v_shift;
    IF p_income > 0 THEN
        INSERT INTO public.movements(user_id,date,kind,category,amount)
        VALUES(v_user,p_date,'ingreso','Viajes del día',p_income);
    END IF;
    IF p_operating > 0 THEN
        INSERT INTO public.movements(user_id,date,kind,category,amount)
        VALUES(v_user,p_date,'gasto_operativo','Otros costos del trabajo',p_operating);
    END IF;
    IF p_personal > 0 THEN
        INSERT INTO public.movements(user_id,date,kind,category,amount)
        VALUES(v_user,p_date,'gasto_personal','Gastos personales',p_personal);
    END IF;
    IF p_wallet_reload > 0 THEN
        INSERT INTO public.movements(user_id,date,kind,category,amount)
        VALUES(v_user,p_date,'recarga_app','Recarga de billetera',p_wallet_reload);
    END IF;
    IF p_fuel_type IS NOT NULL THEN
        INSERT INTO public.fuel(user_id,date,fuel_type,odometer,amount,quantity,full_tank,station,exclusive_usage)
        VALUES(v_user,p_date,p_fuel_type,p_fuel_odometer,p_fuel_amount,p_fuel_quantity,p_fuel_full,btrim(p_fuel_station),p_fuel_exclusive);
    END IF;
    RETURN v_shift;
END;
$$;
REVOKE ALL ON FUNCTION public.save_day_close(date,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,text,numeric,boolean,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_day_close(date,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,text,numeric,boolean,boolean,text) TO authenticated;
-- MI RUTA PRO V3 - PRÉSTAMOS Y PAGOS (solo en la base de datos de MI RUTA PRO).
-- Para una instalación nueva usa schema.sql, que ya incluye esta migración.
-- Para actualizar una instalación existente V2 ejecuta SOLO migration_v3.sql.
-- Apartar dinero es una declaración voluntaria, no un débito a ninguna billetera.
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 100),
  kind text not null check(kind in ('Préstamo','Tarjeta','Cuota','Servicio','Otro pago')),
  amount numeric(12,2) not null check(amount > 0),
  due_date date not null,
  created_at timestamptz not null default now(),
  unique(id,user_id)
);
create index if not exists debts_user_due on public.debts(user_id,due_date);
create table if not exists public.debt_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null,
  date date not null,
  kind text not null check(kind in ('reserve','pay','release')),
  amount numeric(12,2) not null check(amount > 0),
  from_reserved numeric(12,2) not null default 0 check(from_reserved >= 0 and from_reserved <= amount),
  created_at timestamptz not null default now(),
  constraint debt_actions_owner_fk foreign key (debt_id,user_id) references public.debts(id,user_id) on delete cascade,
  constraint debt_actions_from_check check(kind='pay' OR from_reserved=0)
);
create index if not exists debt_actions_owner_debt on public.debt_actions(user_id,debt_id);

-- No basta con autenticarse; cada operación comprueba identidad propia.
do $$ declare tbl text; begin
  foreach tbl in array array['debts','debt_actions'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('drop policy if exists owner_select on public.%I',tbl);
    execute format('drop policy if exists owner_insert on public.%I',tbl);
    execute format('drop policy if exists owner_update on public.%I',tbl);
    execute format('drop policy if exists owner_delete on public.%I',tbl);
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid())=user_id)',tbl);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',tbl);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',tbl);
    execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid())=user_id)',tbl);
    execute format('grant select,insert,update,delete on public.%I to authenticated',tbl);
  end loop;
end $$;

-- Nunca permitir apartados/pagos inconsistentes incluso con dos pestañas abiertas.
create or replace function public.record_debt_action(
  p_debt_id uuid,
  p_kind text,
  p_amount numeric,
  p_from_reserved numeric default 0,
  p_date date default current_date
) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
  v_amount numeric;
  v_paid numeric;
  v_reserved numeric;
  v_id uuid;
begin
  if v_user is null then raise exception 'Inicia sesión.'; end if;
  if p_date is null then raise exception 'Ingresa la fecha.'; end if;
  if p_kind is null or p_kind not in ('reserve','pay','release') or p_amount is null or p_amount<=0 or p_from_reserved is null or p_from_reserved<0 then
    raise exception 'Tipo o importe no válido.';
  end if;
  -- Bloquear la deuda serializa las escrituras de este compromiso.
  select amount into v_amount from public.debts where id=p_debt_id and user_id=v_user for update;
  if v_amount is null then raise exception 'No existe el préstamo en tu cuenta.'; end if;
  select coalesce(sum(case when kind='pay' then amount else 0 end),0),
    coalesce(sum(case when kind='reserve' then amount when kind='release' then -amount when kind='pay' then -from_reserved else 0 end),0)
    into v_paid,v_reserved from public.debt_actions where debt_id=p_debt_id and user_id=v_user;
  if p_kind='reserve' and p_amount > v_amount-v_paid-v_reserved then
    raise exception 'El monto a apartar supera lo pendiente por reunir.';
  end if;
  if p_kind='release' and p_amount > v_reserved then
    raise exception 'No hay suficiente importe apartado.';
  end if;
  if p_kind='pay' and (p_amount > v_amount-v_paid or p_from_reserved>p_amount or p_from_reserved>v_reserved) then
    raise exception 'El importe pagado o usado de lo apartado es mayor al disponible.';
  end if;
  if p_kind<>'pay' and p_from_reserved<>0 then
    raise exception 'Solo los pagos reales pueden utilizar dinero apartado.';
  end if;
  insert into public.debt_actions(user_id,debt_id,date,kind,amount,from_reserved)
    values(v_user,p_debt_id,p_date,p_kind,p_amount,p_from_reserved) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.record_debt_action(uuid,text,numeric,numeric,date) from public, anon;
grant execute on function public.record_debt_action(uuid,text,numeric,numeric,date) to authenticated;

-- El cierre y un apartado opcional se guardan en una única transacción.
-- Al fallar el apartado, se revierte también la jornada (sin datos a medias).
create or replace function public.save_day_close_v3(
  p_date date,
  p_odometer_end numeric,
  p_km_work numeric,
  p_income numeric default 0,
  p_operating numeric default 0,
  p_personal numeric default 0,
  p_wallet_reload numeric default 0,
  p_fuel_type text default null,
  p_fuel_amount numeric default 0,
  p_fuel_quantity numeric default 0,
  p_fuel_station text default null,
  p_fuel_odometer numeric default null,
  p_fuel_full boolean default false,
  p_fuel_exclusive boolean default false,
  p_note text default '',
  p_debt_id uuid default null,
  p_debt_reserve numeric default 0
) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  v_shift uuid;
begin
  if p_debt_reserve is null or p_debt_reserve < 0 or (p_debt_id is null and p_debt_reserve>0) then
    raise exception 'Selecciona un préstamo e importe válido.';
  end if;
  v_shift := public.save_day_close(p_date,p_odometer_end,p_km_work,p_income,p_operating,p_personal,p_wallet_reload,
    p_fuel_type,p_fuel_amount,p_fuel_quantity,p_fuel_station,p_fuel_odometer,p_fuel_full,p_fuel_exclusive,p_note);
  if p_debt_id is not null and p_debt_reserve>0 then
    perform public.record_debt_action(p_debt_id,'reserve',p_debt_reserve,0,p_date);
  end if;
  return v_shift;
end; $$;
revoke all on function public.save_day_close_v3(date,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,text,numeric,boolean,boolean,text,uuid,numeric) from public, anon;
grant execute on function public.save_day_close_v3(date,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,text,numeric,boolean,boolean,text,uuid,numeric) to authenticated;


-- Solo Mi Ruta PRO: columnas iniciales y alta de conductor en una transacción.
alter table public.vehicles
 add column if not exists started_on date not null default current_date,
 add column if not exists opening_cash numeric(12,2) not null default 0 check(opening_cash>=0),
 add column if not exists opening_wallet numeric(12,2) not null default 0 check(opening_wallet>=0);
create or replace function public.initialize_driver(
 p_display_name text,p_brand text,p_model text,p_year integer,
 p_odometer_initial numeric,p_opening_cash numeric default 0,
 p_opening_wallet numeric default 0,p_target_per_km numeric default 2,
 p_started_on date default current_date
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_vehicle uuid;
begin
 if v_user is null then raise exception 'Debes iniciar sesión.'; end if;
 if trim(coalesce(p_display_name,''))='' or length(p_display_name)>100 or
    trim(coalesce(p_brand,''))='' or trim(coalesce(p_model,''))='' or
    length(p_brand)>70 or length(p_model)>70 or p_year is null or
    p_year<1950 or p_year>2100 or
    p_odometer_initial is null or p_odometer_initial<0 or
    p_opening_cash is null or p_opening_cash<0 or
    p_opening_wallet is null or p_opening_wallet<0 or
    p_target_per_km is null or p_target_per_km<=0 or p_started_on is null
 then raise exception 'Revisa los datos iniciales.'; end if;
 if exists(select 1 from public.vehicles where user_id=v_user) then
   raise exception 'Tu cuenta ya tiene un vehículo configurado.';
 end if;
 insert into public.profiles(user_id,display_name) values(v_user,trim(p_display_name))
 on conflict(user_id) do update set display_name=excluded.display_name;
 insert into public.vehicles(user_id,brand,model,year,odometer_initial,
 target_per_km,started_on,opening_cash,opening_wallet)
 values(v_user,trim(p_brand),trim(p_model),p_year,p_odometer_initial,
 p_target_per_km,p_started_on,p_opening_cash,p_opening_wallet)
 returning id into v_vehicle;
 return v_vehicle;
end; $$;
revoke all on function public.initialize_driver(text,text,text,integer,numeric,numeric,numeric,numeric,date) from PUBLIC,anon;
grant execute on function public.initialize_driver(text,text,text,integer,numeric,numeric,numeric,numeric,date) to authenticated;

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

-- Mi Ruta PRO V6: propietarios tienen acceso a sus propios registros sin comprar una suscripción.
-- Se requiere un rol asignado de forma segura en public.app_admins; nunca se autoasigna por la web.
create or replace function public.account_can_use()
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
 or exists(select 1 from public.customer_accounts ca
   where ca.user_id=(select auth.uid()) and ca.status='active'
   and ca.expires_at >= (now() at time zone 'America/Lima')::date);
$$;
revoke all on function public.account_can_use() from public,anon;
grant execute on function public.account_can_use() to authenticated;

-- Owner creates private customer accounts with a temporary password;
-- changing encrypted_password through Supabase Auth clears the change requirement.
alter table public.customer_accounts
add column if not exists must_change_password boolean not null default false;

create or replace function private.customer_password_updated()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.customer_accounts
     set must_change_password=false, updated_at=now()
   where user_id=new.id;
  return new;
end;
$$;
revoke all on function private.customer_password_updated() from PUBLIC,anon,authenticated;
drop trigger if exists mi_ruta_customer_password_changed on auth.users;
create trigger mi_ruta_customer_password_changed
after update of encrypted_password on auth.users
for each row when(old.encrypted_password is distinct from new.encrypted_password)
execute function private.customer_password_updated();


-- Mi Ruta PRO V8 · Uso de aplicación y presencia (solo propietario puede leer).
CREATE TABLE IF NOT EXISTS public.customer_presence(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 last_seen timestamptz NOT NULL DEFAULT now(),
 active boolean NOT NULL DEFAULT false,
 page text NOT NULL DEFAULT 'inicio'
);
CREATE INDEX IF NOT EXISTS customer_presence_last_seen_idx ON public.customer_presence(last_seen DESC);
ALTER TABLE public.customer_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_presence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_presence TO authenticated;
DROP POLICY IF EXISTS owner_read_presence ON public.customer_presence;
CREATE POLICY owner_read_presence ON public.customer_presence FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.app_admins a WHERE a.user_id=(SELECT auth.uid())));

CREATE TABLE IF NOT EXISTS public.customer_activity(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 event text NOT NULL CHECK(event IN ('apertura','pagina','jornada','combustible','movimiento',
 'prestamo','pago_aporte','meta','mantenimiento','vehiculo')),
 page text,
 happened_at timestamptz NOT NULL DEFAULT now(),
 CHECK(page IS NULL OR page IN ('inicio','cierre','jornadas','movimientos','combustible',
 'analisis','metas','pagos','mantenimiento','configuracion'))
);
CREATE INDEX IF NOT EXISTS customer_activity_user_time ON public.customer_activity(user_id,happened_at DESC);
CREATE INDEX IF NOT EXISTS customer_activity_time ON public.customer_activity(happened_at DESC);
ALTER TABLE public.customer_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_activity FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_activity TO authenticated;
DROP POLICY IF EXISTS owner_read_activity ON public.customer_activity;
CREATE POLICY owner_read_activity ON public.customer_activity FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.app_admins a WHERE a.user_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.touch_customer_presence(p_page text DEFAULT 'inicio',p_active boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid := (SELECT auth.uid());
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;
 IF p_page IS NULL OR p_page NOT IN ('inicio','cierre','jornadas','movimientos','combustible',
 'analisis','metas','pagos','mantenimiento','configuracion','administracion')
 THEN RAISE EXCEPTION 'Página no válida.'; END IF;
 INSERT INTO public.customer_presence(user_id,last_seen,active,page)
 VALUES(v_user,now(),COALESCE(p_active,false),p_page)
 ON CONFLICT(user_id) DO UPDATE
 SET last_seen=now(),active=COALESCE(p_active,false),page=EXCLUDED.page;
END; $$;
REVOKE ALL ON FUNCTION public.touch_customer_presence(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.touch_customer_presence(text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_customer_visit(p_kind text,p_page text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid := (SELECT auth.uid());
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;
 IF p_kind NOT IN ('apertura','pagina') OR
  (p_kind='pagina' AND (p_page IS NULL OR p_page NOT IN
   ('inicio','cierre','jornadas','movimientos','combustible','analisis','metas','pagos','mantenimiento','configuracion')))
  OR (p_kind='apertura' AND p_page IS NOT NULL)
 THEN RAISE EXCEPTION 'Actividad no válida.'; END IF;
 INSERT INTO public.customer_activity(user_id,event,page)
 SELECT v_user,p_kind,p_page WHERE NOT EXISTS(
 SELECT 1 FROM public.customer_activity e
 WHERE e.user_id=v_user AND e.event=p_kind
 AND e.page IS NOT DISTINCT FROM p_page
 AND e.happened_at>now()-CASE WHEN p_kind='apertura' THEN interval '2 minutes' ELSE interval '15 seconds' END);
END; $$;
REVOKE ALL ON FUNCTION public.record_customer_visit(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_visit(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.track_customer_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.customer_activity(user_id,event,happened_at)
 VALUES(NEW.user_id,TG_ARGV[0],now());
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.track_customer_action() FROM PUBLIC,anon,authenticated;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('shifts','jornada'),('fuel','combustible'),('movements','movimiento'),
 ('debts','prestamo'),('debt_actions','pago_aporte'),('goals','meta'),
 ('maintenance','mantenimiento'),('vehicles','vehiculo')
 ) AS x(tablename,eventtype)
 LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS log_usage_insert ON public.%I',r.tablename);
 EXECUTE format('CREATE TRIGGER log_usage_insert AFTER INSERT ON public.%I FOR EACH ROW
 EXECUTE FUNCTION private.track_customer_action(%L)',r.tablename,r.eventtype);
 END LOOP;
END $$;


-- Mi Ruta PRO V9 · Tiempo de uso visible estimado, acumulado por día.
CREATE TABLE IF NOT EXISTS public.customer_usage_daily(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 day date NOT NULL,
 active_seconds integer NOT NULL DEFAULT 0 CHECK(active_seconds>=0),
 PRIMARY KEY(user_id,day)
);
CREATE INDEX IF NOT EXISTS customer_usage_daily_day ON public.customer_usage_daily(day DESC);
ALTER TABLE public.customer_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_usage_daily FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_usage_daily TO authenticated;
DROP POLICY IF EXISTS owner_read_usage_daily ON public.customer_usage_daily;
CREATE POLICY owner_read_usage_daily ON public.customer_usage_daily FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.app_admins a WHERE a.user_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.touch_customer_presence(p_page text DEFAULT 'inicio',p_active boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_last timestamptz;
 v_was_active boolean;
 v_now timestamptz := now();
 v_seconds int := 0;
 v_day date := (now() at time zone 'America/Lima')::date;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;
 IF p_page IS NULL OR p_page NOT IN ('inicio','cierre','jornadas','movimientos',
 'combustible','analisis','metas','pagos','mantenimiento','configuracion','administracion')
 THEN RAISE EXCEPTION 'Página no válida.'; END IF;
 SELECT last_seen,active INTO v_last,v_was_active
 FROM public.customer_presence WHERE user_id=v_user FOR UPDATE;
 IF COALESCE(p_active,false) AND v_was_active AND v_last IS NOT NULL AND
 v_now-v_last<=interval '100 seconds' THEN
 v_seconds:=LEAST(60,GREATEST(0,FLOOR(EXTRACT(EPOCH FROM v_now-v_last))::int));
 END IF;
 INSERT INTO public.customer_presence(user_id,last_seen,active,page)
 VALUES(v_user,v_now,COALESCE(p_active,false),p_page)
 ON CONFLICT(user_id) DO UPDATE
 SET last_seen=v_now,active=COALESCE(p_active,false),page=EXCLUDED.page;
 IF v_seconds>0 THEN
 INSERT INTO public.customer_usage_daily(user_id,day,active_seconds)
 VALUES(v_user,v_day,v_seconds)
 ON CONFLICT(user_id,day) DO UPDATE
 SET active_seconds=public.customer_usage_daily.active_seconds+EXCLUDED.active_seconds;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.touch_customer_presence(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.touch_customer_presence(text,boolean) TO authenticated;

-- Mi Ruta PRO V12 — reportes por día, semana y mes (solo propietario)
-- GLP se mantiene en litros dentro de la BD y se comunica en galones.
CREATE OR REPLACE FUNCTION private.owner_period_summary_impl(p_grain text, p_periods integer)
 RETURNS TABLE(user_id uuid, period_start date, income numeric, operating_cost numeric, fuel_cost numeric, glp_cost numeric, net_profit numeric, km_total numeric, km_work numeric, glp_gallons numeric, glp_km_per_gallon numeric, valid_glp_cycles integer, worked_days integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.app_admins a WHERE a.user_id=(SELECT auth.uid())
 ) THEN
  RAISE EXCEPTION 'Acceso exclusivo del propietario' USING ERRCODE='42501';
 END IF;
 IF p_grain NOT IN ('day','week','month') OR p_periods IS NULL OR p_periods<1 OR
    (p_grain='day' AND p_periods>31) OR
    (p_grain='week' AND p_periods>12) OR
    (p_grain='month' AND p_periods>12)
 THEN RAISE EXCEPTION 'Período de reporte inválido'; END IF;
 RETURN QUERY
 WITH customers AS (
  SELECT c.user_id FROM public.customer_accounts c
  WHERE NOT EXISTS(SELECT 1 FROM public.app_admins a WHERE a.user_id=c.user_id)
 ),
 periods AS (
  SELECT (date_trunc(p_grain,now() AT TIME ZONE 'America/Lima')
     - g.i * CASE p_grain WHEN 'day' THEN interval '1 day'
                       WHEN 'week' THEN interval '1 week'
                       ELSE interval '1 month' END)::date AS d
  FROM generate_series(0,p_periods-1) AS g(i)
 ),
 worked AS (
  SELECT s.user_id,date_trunc(p_grain,s.date::timestamp)::date AS d,
     sum(s.km_total) AS km,sum(s.km_work) AS work_km,count(*)::integer AS days
  FROM public.shifts s WHERE s.date >= (SELECT min(d) FROM periods)
  GROUP BY s.user_id,date_trunc(p_grain,s.date::timestamp)::date
 ),
 financial AS (
  SELECT m.user_id,date_trunc(p_grain,m.date::timestamp)::date AS d,
   sum(m.amount) FILTER(WHERE m.kind='ingreso') AS earned,
   sum(m.amount) FILTER(WHERE m.kind='gasto_operativo') AS spent
  FROM public.movements m WHERE m.date >= (SELECT min(d) FROM periods)
  GROUP BY m.user_id,date_trunc(p_grain,m.date::timestamp)::date
 ),
 fuel_spending AS (
  SELECT f.user_id,date_trunc(p_grain,f.date::timestamp)::date AS d,
   sum(f.amount) AS all_fuel,
   sum(f.amount) FILTER(WHERE f.fuel_type='GLP') AS glp_paid,
   sum(f.quantity) FILTER(WHERE f.fuel_type='GLP') AS glp_liters
  FROM public.fuel f WHERE f.date >= (SELECT min(d) FROM periods)
  GROUP BY f.user_id,date_trunc(p_grain,f.date::timestamp)::date
 ),
 full_glp AS (
  SELECT f.user_id,f.id,f.date,f.odometer,f.station,f.exclusive_usage,f.created_at,
   lag(f.odometer) OVER(PARTITION BY f.user_id ORDER BY f.odometer,f.created_at,f.id) AS prev_odo,
   lag(f.station) OVER(PARTITION BY f.user_id ORDER BY f.odometer,f.created_at,f.id) AS prev_station
  FROM public.fuel f WHERE f.fuel_type='GLP' AND f.full_tank
 ),
 good_cycles AS (
  SELECT f.user_id,date_trunc(p_grain,f.date::timestamp)::date AS d,
   f.odometer-f.prev_odo AS km, q.liters
  FROM full_glp f
  JOIN LATERAL (
    SELECT
     sum(x.quantity) FILTER(WHERE x.fuel_type='GLP') AS liters,
     count(*) FILTER(WHERE x.fuel_type<>'GLP') AS other_types,
     coalesce(bool_and(coalesce(lower(trim(x.station))=lower(trim(f.prev_station)),false))
       FILTER(WHERE x.fuel_type='GLP' AND NOT x.full_tank),true) AS partial_same
    FROM public.fuel x
    WHERE x.user_id=f.user_id
      AND x.odometer>f.prev_odo AND x.odometer<=f.odometer
  ) q ON true
  WHERE f.prev_odo IS NOT NULL AND f.odometer>f.prev_odo
     AND f.exclusive_usage=true AND nullif(trim(f.prev_station),'') IS NOT NULL
     AND q.liters>0 AND q.other_types=0 AND q.partial_same
 ),
 efficiency AS (
  SELECT c.user_id,c.d,
   sum(c.km)*3.785411784 / nullif(sum(c.liters),0) AS kpg,
   count(*)::integer AS cycles
  FROM good_cycles c
  GROUP BY c.user_id,c.d
 )
 SELECT cu.user_id,pe.d,
  round(coalesce(fi.earned,0),2),
  round(coalesce(fi.spent,0),2),
  round(coalesce(fs.all_fuel,0),2),
  round(coalesce(fs.glp_paid,0),2),
  round(coalesce(fi.earned,0)-coalesce(fi.spent,0)-coalesce(fs.all_fuel,0),2),
  round(coalesce(w.km,0),1),
  round(coalesce(w.work_km,0),1),
  round(coalesce(fs.glp_liters,0)/3.785411784,3),
  round(eff.kpg,2),
  coalesce(eff.cycles,0),
  coalesce(w.days,0)
 FROM customers cu CROSS JOIN periods pe
 LEFT JOIN worked w ON w.user_id=cu.user_id AND w.d=pe.d
 LEFT JOIN financial fi ON fi.user_id=cu.user_id AND fi.d=pe.d
 LEFT JOIN fuel_spending fs ON fs.user_id=cu.user_id AND fs.d=pe.d
 LEFT JOIN efficiency eff ON eff.user_id=cu.user_id AND eff.d=pe.d
 ORDER BY cu.user_id,pe.d DESC;
END;
$function$
;
REVOKE ALL ON FUNCTION private.owner_period_summary_impl(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.owner_period_summary_impl(text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.owner_period_summary(p_grain text DEFAULT 'week'::text, p_periods integer DEFAULT 8)
 RETURNS TABLE(user_id uuid, period_start date, income numeric, operating_cost numeric, fuel_cost numeric, glp_cost numeric, net_profit numeric, km_total numeric, km_work numeric, glp_gallons numeric, glp_km_per_gallon numeric, valid_glp_cycles integer, worked_days integer)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT * FROM private.owner_period_summary_impl(p_grain,p_periods);
$function$
;
REVOKE ALL ON FUNCTION public.owner_period_summary(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_period_summary(text,integer) TO authenticated;


-- Mi Ruta PRO V13 — privacidad: dejar de recoger estadísticas de sesión y presencia.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['shifts','fuel','movements','debts','debt_actions','goals','maintenance','vehicles'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS log_usage_insert ON public.%I',t);
 END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.touch_customer_presence(text,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_customer_visit(text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.touch_presence_impl(text,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.record_visit_impl(text,text) FROM authenticated;
