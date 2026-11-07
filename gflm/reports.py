"""Generación de Excel OOXML sin dependencias y documentos PDF imprimibles."""
from __future__ import annotations
from datetime import date, datetime
from pathlib import Path
import re, zipfile
from xml.sax.saxutils import escape, quoteattr
from .models import BY_TABLE

SHEET_NAMES={
    "obras":"Obras","proveedores":"Proveedores","requerimientos":"Requerimientos",
    "compras":"Comprobantes","movimientos":"Rendicion detalle","almacen":"Kardex",
    "ordenes":"Ordenes de compra","personal":"Personal","tareos":"Tareos",
    "planillas":"Planillas","alquileres":"Alquileres","agenda":"Agenda",
    "documentos":"Evidencias","vencimientos":"Vencimientos"
}

def _safe(value):
    text=str(value if value is not None else "")
    if text.startswith(("=","+","-","@")): text="'"+text  # previene fórmulas maliciosas
    return text

def _col(i):
    result=""
    while i:
        i,r=divmod(i-1,26);result=chr(65+r)+result
    return result

def _sheet_xml(rows, money_columns=()):
    width=max((len(r) for r in rows),default=1)
    out=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
         '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
         '<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
         '<cols>'+''.join(f'<col min="{i}" max="{i}" width="{min(40,max(14, 32 if i==2 else 17))}" customWidth="1"/>' for i in range(1,width+1))+'</cols>',
         '<sheetData>']
    for ri,values in enumerate(rows,1):
        out.append(f'<row r="{ri}" ht="{30 if ri==1 else 24 if ri==4 else 19}" customHeight="1">')
        for ci,value in enumerate(values,1):
            ref=f'{_col(ci)}{ri}'
            style=1 if ri==1 else 2 if ri==4 else 3 if ri>=5 and ci in money_columns else 0
            if isinstance(value,(int,float)) and not isinstance(value,bool):
                out.append(f'<c r="{ref}" s="{style}"><v>{value}</v></c>')
            else:
                out.append(f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(_safe(value))}</t></is></c>')
        out.append('</row>')
    out.append('</sheetData>')
    end=max(4,len(rows))
    out.append(f'<autoFilter ref="A4:{_col(width)}{end}"/>')
    out.append(f'<mergeCells count="1"><mergeCell ref="A1:{_col(width)}1"/></mergeCells>' if width>1 else '')
    out.append('<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>')
    out.append('</worksheet>');return ''.join(out)

