# Mi Ruta PRO Intelligence · cierre diario + grifos GLP (versión de prueba)

Migración gradual desde el archivo V4 de Mi Ruta PRO. La app conserva los módulos de odómetro, jornadas, movimientos, metas, mantenimiento y combustible. **No modifica FHERDANI PRO**.

## Lo nuevo

1. **Cerrar mi día:** un formulario con fecha, odómetro, km de trabajo e ingresos del día. Los gastos son opcionales y se agregan en el mismo cierre. No pide datos cada hora.
2. **Combustible / grifo:** en cualquier carga se registra fecha, nombre del grifo, tipo (GLP/gasolina/GNV), lectura de odómetro, importe, litros/m³ y tanque lleno o parcial. Se recuerdan los nombres ya usados.
3. **Rendimiento del GLP por grifo:** cálculo entre tanques llenos. Solo se comparan ciclos con uso exclusivo confirmado del mismo combustible y sin mezcla de grifos en las recargas parciales intermedias. El ciclo se atribuye al grifo del llenado **inicial**, no al del cierre; la recarga del final estima lo consumido. Para recomendar un grifo se requieren **3 ciclos válidos por grifo y al menos 2 grifos comparables**. La ruta, el clima, la calibración del surtidor y el tráfico influyen: no es prueba de calidad del producto.
4. **Intelligence diario:** lunes a domingo por promedio de saldo neto operativo por *jornada* y saldo/km trabajado. Solo cuenta fechas con jornadas; sin jornada no equivale a cero. Nunca pide ingresos por horas. A partir de tres cierres por día de la semana emite una recomendación prudente.
5. **Demostración:** botón «Ver demostración» en acceso para conocer la interfaz sin base de datos. Los datos son **ficticios** y se pierden al salir o recargar.

## Activación de usuarios reales

1. Crear Supabase nuevo **exclusivo de Mi Ruta PRO**, separado de FHERDANI PRO. Requiere confirmar cualquier costo aplicable. Si se crea uno nuevo, ejecutar `schema.sql` una sola vez. Si ya existía uno con tablas V1, ejecutar únicamente `migration_v2.sql`.
2. Activar Supabase Auth correo/contraseña y confirmación de correo.
3. En `config.js` completar la URL y **clave pública** (`publishable` o legacy `anon`). Nunca escribir `service_role`, tokens privados ni contraseñas en GitHub.
4. Vercel: conectar repositorio `gianloamar-crypto/gflm-systems`, **Root Directory `mi-ruta-pro`**, framework Other. El código es HTML/JS estático: no requiere paquetes npm para desplegar. Los datos se guardan en Supabase con políticas RLS por usuario.
5. Probar dos cuentas, la función SQL `save_day_close`, borrados, valores de odómetro, cierres de jornada duplicados y acceso cruzado denegado ANTES de permitir clientes reales.

## Reglas importantes

- **El odómetro** es la referencia para calcular kilómetros; no inventar lecturas.
- Combustible pagado no equivale necesariamente a consumo de combustible del mismo día.
- Combustible de `fuel` no se duplica en gastos operativos de `movements`.
- Recarga del saldo de la app es transferencia, nunca comisión.
- Gastos personales afectan el flujo, no el saldo operativo.
- Proyecciones de metas requieren al menos tres jornadas.
- Los cierres rápidos se guardan con una operación de base de datos **atómica** mediante `public.save_day_close()`; fallar una operación impide que se guarden las demás.
- Se necesita recuperar y comparar el código de Apps Script original para asegurar equivalencia total con V4.

## Verificación local

Con Node.js 18+: `node --test tests/analytics.test.mjs`. Sin Node, la web se puede abrir con un servidor estático; `app.js` usa ES modules.

**Estado:** versión de prueba. La URL desplegada puede mostrar una demostración sin cuenta. La autenticación real no está activada hasta disponer de un Supabase aislado y ejecutar SQL. No se han migrado historiales privados de V4.

## V3: Préstamos y pagos (sin conexión a billetera)

