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
