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


## Web v4 · Field Operations (Vercel)

**URL:** https://gflm-systems.vercel.app

La app web vive en \`web/\` y conserva el programa de escritorio Python/SQLite por separado. Esta revisión sustituye la portada genérica por un centro de mando de obra y agrega:

- Prioridades según vencimientos, requerimientos críticos, comprobantes y actas sin verificar.
- Actas de custodia, transferencias, retiros y devoluciones con espacios de firma para imprimir.
- Valorizaciones, facturas por cobrar, retenciones y alertas.
- Maquinaria: horómetro, combustible, costos y mantenimiento.
- Centro WhatsApp con **un solo número de destino** y dos flujos (requerimientos / rendiciones), prellenado de mensajes, historial local de aperturas y confirmación manual de envíos.
- Captura rápida: pega mensajes de WhatsApp o escribe «Gasté S/250 en flete, factura pendiente» / «Necesito 30 bolsas de cemento para mañana» para preparar un formulario editable que tú confirmas.
- Fotografías desde cámara del teléfono y PDFs como evidencias vinculadas a registros, guardados en IndexedDB **solo en el navegador**. El archivo se identifica con SHA-256, pero no es una custodia inalterable ni una certificación legal.

### Límites de esta versión

**No uses información sensible real**: la web carece todavía de inicio de sesión, permisos de usuario y base de datos centralizada. Los datos son locales a cada navegador; borrar sus datos puede destruir los registros. El respaldo JSON actual **no** incluye fotos ni PDFs de IndexedDB: estos deben descargarse por separado. La bitácora y hash locales no sustituyen una auditoría del servidor. WhatsApp se abre con enlace \`wa.me\`: **no recibe mensajes automáticamente, no envía en segundo plano ni comprueba entrega**. La integración automática requiere autorización y configuración de Meta WhatsApp Cloud API, webhook y base de datos con autenticación.

**Despliegue:** Vercel conectado a rama \`main\` del repositorio GitHub, con directorio raíz \`web\`.
