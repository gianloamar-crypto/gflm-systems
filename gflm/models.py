"""Catálogo de módulos y formularios de GFLM Systems. No contiene datos privados."""
from dataclasses import dataclass
from typing import Tuple

@dataclass(frozen=True)
class Field:
    key: str
    label: str
    kind: str = "text"       # text, date, money, number, choice, multiline, file, worker
    required: bool = False
    options: Tuple[str, ...] = ()

@dataclass(frozen=True)
class Module:
    table: str
    title: str
    subtitle: str
    icon: str
    fields: Tuple[Field, ...]
    columns: Tuple[str, ...]

F = Field
MODULES = [
    Module("obras", "Obras", "Frentes, contratos y proyectos bajo tu administración", "OB", (
        F("nombre", "Nombre de la obra", required=True), F("ubicacion", "Ubicación"), F("cliente", "Contratante"),
        F("codigo", "Código interno"), F("estado", "Estado", "choice", options=("Activa", "Suspendida", "Finalizada")),
        F("inicio", "Inicio", "date"), F("fin", "Fin previsto", "date"), F("notas", "Observaciones", "multiline")),
        ("nombre", "ubicacion", "cliente", "estado")),
    Module("proveedores", "Proveedores", "Directorio con RUC, contactos y condiciones", "PR", (
        F("razon_social", "Razón social / Nombre", required=True), F("ruc", "RUC / Documento"),
        F("telefono", "Teléfono"), F("correo", "Correo"), F("rubro", "Rubro"), F("condiciones", "Condiciones de pago"),
        F("notas", "Observaciones", "multiline")), ("razon_social", "ruc", "telefono", "rubro")),
    Module("requerimientos", "Requerimientos", "Solicitudes, prioridad, compra y fechas de entrega", "RQ", (
        F("fecha", "Fecha de solicitud", "date", True), F("obra", "Obra", required=True),
        F("detalle", "Materiales / descripción", "multiline", True), F("solicitante", "Quién solicita"),
        F("prioridad", "Prioridad", "choice", True, ("Normal", "Urgente", "Crítica")),
        F("entrega", "Fecha límite", "date"), F("estado", "Estado", "choice", True,
          ("Pendiente", "En cotización", "Aprobado", "Comprado", "Entregado", "Cerrado", "Cancelado")),
        F("responsable", "Responsable"), F("notas", "Notas", "multiline"), F("archivo", "Evidencia", "file")),
        ("fecha", "obra", "detalle", "prioridad", "entrega", "estado")),
    Module("compras", "Compras / comprobantes", "Facturas, boletas, notas de venta y facturas por recibir", "CP", (
        F("fecha", "Fecha de compra", "date", True), F("obra", "Obra", required=True),
        F("proveedor", "Proveedor", required=True), F("ruc", "RUC del emisor"),
        F("concepto", "Concepto", "multiline", True), F("tipo", "Tipo de comprobante", "choice", True,
          ("Factura", "Boleta", "Nota de venta", "Sin comprobante", "Factura pendiente")),
        F("serie_numero", "Serie y número"), F("valor_venta", "Valor de venta (S/)", "money"),
        F("igv", "IGV (S/)", "money"), F("total", "Total (S/)", "money", True),
        F("estado", "Estado del documento", "choice", True, ("Pendiente", "Recibido", "Verificado")),
        F("vencimiento", "Recordar factura el", "date"), F("requerimiento_id", "ID requerimiento"),
        F("archivo", "Foto / PDF comprobante", "file"), F("notas", "Observaciones", "multiline")),
        ("fecha", "obra", "proveedor", "tipo", "serie_numero", "igv", "total", "estado")),
    Module("movimientos", "Caja y rendiciones", "Fondos recibidos, gastos, cuenta propia y reembolsos", "CJ", (
        F("fecha", "Fecha", "date", True), F("obra", "Obra", required=True),
        F("tipo", "Tipo de movimiento", "choice", True, ("Ingreso empresa", "Gasto", "Reembolso a mí", "Devolución empresa")),
        F("categoria", "Categoría", required=True), F("concepto", "Concepto / sustento", "multiline", True),
        F("monto", "Monto (S/)", "money", True), F("cuenta", "Origen o destino", "choice", True,
          ("Cuenta personal · fondo empresa", "Caja chica", "Dinero propio", "Cuenta empresa")),
        F("medio", "Medio de pago", "choice", options=("Transferencia", "Efectivo", "Yape", "Plin", "Depósito", "Tarjeta", "Otro")),
        F("proveedor", "Proveedor / Persona"), F("compra_id", "ID de compra vinculada"),
        F("comprobante", "Tipo de comprobante", "choice", options=("Factura", "Boleta", "Nota de venta", "Sin comprobante", "Factura pendiente", "No aplica")),
        F("numero", "Número / referencia"), F("archivo", "Evidencia / voucher", "file"),
        F("notas", "Observaciones", "multiline")),
        ("fecha", "obra", "tipo", "cuenta", "concepto", "monto", "proveedor", "compra_id")),
    Module("almacen", "Almacén / Kardex", "Entrada, salida y saldo por obra y material", "AL", (
        F("fecha", "Fecha del movimiento", "date", True), F("obra", "Obra", required=True),
        F("material", "Material / equipo", required=True),
        F("tipo", "Tipo de movimiento", "choice", True, ("Ingreso", "Salida", "Ajuste positivo", "Ajuste negativo")),
        F("cantidad", "Cantidad", "number", True), F("unidad", "Unidad", "choice", True,
          ("und", "bolsa", "m3", "m2", "kg", "m", "juego", "galón", "otro")),
        F("referencia", "Guía / OC / referencia"), F("compra_id", "ID compra"),
        F("responsable", "Entregado / recibido por"), F("estado_firma", "Sustento firmado", "choice", options=("Pendiente", "Firmado cargado", "Verificado")),
        F("archivo", "Foto / guía firmada", "file"), F("notas", "Observaciones", "multiline")),
        ("fecha", "obra", "material", "tipo", "cantidad", "unidad", "referencia", "responsable")),
    Module("ordenes", "Órdenes de compra", "Documento imprimible con sus aprobaciones", "OC", (
        F("fecha", "Fecha", "date", True), F("obra", "Obra", required=True), F("proveedor", "Proveedor", required=True),
        F("descripcion", "Ítems y cantidades (uno por línea)", "multiline", True),
        F("monto", "Monto estimado (S/)", "money", True), F("requerimiento_id", "ID requerimiento"),
        F("estado", "Estado", "choice", True, ("Borrador", "Enviada", "Aprobada", "Recibida", "Cancelada")),
        F("entrega", "Fecha de entrega", "date"), F("responsable", "Solicitado por"),
        F("archivo", "Orden firmada / evidencia", "file"), F("notas", "Observaciones", "multiline")),
        ("fecha", "obra", "proveedor", "monto", "estado", "entrega")),
    Module("personal", "Personal reclutado", "Historial de ingenieros, obreros y técnicos", "RH", (
        F("nombre", "Nombre y apellidos", required=True), F("documento", "DNI / CE"),
        F("cargo", "Cargo", required=True), F("telefono", "Teléfono"), F("obra", "Obra"),
        F("estado", "Estado", "choice", True, ("Activo", "Inactivo", "Disponible")),
        F("jornal", "Jornal diario de referencia (S/)", "money"),
        F("ingreso", "Fecha de ingreso", "date"), F("salida", "Fecha de salida", "date"),
        F("contrato_vence", "Vencimiento contrato", "date"), F("sctr_vence", "Vencimiento SCTR", "date"),
        F("vida_ley_vence", "Vencimiento Vida Ley", "date"),
        F("archivo", "CV / certificados / contrato", "file"), F("notas", "Evaluación y observaciones", "multiline")),
        ("nombre", "documento", "cargo", "telefono", "obra", "estado", "jornal")),
    Module("tareos", "Tareo diario", "Marcar asistencias y generar el resumen por periodo", "TR", (
        F("fecha", "Fecha", "date", True), F("personal_id", "Trabajador (ID)", "worker", True),
        F("obra", "Obra", required=True), F("asistencia", "Asistencia", "choice", True,
          ("Asistió", "Falta", "Descanso", "Permiso", "Vacaciones")),
        F("horas", "Horas efectivas", "number"), F("observacion", "Observaciones", "multiline")),
        ("fecha", "personal_id", "obra", "asistencia", "horas", "observacion")),
    Module("planillas", "Planilla y boletas", "Pagos a personal y documentos imprimibles", "PL", (
        F("fecha", "Fecha de pago", "date", True), F("personal_id", "Trabajador (ID)", "worker", True),
        F("obra", "Obra", required=True), F("periodo_inicio", "Desde", "date", True),
        F("periodo_fin", "Hasta", "date", True), F("basico", "Remuneración / jornal acumulado (S/)", "money", True),
        F("extras", "Horas extras y otros (S/)", "money"), F("descuentos", "Descuentos configurados (S/)", "money"),
        F("neto", "Neto pagado (S/)", "money", True), F("medio", "Medio", "choice", options=("Transferencia", "Efectivo", "Yape", "Otro")),
        F("referencia", "N° de operación"), F("archivo", "Boleta firmada / voucher", "file"), F("notas", "Observaciones", "multiline")),
        ("fecha", "personal_id", "periodo_inicio", "periodo_fin", "basico", "extras", "descuentos", "neto")),
    Module("alquileres", "Alquileres y equipos", "Tarifas, plazos, devoluciones y vencimientos", "EQ", (
        F("fecha", "Fecha de registro", "date", True), F("obra", "Obra", required=True),
        F("proveedor", "Proveedor", required=True), F("equipo", "Equipo / material", required=True),
        F("cantidad", "Cantidad", "number", True), F("tarifa", "Tarifa (S/)", "money", True),
        F("periodicidad", "Periodo de tarifa", "choice", True, ("Día", "Semana", "Mes", "Hora", "Global")),
        F("inicio", "Inicio", "date", True), F("fin", "Vence / devolución prevista", "date"),
        F("devolucion", "Fecha de devolución real", "date"), F("estado", "Estado", "choice", True,
          ("Activo", "Por devolver", "Devuelto", "Suspendido")),
        F("archivo", "Contrato / acta / fotos", "file"), F("notas", "Observaciones", "multiline")),
        ("obra", "equipo", "proveedor", "cantidad", "tarifa", "periodicidad", "fin", "estado")),
    Module("agenda", "Agenda y recordatorios", "Pendientes de facturas, compras y compromisos", "AG", (
        F("fecha", "Fecha de registro", "date", True), F("obra", "Obra"),
        F("titulo", "Pendiente / compromiso", required=True), F("detalle", "Detalle", "multiline"),
        F("vence", "Fecha límite", "date", True), F("prioridad", "Prioridad", "choice", True, ("Normal", "Urgente", "Crítica")),
        F("estado", "Estado", "choice", True, ("Pendiente", "En proceso", "Cerrado", "Cancelado")),
        F("responsable", "Responsable"), F("archivo", "Evidencia", "file")),
        ("vence", "obra", "titulo", "prioridad", "estado", "responsable")),
    Module("documentos", "Evidencias y documentos", "Impresión, firma física, carga y verificación", "DC", (
        F("fecha", "Fecha", "date", True), F("obra", "Obra"),
        F("tipo", "Tipo", "choice", True, ("Guía de ingreso", "Guía de salida", "Acta", "Factura", "Boleta", "Nota de venta", "Contrato", "SCTR", "Vida Ley", "Otro")),
        F("referencia", "Documento / número"), F("estado_firma", "Estado de firma", "choice", True,
          ("Pendiente de firma", "Firmado cargado", "Verificado")),
        F("firmado_por", "Firmado / recibido por"), F("archivo", "Documento escaneado o fotografiado", "file", True),
        F("observaciones", "Observaciones", "multiline")),
        ("fecha", "obra", "tipo", "referencia", "estado_firma", "firmado_por")),
    Module("vencimientos", "Contratos y seguros", "Control de pólizas, SCTR, Vida Ley y EMO", "VC", (
        F("fecha", "Fecha de registro", "date", True), F("obra", "Obra"),
        F("tipo", "Tipo", "choice", True, ("SCTR", "Vida Ley", "EMO", "Contrato", "Garantía", "Seguro", "Otro")),
        F("descripcion", "Descripción / persona", required=True), F("vence", "Vencimiento", "date", True),
        F("estado", "Estado", "choice", True, ("Vigente", "Por renovar", "Renovado", "Cerrado")),
        F("responsable", "Responsable"), F("archivo", "Sustento", "file")),
        ("tipo", "obra", "descripcion", "vence", "estado")),
]
BY_TABLE = {m.table:m for m in MODULES}
MENU_GROUPS = [
    ("GENERAL", ["dashboard", "obras", "agenda"]),
    ("FINANZAS Y LOGÍSTICA", ["movimientos", "compras", "proveedores", "requerimientos", "ordenes", "almacen", "alquileres"]),
    ("RECURSOS HUMANOS", ["personal", "tareos", "planillas", "vencimientos"]),
    ("CONTROL", ["documentos", "audit"]),
]
