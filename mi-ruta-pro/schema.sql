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
