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
