# Mi Ruta PRO — Web independiente

Versión base para migración desde el libro de trabajo **Mi_Ruta_PRO_V4_Combustible_Metas_Colaborativo.xlsx**. No modifica el archivo original ni FHERDANI PRO.

## Activación
1. Crear un proyecto **Supabase propio** de Mi Ruta PRO (distinto de FHERDANI).
2. Ejecutar `schema.sql` en ese nuevo proyecto.
3. Activar Email/Password en Supabase Auth y confirmar el correo, según preferencia.
4. Completar `config.js` con la **URL del proyecto** y la **clave pública/anon publishable**. Nunca usar secret key/service_role en cliente.
5. Publicar estos archivos en un proyecto Vercel, framework `Other`, directorio raíz. En Vercel solo se alojan archivos de interfaz; los datos se guardan en Supabase.
6. Probar dos cuentas de correo diferentes: cada una debe ver solo sus vehículos, ingresos, jornadas, combustibles y metas. Verificar CRUD y RLS de ambas cuentas antes de vender.

## Funciones incorporadas
- Inicio de sesión/registro independiente por correo, RLS para cada tabla.
- Vehículo y odómetro inicial, jornadas, separación trabajo/personal.
- Movimientos diferenciados: ingreso, gasto operativo, gasto personal, recarga a billetera de app.
- Control combustible GLP/Gasolina/GNV y rendimiento entre llenados completos.
- Metas y proyecciones, mantenimiento y alertas por odómetro.
- Nuevo análisis lunes-domingo: promedio neto por jornada, total neto, ingresos, costos, número de jornadas, período 7/30/90 días/todo.
- Exportación privada JSON y diseño responsive.

## Reglas conservadas
- Las recargas de aplicaciones de movilidad son transferencias, no costos.
- Los gastos personales afectan flujo de caja, no utilidad operativa.
- El combustible pagado se contabiliza una sola vez como costo al abastecer, no duplicar en Movimientos.
- Las jornadas deben registrarse en orden temporal y respetar lecturas sucesivas del odómetro.
- Los ciclos de rendimiento usan únicamente llenados completos del mismo combustible.
- No calcular proyecciones de metas con menos de 3 jornadas reales.
- No inventar resultados históricos.

## Límites de esta versión
La migración ha sido contrastada con las reglas y categorías del XLSX V4 conservado, pero faltan el código original de Apps Script y pruebas de equivalencia detalladas. Por tanto, esta entrega aún NO puede presentarse como clon exacto o migración de datos completa. El análisis de días usa importes por fecha de pago; no prorratea automáticamente combustible consumido, que puede diferir del pagado. Para uso público, completar pruebas de autenticación/RLS, validación de odómetro y recorridos y auditoría de seguridad antes de producción.

## Repositorio GitHub y Vercel
El código puede alojarse en la subcarpeta `mi-ruta-pro/` del repositorio `gflm-systems` sin modificar sus otros archivos.
En Vercel configura **Root Directory**: `mi-ruta-pro` y selecciona el framework **Other** para servir archivos estáticos.

## Estado de seguridad y publicación
Sin un proyecto Supabase propio y las credenciales públicas en `config.js`, el formulario de acceso permanece intencionalmente deshabilitado. La interfaz no guarda datos reales en el navegador. No reutilizar la base de datos ni las credenciales de FHERDANI PRO.