
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
