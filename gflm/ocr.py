"""Extracción asistida local. PDF digital por PyMuPDF; imágenes requieren Tesseract OCR instalado."""
import re
from pathlib import Path

def read_receipt(path):
    file=Path(path);text="";method=""
    if file.suffix.lower()==".pdf":
        try:
            import fitz
            with fitz.open(str(file)) as doc:text='\n'.join(p.get_text() for p in doc[:3]);method="texto del PDF"
        except ImportError:raise RuntimeError("Para leer PDF instala pymupdf: pip install pymupdf")
    elif file.suffix.lower() in (".jpg",".jpeg",".png",".tif",".tiff",".webp"):
        try:
            import pytesseract
            from PIL import Image
            text=pytesseract.image_to_string(Image.open(file),lang="spa+eng");method="OCR local"
        except (ImportError, OSError) as ex:
            raise RuntimeError("Para leer fotos instala Pillow, pytesseract y Tesseract OCR en Windows, con idioma español") from ex
    else:raise ValueError("Formato no compatible: usa JPG, PNG o PDF")
    if not text.strip():raise ValueError("No se pudo extraer texto legible. Ingresa los datos manualmente")
    upper=text.upper();fields={}
    if "NOTA DE VENTA" in upper:fields["tipo"]="Nota de venta"
    elif re.search(r'\bFACTURA\b',upper):fields["tipo"]="Factura"
    elif re.search(r'\bBOLETA\b',upper):fields["tipo"]="Boleta"
    ruc=re.search(r'\b(?:RUC\s*[:#]?\s*)?(20\d{9}|10\d{9})\b',upper)
    if ruc:fields["ruc"]=ruc.group(1)
    serie=re.search(r'\b([FB][A-Z0-9]{3})\s*[-–]\s*(\d{1,10})\b',upper)
    if serie:fields["serie_numero"]=f"{serie.group(1)}-{serie.group(2)}"
    d=re.search(r'\b(\d{2})[/\-.](\d{2})[/\-.](20\d{2})\b',text)
    if d:
        from datetime import date
        try:fields["fecha"]=date(int(d.group(3)),int(d.group(2)),int(d.group(1))).isoformat()
        except ValueError:pass
    amount_pattern=r'(?:S\/\s*)?([\d,.]+)'
    def amount(label):
        matches=re.findall(label+r'\s*[:\-]?\s*'+amount_pattern,upper,re.I)
        if not matches:return None
        val=matches[-1].replace(',','')
        try:return round(float(val),2)
        except ValueError:return None
    for name,label in (("igv",r'\bIGV\b(?:\s*\(\s*18\s*%\s*\))?'),("total",r'\b(?:IMPORTE\s+TOTAL|TOTAL\s+A\s+PAGAR|TOTAL)\b')):
        val=amount(label)
        if val is not None:fields[name]=str(val)
    if fields.get("tipo")=="Nota de venta":fields["igv"]="0"
    if fields.get("tipo")=="Factura" and "igv" in fields and "total" in fields:
        fields["valor_venta"]=str(round(float(fields["total"])-float(fields["igv"]),2))
    return fields,method,text[:1400]