- Nueva pestaña **Préstamos y pagos**: nombre, tipo, importe y fecha límite; calcula cuánto apartar por día hasta la fecha indicada, en calendario local de Perú.
- **Apartado**: una cantidad declarada como reservada. **Pago real**: un abono efectivamente efectuado al acreedor, que reduce la deuda. Si el pago utilizó dinero apartado, se rebaja de lo reservado sin contarlo dos veces. **Retirar de apartado**: libera una reserva.
- La sección de cierre diario permite apartar un importe opcional para un compromiso. No exige movimientos durante el día ni depende de integraciones bancarias.
- El saldo operativo no se altera al apartar; solo los pagos reales se incluyen en el flujo personal. No registrar el mismo pago como gasto personal adicional en Movimientos.
- Se redujeron las categorías visibles para nuevos movimientos, sin alterar las etiquetas históricas.
- Base de datos nueva: `schema.sql` (incluye V2 y V3). Base existente Mi Ruta PRO V2: ejecutar `migration_v3.sql` **solo allí**. Nunca aplicar en FHERDANI PRO.
- Para despliegues con cuentas reales, ejecutar la migración antes de activar la nueva versión. Las pruebas de aislamiento RLS requieren dos cuentas reales de prueba y conexión a la base propia.
- En demostración los registros son temporales. Un apartado declarado no demuestra que el dinero exista en una billetera o cuenta bancaria.

## V4 — Inicio real en cero (noviembre de 2026)

- Proyecto Supabase independiente, con tablas vacías inicialmente. No se borran datos de otras cuentas ni de FHERDANI PRO.
- El botón de demostración se ha quitado de la pantalla principal para comenzar con datos reales.
- Registro de correo y contraseña desde la web, verificación de correo según la configuración de Supabase y sesión privada por usuario.
- A la primera entrada, si la cuenta todavía no tiene vehículo, la pantalla de configuración solicita nombre, marca/modelo/año, fecha de inicio, odómetro inicial, efectivo inicial y billetera inicial (ambos pueden ser S/ 0), más meta por km opcional.
- El formulario usa `initialize_driver` para crear perfil y vehículo de forma atómica, respetando RLS. Los saldos iniciales son referencias y **nunca** ingresos ni gastos operativos.
- Antes de usar la aplicación real: en Supabase Authentication → URL Configuration, configurar Site URL `https://mi-ruta-pro.vercel.app` y Redirect URLs autorizadas. No compartir contraseñas en ChatGPT ni almacenarlas en GitHub.
- Si el proyecto ya está en V3, ejecutar únicamente `migration_v4.sql`; para instalación desde cero, el archivo `schema.sql` actualizado contiene todas las migraciones.

## V5 — Comercialización y control del propietario
- El registro solo envía una **solicitud de acceso**. Nadie puede trabajar hasta que el propietario lo active.
- Panel «Mis clientes» exclusivo para rol autorizado en `app_admins` (no por metadatos editables).
- Estados: pendiente, activo y suspendido; activo con fecha vencida se muestra «Vencido».
- El propietario controla plan y vencimiento; **no se procesan pagos en línea** ni se visualizan finanzas de clientes.
- La autorización se aplica también en políticas RLS de las tablas, no solo en la interfaz.
- Para establecer el primer propietario, crea una cuenta con tu correo, confirma el correo, y después ejecuta en el SQL Editor (con permisos de propietario de la base):

```sql
insert into public.app_admins (user_id)
select id from auth.users
where lower(email) = lower('CORREO_DEL_PROPIETARIO')
  and email_confirmed_at is not null
on conflict (user_id) do nothing;
```

No habilitar una cuenta de propietario sin verificar primero que el correo le pertenezca. La web no puede otorgarse administradores a sí misma.

## V6 — Propietario y panel comercial

- El propietario se asigna de manera controlada en Supabase, sin acceso público para crear administradores.
- El propietario puede usar el sistema sin vencimiento propio; los clientes sí requieren estado activo y fecha vigente.
- La cuenta propietaria no aparece en la cola de clientes pendientes.
- Para actualizar desde V5, aplicar `migration_v6_owner_access.sql`. Para instalaciones nuevas, `schema.sql` incluye la política más reciente.
- Confirmar el correo antes de usar la cuenta. No compartir claves privadas ni contraseñas.

## V7 — Solo el propietario crea las cuentas
- Registro público retirado de la interfaz. «Mis clientes» permite generar cuentas desde una Edge Function segura `manage-clients`.
- Las credenciales temporales se muestran una sola vez al propietario; no se almacenan en el navegador ni en el repositorio.
- Primer acceso: cambio de contraseña obligatorio; trigger protegido `customer_password_updated` elimina el requisito tras cambiarla.
- La clave privada de administración permanece en Supabase Edge Functions.
- Para impedir incluso el registro directo por API, en Supabase Dashboard → Authentication → Providers, desactivar **Allow new users to sign up**. No hay herramienta conectada para cambiar ese ajuste desde esta conversación.

## V8/V9 — Panel de uso y presencia de clientes (noviembre de 2026)

El propietario mantiene la creación y control de cuentas: correo, plan, contraseña temporal generada de forma segura, cambio obligatorio de contraseña, fechas y suspensiones. **No se cambió ese flujo**.

