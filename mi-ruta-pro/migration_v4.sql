
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
