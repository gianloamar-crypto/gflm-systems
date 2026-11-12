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
