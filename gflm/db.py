"""Persistencia SQLite local, migraciones retrocompatibles y reglas operativas."""
import json
import os
import shutil
import sqlite3
import uuid
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from .models import MODULES, BY_TABLE

BASE = Path(os.environ.get("GFLM_DATA", str(Path.home() / "GFLM_Systems"))).expanduser().resolve()
BASE.mkdir(parents=True, exist_ok=True)
EVIDENCE = BASE / "evidencias"
BACKUPS = BASE / "respaldos"
EVIDENCE.mkdir(exist_ok=True)
BACKUPS.mkdir(exist_ok=True)
DB_PATH = BASE / "gflm.sqlite3"

LEGACY_SQL = {
"obras": "CREATE TABLE IF NOT EXISTS obras(id INTEGER PRIMARY KEY,nombre TEXT NOT NULL UNIQUE)",
"movimientos": """CREATE TABLE IF NOT EXISTS movimientos(id INTEGER PRIMARY KEY,fecha TEXT NOT NULL,obra TEXT NOT NULL,tipo TEXT NOT NULL,categoria TEXT NOT NULL,concepto TEXT NOT NULL,monto REAL NOT NULL,origen TEXT NOT NULL,comprobante TEXT NOT NULL,proveedor TEXT,numero TEXT,archivo TEXT,creado TEXT DEFAULT CURRENT_TIMESTAMP)""",
"requerimientos": """CREATE TABLE IF NOT EXISTS requerimientos(id INTEGER PRIMARY KEY,fecha TEXT NOT NULL,obra TEXT NOT NULL,detalle TEXT NOT NULL,solicitante TEXT,prioridad TEXT NOT NULL,entrega TEXT,estado TEXT NOT NULL,archivo TEXT,creado TEXT DEFAULT CURRENT_TIMESTAMP)""",
"personal": """CREATE TABLE IF NOT EXISTS personal(id INTEGER PRIMARY KEY,nombre TEXT NOT NULL,documento TEXT,cargo TEXT,telefono TEXT,obra TEXT,estado TEXT,archivo TEXT)""",
"tareos": """CREATE TABLE IF NOT EXISTS tareos(id INTEGER PRIMARY KEY,fecha TEXT NOT NULL,personal_id INTEGER NOT NULL,obra TEXT,asistencia TEXT,horas REAL,observacion TEXT,UNIQUE(fecha,personal_id),FOREIGN KEY(personal_id) REFERENCES personal(id))""",
"almacen": """CREATE TABLE IF NOT EXISTS almacen(id INTEGER PRIMARY KEY,fecha TEXT NOT NULL,obra TEXT NOT NULL,material TEXT NOT NULL,tipo TEXT NOT NULL,cantidad REAL NOT NULL,unidad TEXT,referencia TEXT,responsable TEXT,archivo TEXT)""",
"documentos": """CREATE TABLE IF NOT EXISTS documentos(id INTEGER PRIMARY KEY,fecha TEXT NOT NULL,obra TEXT,tipo TEXT,referencia TEXT,archivo TEXT NOT NULL)""",
"bitacora": """CREATE TABLE IF NOT EXISTS bitacora(id INTEGER PRIMARY KEY,fecha TEXT DEFAULT CURRENT_TIMESTAMP,accion TEXT,detalle TEXT)""",
}

SPECIAL_FIELDS = {"id", "activo", "creado", "actualizado"}

def sql_type(kind):
    return "REAL" if kind in ("money", "number") else "INTEGER" if kind == "worker" else "TEXT"