def save_xlsx(sheets, dest):
    """sheets=[(nombre,título,cabeceras,filas,columnas_monetarias)]"""
    dest=Path(dest);dest.parent.mkdir(parents=True,exist_ok=True)
    book=[]
    with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1,len(sheets)+1))+'</Types>')
        z.writestr('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        rel=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
        for i,(name,title,headers,items,money_cols) in enumerate(sheets,1):
            # Filas 2-3 vacías deliberadamente para respirar y separar título de tabla.
            rows=[[title], ["GFLM Systems · Control administrativo", "Exportado el: " + date.today().isoformat()], [], headers] + items
            z.writestr(f'xl/worksheets/sheet{i}.xml',_sheet_xml(rows,money_cols))
            book.append(f'<sheet name={quoteattr(name[:31])} sheetId="{i}" r:id="rId{i}"/>')
            rel.append(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>')
        rel.append(f'<Relationship Id="rId{len(sheets)+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        z.writestr('xl/_rels/workbook.xml.rels',''.join(rel))
        z.writestr('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(book)+'</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>')
        z.writestr('xl/styles.xml','''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;S/ &quot;#,##0.00;[Red]-&quot;S/ &quot;#,##0.00"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Aptos"/><color rgb="FF15253C"/></font><font><b/><sz val="16"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF12223C"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2764B8"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>''')
    return dest

def module_sheet(db, table):
    mod=BY_TABLE[table]; columns=[f.key for f in mod.fields if f.kind!="file"]
    headers=["ID"]+[next(f.label for f in mod.fields if f.key==c) for c in columns]
    rows=[[r["id"]]+[r.get(c) for c in columns] for r in reversed(db.all(table))]
    money=[i+2 for i,c in enumerate(columns) if next(f.kind for f in mod.fields if f.key==c)=="money"]
    return (SHEET_NAMES[table], mod.title.upper(), headers,rows,money)

def export_module(db,table,dest):return save_xlsx([module_sheet(db,table)],dest)

def export_rendition(db,dest):
    s=db.cash_summary()
    keys=[("Fondos recibidos",s["recibido"]),("Gastos con fondos de empresa",s["gasto_empresa"]),
          ("Gastos asumidos con dinero propio",s["gasto_propio"]),("Reembolsos al administrador",s["reembolso"]),
          ("Devoluciones a empresa",s["devolucion"]),("Gasto total registrado",s["gasto_total"]),
          ("Saldo de fondos empresa",s["saldo_fondos_empresa"]),("Pendiente de devolverme",s["por_reembolsar"]) ]
    summary=("Resumen", "RENDICIÓN DE FONDOS · RESUMEN", ["Indicador","Monto (S/)","Criterio"],
             [[label,float(value),"Calculado desde caja y rendiciones"] for label,value in keys],[2])
    sheets=[summary,module_sheet(db,"movimientos"),module_sheet(db,"compras"),module_sheet(db,"requerimientos"),module_sheet(db,"almacen"),module_sheet(db,"documentos")]
    return save_xlsx(sheets,dest)

def export_full(db,dest):
    from collections import Counter
    s=db.cash_summary()
    rows=[[k.replace('_',' ').capitalize(),float(v)] for k,v in s.items()]
    sheets=[("Resumen", "GFLM SYSTEMS · RESUMEN GENERAL", ["Indicador","Monto (S/)"],rows,[2])]
    sheets +=[module_sheet(db,t) for t in BY_TABLE]
    return save_xlsx(sheets,dest)

def export_inventory(db,dest):
    rows=[[x["obra"],x["material"],x["unidad"],x["saldo"]] for x in db.inventory()]
    return save_xlsx([("Existencias", "KARDEX · EXISTENCIAS POR OBRA",["Obra","Material","Unidad","Saldo"],rows,[])],dest)

def export_tareo_period(db,start,end,dest):
    date.fromisoformat(start);date.fromisoformat(end)
    if start>end:raise ValueError("Rango de fechas inválido")
    people={p["id"]:p for p in db.all("personal")}
    rows=[]
    for x in sorted(db.all("tareos"),key=lambda r:(r.get("fecha") or "",r.get("personal_id") or 0)):
        if start<=x.get("fecha","")<=end:
            p=people.get(x.get("personal_id"),{})
            rows.append([x["fecha"],p.get("nombre","ID "+str(x["personal_id"])),p.get("cargo",""),x.get("obra"),x.get("asistencia"),x.get("horas") or 0,x.get("observacion") or ""])
    return save_xlsx([("Tareo",f"TAREO DEL {start} AL {end}",["Fecha","Trabajador","Cargo","Obra","Asistencia","Horas","Observación"],rows,[])],dest)


def create_pdf(db,table,row,dest):
    """Documento interno para impresión y firma física. PDFs no se firman digitalmente."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_LEFT
        from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,KeepTogether
    except ImportError as ex:raise RuntimeError("Instala la dependencia: pip install reportlab") from ex
    dest=Path(dest);dest.parent.mkdir(parents=True,exist_ok=True)
    names={"ordenes":"ORDEN DE COMPRA","almacen":"GUÍA INTERNA DE INGRESO / SALIDA","requerimientos":"REQUERIMIENTO DE OBRA","planillas":"BOLETA DE PAGO","alquileres":"CONTROL DE ALQUILER","documentos":"ACTA DE DOCUMENTACIÓN","compras":"FICHA DE COMPRA"}
    if table not in names:raise ValueError("Este módulo todavía no tiene plantilla PDF")
    title=names[table]
    if table=="almacen":title="GUÍA INTERNA DE "+("SALIDA" if row.get("tipo") in ("Salida","Ajuste negativo") else "INGRESO")
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name="gflmTitle",parent=styles["Title"],fontName="Helvetica-Bold",fontSize=18,leading=22,textColor=colors.HexColor('#102846'),spaceAfter=12))
    styles.add(ParagraphStyle(name="gflmBody",parent=styles["Normal"],fontSize=10,leading=15,spaceAfter=6))
    story=[Paragraph("GFLM SYSTEMS · ADMINISTRACIÓN DE OBRA",styles["Heading4"]),Spacer(1,5*mm),Paragraph(title,styles["gflmTitle"]),Paragraph(f"N.º {table.upper()[:3]}-{int(row['id']):06d}   •   Fecha: {row.get('fecha') or date.today().isoformat()}",styles["gflmBody"]),Spacer(1,5*mm)]
    mod=BY_TABLE[table]
    printable=[]
    for f in mod.fields:
        if f.key in ("archivo","notas","observaciones"):continue
        v=row.get(f.key)
        if v is None or v=="":continue
        if f.key=="personal_id":
            p=db.one("personal",int(v));v=p["nombre"] if p else f"ID {v}"
        if f.key in ("monto","total","igv","neto","basico","extras","descuentos","valor_venta","tarifa"):
            v=f"S/ {float(v):,.2f}"
        printable.append([Paragraph(escape(f.label),styles["gflmBody"]),Paragraph(escape(str(v)).replace('\n','<br/>'),styles["gflmBody"])])
    if row.get("notas") or row.get("observaciones"):
        printable.append([Paragraph("Observaciones",styles["gflmBody"]),Paragraph(escape(str(row.get("notas") or row.get("observaciones"))).replace('\n','<br/>'),styles["gflmBody"])])
    tbl=Table(printable,colWidths=[49*mm,126*mm],hAlign="LEFT",repeatRows=0)
    tbl.setStyle(TableStyle([('BACKGROUND',(0,0),(0,-1),colors.HexColor('#edf3fa')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),0.3,colors.HexColor('#dae2ec')),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
    story += [tbl,Spacer(1,24*mm)]
    sign=Table([["__________________________","__________________________"],["Entregó / Elaboró","Recibió / Conforme"],["Nombre y firma","Nombre y firma"]],colWidths=[90*mm,90*mm]);sign.setStyle(TableStyle([('ALIGN',(0,0),(-1,-1),'CENTER'),('FONTNAME',(0,1),(-1,-1),'Helvetica'),('FONTSIZE',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,0),7)]))
    story.append(sign)
    doc=SimpleDocTemplate(str(dest),pagesize=A4,rightMargin=18*mm,leftMargin=18*mm,topMargin=19*mm,bottomMargin=18*mm)
    doc.build(story)
    return dest
