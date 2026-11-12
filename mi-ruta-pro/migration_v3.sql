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
