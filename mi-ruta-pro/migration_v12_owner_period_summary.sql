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
