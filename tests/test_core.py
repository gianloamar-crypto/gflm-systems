import os, tempfile, unittest
from pathlib import Path
from gflm.db import Database
from gflm.reports import export_rendition, create_pdf, export_tareo_period

class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.db=Database(Path(self.temp.name)/"sample.sqlite3")
    def tearDown(self):
        self.db.close();self.temp.cleanup()
    def save(self,table,**kw):
        return self.db.save(table,kw)
    def test_cash_own_funds_and_reimbursements(self):
        self.save("movimientos",fecha="2026-11-01",obra="Obra Norte",tipo="Ingreso empresa",categoria="Depósitos",concepto="Depósito gerente",monto="1000",cuenta="Cuenta personal · fondo empresa")
        self.save("movimientos",fecha="2026-11-02",obra="Obra Norte",tipo="Gasto",categoria="Materiales",concepto="Cemento",monto="150",cuenta="Caja chica")
        self.save("movimientos",fecha="2026-11-03",obra="Obra Norte",tipo="Gasto",categoria="Materiales",concepto="Herramientas",monto="300",cuenta="Dinero propio")
        self.save("movimientos",fecha="2026-11-04",obra="Obra Norte",tipo="Reembolso a mí",categoria="Reembolso",concepto="Reembolso parcial",monto="100",cuenta="Cuenta personal · fondo empresa")
        s=self.db.cash_summary()
        self.assertEqual(s["saldo_fondos_empresa"],750)
        self.assertEqual(s["por_reembolsar"],200)
        self.assertEqual(s["gasto_total"],450)
    def test_stock_and_deficit(self):
        self.save("almacen",fecha="2026-11-01",obra="Obra A",material="Cemento",tipo="Ingreso",cantidad=10,unidad="bolsa")
        self.save("almacen",fecha="2026-11-02",obra="Obra A",material="Cemento",tipo="Salida",cantidad=3,unidad="bolsa")
        self.assertEqual(self.db.stock("Obra A","Cemento","bolsa"),7)
        with self.assertRaisesRegex(ValueError,"Stock insuficiente"):
            self.save("almacen",fecha="2026-11-03",obra="Obra A",material="Cemento",tipo="Salida",cantidad=8,unidad="bolsa")
    def test_note_sale_rejects_igv_and_invoice_totals(self):
        base=dict(fecha="2026-11-01",obra="Obra A",proveedor="Proveedor",concepto="Abastecimiento",total="118",estado="Recibido")
        with self.assertRaisesRegex(ValueError,"IGV"):
            self.save("compras",**{**base,"tipo":"Nota de venta","igv":"18"})
        with self.assertRaisesRegex(ValueError,"coincidir"):
            self.save("compras",**{**base,"tipo":"Factura","igv":"18","valor_venta":"90"})
        self.save("compras",**{**base,"tipo":"Factura","igv":"18","valor_venta":"100"})
    def test_requirements_and_alerts(self):
        self.save("requerimientos",fecha="2026-10-01",obra="Obra A",detalle="20 bolsas de cemento",prioridad="Crítica",entrega="2026-10-03",estado="Pendiente")
        self.assertEqual(len(self.db.alerts(today="2026-10-04")),1)
    def test_attendance_unique(self):
        person=self.save("personal",nombre="Persona de prueba",cargo="Obrero",estado="Activo")
        self.save("tareos",fecha="2026-11-01",personal_id=person,obra="Obra A",asistencia="Asistió",horas="8")
        with self.assertRaises(Exception):self.save("tareos",fecha="2026-11-01",personal_id=person,obra="Obra A",asistencia="Falta")
    def test_exports(self):
        self.save("ordenes",fecha="2026-11-01",obra="Obra A",proveedor="Proveedor",descripcion="Cemento: 10 bolsas",monto="500",estado="Borrador")
        order=self.db.all("ordenes")[0]
        pdf=Path(self.temp.name)/"OC.pdf"
        create_pdf(self.db,"ordenes",order,pdf)
        self.assertTrue(pdf.read_bytes().startswith(b"%PDF"))
        xlsx=Path(self.temp.name)/"rendicion.xlsx"
        export_rendition(self.db,xlsx)
        self.assertTrue(xlsx.read_bytes().startswith(b"PK"))
        import zipfile
        with zipfile.ZipFile(xlsx) as z:
            self.assertIn("xl/workbook.xml",z.namelist())
        tareo=Path(self.temp.name)/"tareo.xlsx"
        export_tareo_period(self.db,"2026-11-01","2026-11-30",tareo)
        self.assertTrue(tareo.exists())
    def test_backup(self):
        self.save("obras",nombre="Obra C")
        b=self.db.backup()
        self.assertTrue(b.is_file())
        self.assertGreater(b.stat().st_size,0)

if __name__=="__main__":unittest.main()
