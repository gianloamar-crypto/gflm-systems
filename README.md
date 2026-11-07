# GFLM Systems · Escritorio v3

Aplicación local de administración de obras, desarrollada con Python, Tkinter y SQLite. El proyecto **no comparte datos** con FHERDANI PRO. El repositorio incluye solo código, no datos ni comprobantes.

## Arranque en Windows

1. Instala Python 3 con Tkinter desde python.org y marca **Add Python to PATH**.
2. Extrae el ZIP completo y ejecuta `instalar_dependencias.bat` una vez (instala librerías opcionales de PDF y lectura).
3. Ejecuta `iniciar_windows.bat`. Alternativamente: `py -3 app.py`.
4. Los datos se guardan en `%USERPROFILE%\GFLM_Systems\gflm.sqlite3`; las evidencias en `evidencias` y los respaldos en `respaldos`.

## Módulos

Panel de control, obras, proveedores, requerimientos, órdenes de compra, compras/comprobantes, caja y rendiciones, Kardex, personal, tareos, planillas, alquileres, agenda, contratos y seguros, evidencias documentales y auditoría.

Flujo sugerido: registra un requerimiento → prepara OC en PDF para firma física → registra compra y adjunta comprobante → registra pago desde compra → confirma ingreso real a almacén y genera guía interna PDF → imprime, recoge firmas en papel y carga la foto firmada. **No se firma en pantalla.**

- Las entradas/salidas de inventario se calculan por obra, material y unidad; no permite generar saldo negativo.
- Las compras y la caja son registros separados: una compra **no duplica un pago** automáticamente; lo vinculas al registrar el pago.
- Los pagos hechos con dinero propio se muestran separados de los fondos de empresa y reembolsos.
- El Excel de rendición incluye ingresos, gastos, comprobantes de todo tipo, requerimientos, Kardex y evidencias.
- El tareo se exporta por rango de fechas; los montos legales de planilla requieren configuración y validación de tu régimen laboral.
- Los PDF imprimibles incluyen campos para firmas manuscritas; las firmas cargadas se registran como evidencia, y luego se marcan verificadas.
- La lectura preliminar de comprobantes requiere PyMuPDF para PDFs digitales o Tesseract OCR instalado aparte para fotos. **No verifica SUNAT** ni garantiza exactitud, requiere revisión.
- Alertas se muestran al abrir el programa, **no** se envían todavía por WhatsApp.

## Seguridad, límites y respaldo

El repositorio GitHub puede ser público, por lo que **nunca subas datos, fotos, planillas, claves, números de trabajadores o facturas reales**. El SQLite local no tiene cifrado ni login; úsalo en una PC protegida, respalda la base y la carpeta de evidencias regularmente. El botón de respaldo guarda un ZIP con SQLite y la carpeta de evidencias. Almacena también ese ZIP en un lugar externo seguro.

No incluye actualmente: webhook ni bot bidireccional WhatsApp Business, notificaciones cuando la PC está apagada, sincronización celular/nube, validación electrónica SUNAT, cálculo automático completo de aportes o emisión tributaria formal. Para esas funciones hará falta una capa web protegida, credenciales y pruebas adicionales.

## Desarrollo y pruebas

`python -m unittest discover -s tests -v`

Para correr interfaz: `python app.py`.

## Migración

Reutiliza el SQLite de v1/v2 ubicado en el mismo directorio de usuario. El sistema agrega columnas y módulos sin borrar registros anteriores. Haz una copia de seguridad antes de actualizar.
