
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
