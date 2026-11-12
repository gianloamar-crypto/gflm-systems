-- Mi Ruta PRO V14 | Enforce first-login temporary password rotation on the server.
-- Safe to reapply. Existing users and records remain unchanged.
CREATE OR REPLACE FUNCTION public.account_can_use()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.app_admins a WHERE a.user_id=(SELECT auth.uid()))
 OR EXISTS(SELECT 1 FROM public.customer_accounts c
  WHERE c.user_id=(SELECT auth.uid()) AND c.status='active'
    AND NOT c.must_change_password
    AND c.expires_at >= (now() AT TIME ZONE 'America/Lima')::date);
$$;
REVOKE ALL ON FUNCTION public.account_can_use() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_can_use() TO authenticated;