- «En línea» es una estimación basada en los últimos **120 segundos** y una pestaña visible; no es una garantía de conexión instantánea. Se actualiza visualmente aproximadamente cada 45 segundos.
- La actividad por cliente muestra últimos accesos, aperturas, visitas a módulos, días activos, cierres de jornada, recargas, otros registros y minutos aproximados de uso activo. El reporte permite 7/30/90 días y exportación CSV.
- Los minutos se acumulan en Supabase con un pulso mientras la web está visible (intervalo de 45 s, brechas limitadas a 60 s); pestañas suspendidas o sin visibilidad no se cuentan indefinidamente. Son métricas aproximadas, no un registro laboral de horas.
- La bitácora solo almacena nombre del módulo y tipo de operación; los eventos de registros reales se generan mediante triggers de la base de datos, sin copiar importes, saldos, ubicaciones, datos del préstamo ni datos de viajes.
- Las tablas `customer_presence`, `customer_activity` y `customer_usage_daily` tienen RLS y acceso solo a propietario; nadie tiene escritura directa desde el navegador (la web usa funciones con identidad verificada).
- La trazabilidad inicia **desde esta actualización**; no se reconstruye artificialmente el historial anterior. Las métricas no son base de facturación automatizada.
- Migraciones sobre Supabase exclusivo de Mi Ruta PRO: `migration_v8_activity_reports.sql` y `migration_v9_active_minutes.sql`.

## V12/V13 — Operación comercial definitiva (Perú)

- Tú creas las cuentas con correo y **contraseña temporal de tu elección** (8 a 72 caracteres, letras y números; sin exigir símbolos). El cliente cambia su contraseña al primer ingreso y después ve obligatoriamente la configuración inicial «¿Con cuánto comienzas tu ruta?»: nombre, vehículo, odómetro, efectivo y billetera inicial. No se contabilizan saldos iniciales como ingresos.
- GLP y gasolina se **introducen y visualizan en galones estadounidenses (1 gal = 3.785411784 L)**; GNV permanece en m³. Para conservar datos históricos, Supabase guarda los volúmenes GLP/gasolina internamente en litros y la interfaz convierte tanto al guardar como al consultar.
- «Mis clientes» del propietario presenta informes **diarios (14 días), semanales (8 semanas), mensuales (6 meses)**, totales y por conductor; ingresos, ganancia neta operativa, km total y de trabajo, GLP pagado en soles y galones, y km/gal cuando existe ciclo verificable. Exporta CSV.
- Ganancia operativa = ingresos - otros costos laborales - combustible pagado (GLP y otros). No resta gastos personales ni préstamos. El GLP pagado no es sinónimo del GLP consumido. El km/gal solo se calcula con ciclos válidos entre tanques llenos, uso exclusivo verificado y sin cargas de otro combustible intermedias.
- Los reportes los entrega una función PostgreSQL protegida por rol de propietario, con **solo agregados** y nunca movimientos particulares. Se quitó de la interfaz la presencia, los minutos de pantalla y la analítica de sesiones; se deshabilitó su recogida futura. El historial anterior no se elimina.
- Migraciones: `migration_v12_owner_period_summary.sql` y `migration_v13_stop_usage_tracking.sql`. Se añadieron también a `schema.sql`.
- Las contraseñas no se guardan en `customer_accounts` ni en GitHub. La clave temporal se muestra una única vez en la interfaz tras crear/restablecer una cuenta; se entrega por canal privado. El propietario no conoce la contraseña personal posterior.

## V14 — Endurecimiento de seguridad

- El servidor bloquea los registros de usuarios con contraseña temporal pendiente de cambiar, aunque intenten saltarse la interfaz. El propietario conserva su acceso.
- Vercel implementa CSP, anti-iframe, no-referrer, HSTS, no-sniff, permissions-policy, noindex y políticas de caché para distribuir correcciones.
- Deshabilitados listados de archivos, exposición de sourcemaps, vistas previas y acceso de soporte al código en la configuración del proyecto (verificar las opciones permitidas por el plan).
- Repositorio GitHub actual **público** y compartido con otros proyectos; no puede ocultarse desde un cliente web ni desde los permisos de este conector. Requiere administrar la visibilidad o migrar Mi Ruta PRO a repositorio privado.
- Pendiente en Supabase Dashboard: desactivar registro público, activar protección de contraseñas filtradas, limitar intentos de Auth y habilitar MFA del propietario.
- No afirmar que una web sea totalmente anticopiable o inhackeable.