class Database:
    def __init__(self, path=None):
        self.path = Path(path or DB_PATH)
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.cn = sqlite3.connect(str(self.path))
        self.cn.row_factory = sqlite3.Row
        self.cn.execute("PRAGMA foreign_keys=ON")
        self.cn.execute("PRAGMA journal_mode=WAL")
        self.cn.execute("PRAGMA busy_timeout=4000")
        self._schema()
    def _schema(self):
        with self.cn:
            for q in LEGACY_SQL.values(): self.cn.execute(q)
            for mod in MODULES:
                table = mod.table
                if table not in LEGACY_SQL:
                    pieces = ["id INTEGER PRIMARY KEY"]
                    for fld in mod.fields: pieces.append(f'"{fld.key}" {sql_type(fld.kind)}')
                    pieces += ["activo INTEGER DEFAULT 1", "creado TEXT DEFAULT CURRENT_TIMESTAMP", "actualizado TEXT DEFAULT CURRENT_TIMESTAMP"]
                    self.cn.execute(f'CREATE TABLE IF NOT EXISTS "{table}" ({", ".join(pieces)})')
                existing = {r[1] for r in self.cn.execute(f'PRAGMA table_info("{table}")')}
                for fld in mod.fields:
                    if fld.key not in existing:
                        self.cn.execute(f'ALTER TABLE "{table}" ADD COLUMN "{fld.key}" {sql_type(fld.kind)}')
                for col,typ in (("activo","INTEGER DEFAULT 1"),("actualizado","TEXT"),("creado","TEXT")):
                    if col not in existing: self.cn.execute(f'ALTER TABLE "{table}" ADD COLUMN "{col}" {typ}')
            self.cn.execute("UPDATE movimientos SET cuenta=CASE WHEN origen='Dinero propio' THEN 'Dinero propio' WHEN origen='Caja chica' THEN 'Caja chica' ELSE 'Cuenta personal · fondo empresa' END WHERE (cuenta IS NULL OR cuenta='') AND origen IS NOT NULL")
            self.cn.execute("UPDATE movimientos SET tipo=CASE tipo WHEN 'Ingreso' THEN 'Ingreso empresa' WHEN 'Gasto empresa' THEN 'Gasto' ELSE tipo END")
            for mod in MODULES:
                self.cn.execute(f'UPDATE "{mod.table}" SET activo=1 WHERE activo IS NULL')
            self.cn.execute("CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha)")
            self.cn.execute("CREATE INDEX IF NOT EXISTS idx_almacen_obra_material ON almacen(obra,material,unidad)")
            self.cn.execute("CREATE INDEX IF NOT EXISTS idx_compras_tipo ON compras(tipo)")
    def close(self): self.cn.close()
    def all(self, table, term=""):
        if table not in BY_TABLE: raise ValueError("Módulo desconocido")
        rows = [dict(r) for r in self.cn.execute(f'SELECT * FROM "{table}" WHERE activo=1 ORDER BY id DESC')]
        needle = term.casefold().strip()
        return [r for r in rows if needle in ' '.join(str(v) for v in r.values()).casefold()] if needle else rows
    def one(self, table, id):
        if table not in BY_TABLE: raise ValueError("Módulo desconocido")
        r = self.cn.execute(f'SELECT * FROM "{table}" WHERE id=? AND activo=1',(int(id),)).fetchone()
        return dict(r) if r else None
    def audit(self, action, table, rid, before=None, after=None):
        payload = json.dumps({"tabla":table,"id":rid,"antes":before,"despues":after},ensure_ascii=False,default=str)
        self.cn.execute("INSERT INTO bitacora(accion,detalle) VALUES(?,?)",(action,payload))
    def save(self, table, values, rid=None):
        mod=BY_TABLE[table]; allowed={f.key:f for f in mod.fields}
        raw={k:values.get(k,"") for k in allowed}
        clean={}
        for name,fld in allowed.items():
            value=raw[name]
            value=value.strip() if isinstance(value,str) else value
            if value in (None, ""):
                if fld.required: raise ValueError(f"Falta el campo: {fld.label}")
                clean[name]=None
            elif fld.kind == "date":
                date.fromisoformat(value);clean[name]=value
            elif fld.kind in ("money", "number"):
                number=float(str(value).replace(",","."))
                if number<0:raise ValueError(f"{fld.label}: no puede ser negativo")
                clean[name]=round(number,2) if fld.kind=="money" else number
            elif fld.kind=="worker":
                val=str(value).split(" | ")[0].strip()
                clean[name]=int(val)
                if not self.one("personal",clean[name]):raise ValueError("Selecciona un trabajador existente")
            else:
                clean[name]=value
            if fld.kind=="choice" and clean[name] and clean[name] not in fld.options:
                # No bloquear valores antiguos del sistema v2 al editar.
                if not (rid and self.one(table,rid) and self.one(table,rid).get(name)==clean[name]):
                    raise ValueError(f"Valor inválido en {fld.label}")
        if table=="movimientos" and not clean.get("comprobante"):
            clean["comprobante"]="No aplica"
        if table=="compras":
            if clean["tipo"]=="Factura pendiente" and not clean.get("vencimiento"):
                clean["vencimiento"]=(date.fromisoformat(clean["fecha"])+timedelta(days=5)).isoformat()
            if clean["tipo"]=="Nota de venta" and (clean["igv"] or 0):
                raise ValueError("La nota de venta no debe registrar IGV separado")
            if clean["tipo"]=="Factura" and (clean["valor_venta"] or clean["igv"]):
                if abs((clean["valor_venta"] or 0)+(clean["igv"] or 0)-clean["total"])>0.05:
                    raise ValueError("Valor de venta + IGV deben coincidir con el total")
        if table=="planillas":
            expected=(clean["basico"] or 0)+(clean["extras"] or 0)-(clean["descuentos"] or 0)
            if abs(expected-clean["neto"])>0.05:raise ValueError("Neto debe ser básico + extras - descuentos")
            if clean["periodo_inicio"]>clean["periodo_fin"]:raise ValueError("El periodo es inválido")
        if table=="movimientos" and clean.get("compra_id"):
            try: cid=int(clean["compra_id"])
            except ValueError:raise ValueError("El ID de compra debe ser un número")
            compra=self.one("compras",cid)
            if not compra:raise ValueError("La compra vinculada no existe")
            if clean.get("tipo")=="Gasto":
                already=sum(float(m["monto"]) for m in self.all("movimientos") if str(m.get("compra_id") or "")==str(cid) and m.get("tipo") in ("Gasto","Gasto empresa") and (not rid or m["id"]!=int(rid)))
                if already+float(clean.get("monto") or 0) > float(compra.get("total") or 0)+0.01:
                    raise ValueError(f"Pagos vinculados superan total de compra. Pagado: S/ {already:.2f}")
        if table=="movimientos" and (clean["monto"] or 0)<=0:
            raise ValueError("El movimiento debe tener un monto mayor que cero")
        if table=="almacen":
            if (clean["cantidad"] or 0)<=0:raise ValueError("Cantidad mayor que cero requerida")
            before_qty=self.stock(clean["obra"],clean["material"],clean["unidad"],except_id=rid)
            sign=-1 if clean["tipo"] in ("Salida","Ajuste negativo") else 1
            if before_qty+sign*clean["cantidad"] < -0.0001:
                raise ValueError(f"Stock insuficiente. Disponible: {before_qty:g} {clean['unidad']}")
        if table=="tareos" and clean.get("horas") is not None and clean["horas"]>24:raise ValueError("Las horas no pueden exceder 24")
        if table=="documentos" and clean["archivo"] and not self.file_exists(clean["archivo"]):
            raise ValueError("Archivo de evidencia no encontrado")
        before=self.one(table,rid) if rid else None
        keys=list(clean)
        with self.cn:
            if rid:
                if not before:raise ValueError("No se encontró el registro")
                self.cn.execute(f'UPDATE "{table}" SET '+','.join(f'"{x}"=?' for x in keys)+',actualizado=CURRENT_TIMESTAMP WHERE id=?',[*clean.values(),rid]);newid=int(rid)
            else:
                # Tabla antigua: campo origen NOT NULL y sin valor por defecto.
                if table=="movimientos":clean["origen"] = "Dinero propio" if clean["cuenta"]=="Dinero propio" else "Caja chica" if clean["cuenta"]=="Caja chica" else "Empresa"
                keys=list(clean)
                q=f'INSERT INTO "{table}" ({",".join(chr(34)+k+chr(34) for k in keys)}) VALUES ({",".join("?" for _ in keys)})'
                newid=self.cn.execute(q,tuple(clean.values())).lastrowid
            self.audit("EDITAR" if rid else "CREAR",table,newid,before,clean)
        return newid
    def archive(self,table,rid):
        row=self.one(table,rid)
        if not row:raise ValueError("Registro inexistente")
        if table=="almacen":
            current=self.stock(row["obra"],row["material"],row["unidad"],except_id=rid)
            if current< -0.0001:raise ValueError("No puedes archivar un ingreso si dejaría el Kardex negativo")
        if table=="personal":
            used=self.cn.execute("SELECT COUNT(*) FROM tareos WHERE personal_id=? AND activo=1",(rid,)).fetchone()[0]
            if used:raise ValueError("No se puede archivar a alguien con tareos; cambia su estado a Inactivo")
        with self.cn:
            self.cn.execute(f'UPDATE "{table}" SET activo=0 WHERE id=?',(rid,))
            self.audit("ARCHIVAR",table,rid,row,None)
    def stock(self,obra,material,unidad,except_id=None):
        q="SELECT tipo,cantidad FROM almacen WHERE activo=1 AND obra=? AND material=? AND unidad=?"
        args=[obra,material,unidad]
        if except_id:q+=" AND id<>?";args.append(int(except_id))
        return round(sum((-1 if r[0] in ("Salida","Ajuste negativo") else 1)*float(r[1] or 0) for r in self.cn.execute(q,args)),3)
    def inventory(self):
        keys=self.cn.execute("SELECT DISTINCT obra,material,unidad FROM almacen WHERE activo=1 ORDER BY obra,material,unidad").fetchall()
        return [{"obra":r[0],"material":r[1],"unidad":r[2],"saldo":self.stock(*r)} for r in keys]
    def cash_summary(self, obra=None):
        rows=self.all("movimientos")
        if obra:rows=[r for r in rows if r.get("obra")==obra]
        res={"recibido":0.0,"gasto_empresa":0.0,"gasto_propio":0.0,"reembolso":0.0,"devolucion":0.0,"gasto_total":0.0}
        for r in rows:
            monto=float(r.get("monto") or 0);typ=r.get("tipo");cuenta=r.get("cuenta") or r.get("origen")
            if typ in ("Ingreso empresa","Ingreso"):res["recibido"]+=monto
            elif typ in ("Gasto","Gasto empresa"):
                res["gasto_total"]+=monto
                if cuenta=="Dinero propio":res["gasto_propio"]+=monto
                else:res["gasto_empresa"]+=monto
            elif typ=="Reembolso a mí":res["reembolso"]+=monto
            elif typ=="Devolución empresa":res["devolucion"]+=monto
        res["saldo_fondos_empresa"]=round(res["recibido"]-res["gasto_empresa"]-res["reembolso"]-res["devolucion"],2)
        res["por_reembolsar"]=round(res["gasto_propio"]-res["reembolso"],2)
        return res
    def alerts(self, today=None):
        now=today or date.today().isoformat();out=[]
        checks=[("requerimientos","entrega","detalle",("Entregado","Cerrado","Cancelado")),
                ("agenda","vence","titulo",("Cerrado","Cancelado")),
                ("alquileres","fin","equipo",("Devuelto",)),
                ("vencimientos","vence","descripcion",("Renovado","Cerrado")),
                ("compras","vencimiento","concepto",("Verificado",))]
        for table,deadline,label,done in checks:
            for r in self.all(table):
                if r.get("estado") in done or not r.get(deadline):continue
                if r[deadline]<=now:
                    out.append({"tabla":table,"id":r["id"],"fecha":r[deadline],"detalle":r.get(label) or "", "prioridad":r.get("prioridad") or "Normal"})
        for p in self.all("personal"):
            if p.get("estado")=="Inactivo":continue
            for col,typ in (("contrato_vence","Contrato"),("sctr_vence","SCTR"),("vida_ley_vence","Vida Ley")):
                if p.get(col) and p[col]<=now:out.append({"tabla":"personal","id":p["id"],"fecha":p[col],"detalle":f"{typ}: {p['nombre']}","prioridad":"Urgente"})
        return sorted(out,key=lambda r:r["fecha"])
    def file_exists(self, path):
        p=Path(path)
        if not p.is_absolute():p=BASE/p
        return p.is_file()
    def filepath(self, path):
        p=Path(path)
        return p if p.is_absolute() else BASE/p
    def import_file(self, path):
        src=Path(path)
        if not src.is_file():raise ValueError("Archivo inválido")
        if src.stat().st_size>30*1024*1024:raise ValueError("Archivo mayor a 30 MB")
        safe=''.join(c if c.isalnum() or c in '._-' else '_' for c in src.name)
        name=f"{datetime.now():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:8]}_{safe}"
        dest=EVIDENCE/name
        shutil.copy2(src,dest)
        return str(dest.relative_to(BASE))
    def backup(self):
        tag=datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        db_copy=BACKUPS/f"GFLM_{tag}.sqlite3"
        archive=BACKUPS/f"GFLM_Respaldo_{tag}.zip"
        try:
            with sqlite3.connect(str(db_copy)) as output:self.cn.backup(output)
            with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
                z.write(db_copy,arcname="gflm.sqlite3")
                for p in EVIDENCE.rglob("*"):
                    if p.is_file():z.write(p,arcname=str(Path("evidencias")/p.relative_to(EVIDENCE)))
        finally:
            db_copy.unlink(missing_ok=True)
        return archive
    def audit_rows(self,limit=250):
        return [dict(r) for r in self.cn.execute("SELECT * FROM bitacora ORDER BY id DESC LIMIT ?",(limit,))]
