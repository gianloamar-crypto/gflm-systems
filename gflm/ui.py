"""Interfaz de escritorio GFLM Systems. Todas las operaciones funcionan sin internet."""
from __future__ import annotations
import os
import sys
from datetime import date,datetime
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, simpledialog
from .models import MODULES, BY_TABLE, MENU_GROUPS
from .db import Database, BASE
from . import reports

C={"bg":"#0B1220","side":"#0F1A2C","panel":"#13213A","panel2":"#1A2B45","line":"#263B57","accent":"#4F91FF","teal":"#22C6A9","text":"#F1F6FF","muted":"#91A6C2","danger":"#ED7A81","warning":"#F9C16B","white":"#FFFFFF"}
FONT="Segoe UI"

def label(p,txt,size=10,weight="normal",color=None,bg=None,**kw):
    return tk.Label(p,text=txt,font=(FONT,size,weight),fg=color or C["text"],bg=bg or C["panel"],**kw)

def button(p,txt,cmd,primary=False,danger=False,wide=None):
    bg=C["accent"] if primary else C["panel2"]
    if danger:bg="#713444"
    return tk.Button(p,text=txt,command=cmd,font=(FONT,10,"bold"),fg=C["white"],bg=bg,
       activebackground="#3D73C5" if primary else "#294261",activeforeground="white",borderwidth=0,highlightthickness=0,relief="flat",cursor="hand2",padx=12,pady=9,width=wide)

class ScrollForm(tk.Frame):
    def __init__(self,parent,**kw):
        super().__init__(parent,bg=C["panel"],**kw)
        canvas=tk.Canvas(self,bg=C["panel"],highlightthickness=0)
        bar=ttk.Scrollbar(self,orient="vertical",command=canvas.yview)
        self.body=tk.Frame(canvas,bg=C["panel"])
        self.body.bind("<Configure>",lambda ev:canvas.configure(scrollregion=canvas.bbox("all")))
        win=canvas.create_window(0,0,window=self.body,anchor="nw")
        canvas.bind("<Configure>",lambda ev:canvas.itemconfig(win,width=ev.width))
        canvas.configure(yscrollcommand=bar.set)
        canvas.pack(side="left",fill="both",expand=True);bar.pack(side="right",fill="y")
        def wheel(event):
            canvas.yview_scroll(int(-1*(event.delta/120)),"units")
        canvas.bind("<Enter>",lambda e:canvas.bind_all("<MouseWheel>",wheel))
        canvas.bind("<Leave>",lambda e:canvas.unbind_all("<MouseWheel>"))

class FormDialog:
    def __init__(self, app, table, record=None, prefill=None):
        self.app=app;self.table=table;self.record=record;self.vars={};self.widgets={}
        self.win=tk.Toplevel(app.root);self.win.title(("Editar" if record else "Nuevo")+" · "+BY_TABLE[table].title)
        self.win.geometry("620x730");self.win.minsize(490,540)
        self.win.configure(bg=C["panel"]);self.win.transient(app.root);self.win.grab_set()
        head=tk.Frame(self.win,bg=C["panel"],padx=23,pady=18);head.pack(fill="x")
        label(head,("Editar registro" if record else "Nuevo registro"),19,"bold").pack(anchor="w")
        label(head,BY_TABLE[table].subtitle,10,color=C["muted"]).pack(anchor="w",pady=(5,0))
        scr=ScrollForm(self.win);scr.pack(fill="both",expand=True,padx=20)
        form=scr.body
        defaults={"fecha":date.today().isoformat(),"prioridad":"Normal","estado":"Pendiente", "estado_firma":"Pendiente de firma", "asistencia":"Asistió","tipo":"Ingreso","unidad":"und","cuenta":"Cuenta personal · fondo empresa"}
        input_values={**defaults,**(prefill or {}),**(record or {})}
        for fld in BY_TABLE[table].fields:
            f=tk.Frame(form,bg=C["panel"]);f.pack(fill="x",pady=7,padx=4)
            label(f,fld.label+(" *" if fld.required else ""),10,"bold",color=C["muted"]).pack(anchor="w",pady=(0,5))
            v=tk.StringVar(value=str(input_values.get(fld.key) if input_values.get(fld.key) is not None else ""))
            self.vars[fld.key]=v
            if fld.kind=="choice":
                # Valor antiguo visible incluso si no está en catálogo actual
                values=list(fld.options)
                if v.get() and v.get() not in values:values.insert(0,v.get())
                widget=ttk.Combobox(f,textvariable=v,values=values,state="readonly",font=(FONT,10))
                widget.pack(fill="x",ipady=6)
            elif fld.kind=="worker":
                values=[f"{x['id']} | {x['nombre']}" for x in app.db.all("personal")]
                if v.get() and v.get().isdigit():
                    hit=next((x for x in values if x.startswith(v.get()+" | ")),None)
                    if hit:v.set(hit)
                widget=ttk.Combobox(f,textvariable=v,values=values,state="readonly",font=(FONT,10))
                widget.pack(fill="x",ipady=6)
            elif fld.kind=="multiline":
                widget=tk.Text(f,height=3,bg="#F1F5FB",fg="#152640",insertbackground="#152640",relief="flat",wrap="word",font=(FONT,10),padx=8,pady=7)
                widget.pack(fill="x");widget.insert("1.0",v.get())
            elif fld.kind=="file":
                line=tk.Frame(f,bg=C["panel"]);line.pack(fill="x")
                widget=ttk.Entry(line,textvariable=v,font=(FONT,10));widget.pack(side="left",fill="x",expand=True,ipady=5)
                def select(k=fld.key):
                    path=filedialog.askopenfilename(parent=self.win,title="Selecciona la foto, escaneo o PDF")
                    if path:self.vars[k].set(path)
                button(line,"Examinar",select).pack(side="left",padx=(7,0))
            else:
                widget=ttk.Entry(f,textvariable=v,font=(FONT,10));widget.pack(fill="x",ipady=6)
            self.widgets[fld.key]=widget
        if table=="compras":
            tk.Label(form,text="La lectura automática es una sugerencia: verifica monto, IGV, RUC y fecha antes de guardar.",font=(FONT,9),fg=C["warning"],bg=C["panel"],wraplength=540,justify="left").pack(anchor="w",pady=8)
            button(form,"Leer comprobante (PDF / foto)",self.ocr_read).pack(anchor="w",padx=4,pady=5)
        bar=tk.Frame(self.win,bg=C["panel"],padx=22,pady=14);bar.pack(fill="x")
        button(bar,"Cancelar",self.win.destroy).pack(side="right",padx=(8,0))
        button(bar,"Guardar cambios" if record else "Guardar registro",self.save,primary=True).pack(side="right")
    def ocr_read(self):
        path=self.vars.get("archivo").get()
        if not path:
            path=filedialog.askopenfilename(parent=self.win,filetypes=[("Comprobantes","*.pdf *.jpg *.jpeg *.png *.webp")])
            if not path:return
            self.vars["archivo"].set(path)
        try:
            from .ocr import read_receipt
            fields,method,text=read_receipt(self.app.db.filepath(path))
            for k,v in fields.items():
                if k in self.vars:self.vars[k].set(str(v))
            messagebox.showinfo("Lectura preliminar",f"Método: {method}\nCampos detectados: {', '.join(fields) or 'Ninguno'}\n\nRevisa los datos antes de guardar.",parent=self.win)
        except Exception as e:messagebox.showerror("No se pudo leer",str(e),parent=self.win)
    def save(self):
        vals={}
        for fld in BY_TABLE[self.table].fields:
            w=self.widgets[fld.key]
            value=w.get("1.0","end-1c") if fld.kind=="multiline" else self.vars[fld.key].get()
            if fld.kind=="file" and value and Path(value).is_file() and not str(value).startswith(str(BASE)):
                try:value=self.app.db.import_file(value)
                except Exception as e:messagebox.showerror("Archivo",str(e),parent=self.win);return
            vals[fld.key]=value
        try:self.app.db.save(self.table,vals,rid=self.record.get("id") if self.record else None)
        except Exception as e:messagebox.showerror("Verifica los datos",str(e),parent=self.win);return
        self.win.destroy();self.app.go(self.table)

class DesktopApp:
    def __init__(self,db=None,start_mainloop=True):
        self.db=db or Database();self.root=tk.Tk();self.root.title("GFLM Systems  |  Oficina Administrativa")
        self.root.geometry("1240x800");self.root.minsize(1024,680);self.root.configure(bg=C["bg"])
        self.root.protocol("WM_DELETE_WINDOW",self.exit)
        self.styles();self.module="dashboard";self.navbuttons={};self.selected_rows={}
        self.sidebar=tk.Frame(self.root,bg=C["side"],width=244);self.sidebar.pack(side="left",fill="y");self.sidebar.pack_propagate(False)
        self.main=tk.Frame(self.root,bg=C["bg"]);self.main.pack(side="left",fill="both",expand=True)
        self.nav();self.go("dashboard")
        if start_mainloop:self.root.mainloop()
    def styles(self):
        s=ttk.Style(self.root);s.theme_use("clam")
        s.configure("Treeview",rowheight=38,background=C["panel"],fieldbackground=C["panel"],foreground=C["text"],borderwidth=0,font=(FONT,10))
        s.configure("Treeview.Heading",background=C["panel2"],foreground=C["text"],font=(FONT,10,"bold"),padding=10,relief="flat")
        s.map("Treeview",background=[("selected","#2A62B0")],foreground=[("selected","white")])
        s.configure("TScrollbar",background=C["panel2"],troughcolor=C["side"])
        s.configure("TEntry",foreground="#152640",fieldbackground="#F1F5FB",padding=6)
        s.configure("TCombobox",foreground="#152640",fieldbackground="#F1F5FB",padding=6)
    def nav(self):
        box=tk.Frame(self.sidebar,bg=C["side"],padx=18,pady=24);box.pack(fill="x")
        label(box,"◆  GFLM",21,"bold",bg=C["side"]).pack(anchor="w")
        label(box,"SYSTEMS  /  DESKTOP",9,"bold",color=C["accent"],bg=C["side"]).pack(anchor="w",pady=3)
        divider=tk.Frame(self.sidebar,height=1,bg=C["line"]);divider.pack(fill="x",padx=16,pady=(0,9))
        container=tk.Frame(self.sidebar,bg=C["side"]);container.pack(fill="both",expand=True)
        canv=tk.Canvas(container,bg=C["side"],highlightthickness=0)
        scroll=ttk.Scrollbar(container,orient="vertical",command=canv.yview)
        items=tk.Frame(canv,bg=C["side"]);items.bind("<Configure>",lambda e:canv.configure(scrollregion=canv.bbox("all")))
        canv.create_window(0,0,window=items,anchor="nw");canv.configure(yscrollcommand=scroll.set)
        canv.pack(side="left",fill="both",expand=True)
        scroll.pack(side="right",fill="y")
        def navwheel(e):canv.yview_scroll(int(-e.delta/120),"units")
        canv.bind("<Enter>",lambda e:canv.bind_all("<MouseWheel>",navwheel))
        canv.bind("<Leave>",lambda e:canv.unbind_all("<MouseWheel>"))
        names={"dashboard":("IN","Inicio"),"audit":("AU","Historial")}
        for group,modules in MENU_GROUPS:
            label(items,group,8,"bold",color=C["muted"],bg=C["side"]).pack(anchor="w",padx=22,pady=(16,7))
            for module in modules:
                code,title=names[module] if module in names else (BY_TABLE[module].icon,BY_TABLE[module].title)
                b=tk.Button(items,text=f"{code}   {title}",font=(FONT,10),anchor="w",padx=15,pady=7,
                     bg=C["side"],fg=C["muted"],relief="flat",borderwidth=0,cursor="hand2",
                     activebackground=C["panel2"],activeforeground=C["white"],highlightthickness=0,command=lambda m=module:self.go(m))
                b.pack(fill="x",padx=9,pady=1);self.navbuttons[module]=b
        bottom=tk.Frame(self.sidebar,bg=C["side"],padx=15,pady=13);bottom.pack(side="bottom",fill="x")
        button(bottom,"Respaldar base de datos",self.backup).pack(fill="x")
        label(bottom,"Datos guardados solo en este equipo",8,color=C["muted"],bg=C["side"]).pack(anchor="center",pady=(9,0))
    def header(self,title,subtitle):
        h=tk.Frame(self.main,bg=C["bg"],padx=26,pady=21);h.pack(fill="x")
        label(h,title,23,"bold",bg=C["bg"]).pack(anchor="w")
        label(h,subtitle,10,color=C["muted"],bg=C["bg"]).pack(anchor="w",pady=(5,0))
        return h
    def go(self,module):
        self.module=module
        for key,b in self.navbuttons.items():b.config(bg=C["panel2"] if key==module else C["side"],fg="white" if key==module else C["muted"])
        for w in self.main.winfo_children():w.destroy()
        if module=="dashboard":self.dashboard()
        elif module=="audit":self.history()
        else:self.table_view(module)
    def card(self,parent,title,value,color=None):
        pane=tk.Frame(parent,bg=C["panel"],highlightbackground=C["line"],highlightthickness=1)
        label(pane,title.upper(),9,"bold",color=C["muted"]).pack(anchor="w",padx=18,pady=(17,7))
        label(pane,value,20,"bold",color=color or C["white"]).pack(anchor="w",padx=18,pady=(0,16))
        return pane
    def dashboard(self):
        h=self.header("Panel de control","Tu oficina digital: movimientos, sustentos, personal y pendientes en un solo lugar")
        button(h,"Exportar rendición integral",lambda:self.export("rendition"),primary=True).place(relx=1,rely=.3,anchor="e")
        s=self.db.cash_summary();alerts=self.db.alerts();missing=sum(1 for c in self.db.all("compras") if c.get("tipo")=="Factura pendiente" or c.get("estado")=="Pendiente")
        kpis=tk.Frame(self.main,bg=C["bg"]);kpis.pack(fill="x",padx=26,pady=(1,16))
        cards=[("Fondos recibidos",f"S/ {s['recibido']:,.2f}",C["text"]),
               ("Gastos registrados",f"S/ {s['gasto_total']:,.2f}",C["text"]),
               ("Fondos por rendir",f"S/ {s['saldo_fondos_empresa']:,.2f}",C["teal"]),
               ("Dinero propio pendiente",f"S/ {s['por_reembolsar']:,.2f}",C["warning"])]
        for i,(title,val,color) in enumerate(cards):kpis.grid_columnconfigure(i,weight=1,uniform="k");self.card(kpis,title,val,color).grid(row=0,column=i,sticky="nsew",padx=5)
        body=tk.Frame(self.main,bg=C["bg"]);body.pack(fill="both",expand=True,padx=30,pady=(0,20))
        body.grid_columnconfigure(0,weight=3);body.grid_columnconfigure(1,weight=2);body.grid_rowconfigure(0,weight=1)
        alertbox=tk.Frame(body,bg=C["panel"],padx=18,pady=17);alertbox.grid(row=0,column=0,sticky="nsew",padx=(0,12))
        label(alertbox,"Agenda y alertas vencidas",15,"bold").pack(anchor="w")
        label(alertbox,f"{len(alerts)} vencimientos sin cerrar · {missing} comprobantes pendientes",10,color=C["muted"]).pack(anchor="w",pady=(5,14))
        tree=ttk.Treeview(alertbox,columns=("tipo","fecha","detalle"),show="headings",height=12)
        for k,txt,width in (("tipo","Área",120),("fecha","Vence",110),("detalle","Detalle",360)):
            tree.heading(k,text=txt);tree.column(k,width=width,anchor="w")
        for x in alerts[:100]:tree.insert("","end",iid=f"{x['tabla']}_{x['id']}_{len(tree.get_children())}",values=(x["tabla"].capitalize(),x["fecha"],str(x["detalle"])[:90]),tags=(x["tabla"],))
        tree.pack(fill="both",expand=True)
        label(alertbox,"Abre el módulo correspondiente para actualizar un pendiente.",9,color=C["muted"]).pack(anchor="w",pady=(12,0))
        right=tk.Frame(body,bg=C["bg"]);right.grid(row=0,column=1,sticky="nsew")
        quick=tk.Frame(right,bg=C["panel"],padx=16,pady=14);quick.pack(fill="x",pady=(0,12))
        label(quick,"Acciones rápidas",15,"bold").pack(anchor="w",pady=(0,12))
        for title,tablename in (("+ Registrar gasto / depósito","movimientos"),("+ Registrar compra / factura","compras"),("+ Nuevo requerimiento","requerimientos"),("+ Marcar asistencia","tareos"),("+ Ingreso de almacén","almacen")):
            button(quick,title,lambda m=tablename:FormDialog(self,m)).pack(fill="x",pady=4)
        stock=tk.Frame(right,bg=C["panel"],padx=16,pady=14);stock.pack(fill="both",expand=True)
        label(stock,"Almacén y control",15,"bold").pack(anchor="w")
        inv=self.db.inventory();negative=[x for x in inv if x["saldo"]<=0]
        label(stock,f"{len(inv)} materiales registrados · {len(negative)} sin existencia",10,color=C["muted"]).pack(anchor="w",pady=8)
        label(stock,"Evidencia de ingreso, firma física y salida quedan vinculadas a cada movimiento.",10,color=C["muted"],wraplength=370,justify="left").pack(anchor="w",pady=(3,12))
        button(stock,"Ver Kardex",lambda:self.go("almacen")).pack(anchor="w")
    def table_view(self,table):
        mod=BY_TABLE[table]
        h=self.header(mod.title,mod.subtitle)
        button(h,"+ Nuevo registro",lambda:FormDialog(self,table),True).place(relx=1,rely=.32,anchor="e")
        bar=tk.Frame(self.main,bg=C["bg"]);bar.pack(fill="x",padx=26,pady=(0,12))
        search=tk.StringVar();label(bar,"Buscar:",10,color=C["muted"],bg=C["bg"]).pack(side="left",padx=(0,8))
        entry=ttk.Entry(bar,textvariable=search,width=36);entry.pack(side="left",ipady=5)
        button(bar,"Actualizar",lambda:self.go(table)).pack(side="left",padx=7)
        button(bar,"Editar seleccionado",lambda:self.edit_selected(table)).pack(side="left",padx=5)
        button(bar,"Adjunto",lambda:self.open_selected_file(table)).pack(side="left",padx=5)
        button(bar,"Excel",lambda:self.export(table)).pack(side="right",padx=4)
        if table in ("ordenes","almacen","requerimientos","planillas","alquileres","compras"):
            button(bar,"Generar PDF",lambda:self.pdf_selected(table)).pack(side="right",padx=5)
        display=tk.Frame(self.main,bg=C["panel"]);display.pack(fill="both",expand=True,padx=26,pady=(0,14))
        columns=("id",)+mod.columns
        tree=ttk.Treeview(display,columns=columns,show="headings",selectmode="browse")
        for key in columns:
            field=next((f for f in mod.fields if f.key==key),None)
            tree.heading(key,text=field.label if field else "ID")
            width=70 if key=="id" else 120 if key in ("fecha","entrega","vence","estado","tipo","prioridad") else 205 if key in ("nombre","descripcion","concepto","detalle","material","equipo") else 155
            tree.column(key,width=width,anchor="w",stretch=False)
        scrolly=ttk.Scrollbar(display,orient="vertical",command=tree.yview);scrollx=ttk.Scrollbar(display,orient="horizontal",command=tree.xview)
        tree.configure(yscrollcommand=scrolly.set,xscrollcommand=scrollx.set)
        tree.grid(row=0,column=0,sticky="nsew");scrolly.grid(row=0,column=1,sticky="ns");scrollx.grid(row=1,column=0,sticky="ew")
        display.grid_columnconfigure(0,weight=1);display.grid_rowconfigure(0,weight=1)
        self.current_tree=tree;self.current_table=table
        def fill(*_):
            for item in tree.get_children():tree.delete(item)
            rows=self.db.all(table,search.get())
            for r in rows:
                values=[r["id"]]+[self.format(r.get(k),k) for k in mod.columns]
                tree.insert("","end",iid=str(r["id"]),values=values)
            footer.config(text=f"{len(rows)} registros · Datos locales protegidos de publicación en GitHub")
        search.trace_add("write",fill);tree.bind("<Double-1>",lambda e:self.edit_selected(table))
        actions=tk.Frame(self.main,bg=C["bg"]);actions.pack(fill="x",padx=26,pady=(0,10))
        if table=="compras":
            button(actions,"Registrar pago en caja",self.buy_to_cash).pack(side="left",padx=4)
            button(actions,"Registrar ingreso a almacén",self.buy_to_store).pack(side="left",padx=4)
        if table=="requerimientos":button(actions,"Preparar orden de compra",self.req_to_order).pack(side="left",padx=4)
        if table=="almacen":button(actions,"Ver existencias",lambda:self.export("inventory")).pack(side="left",padx=4)
        if table=="tareos":button(actions,"Excel por rango de fechas",self.tareo_period).pack(side="left",padx=4)
        button(actions,"Archivar seleccionado",lambda:self.archive_selected(table),danger=True).pack(side="right",padx=4)
        footer=label(self.main,"",9,color=C["muted"],bg=C["bg"]);footer.pack(anchor="w",padx=30,pady=(0,8));fill()
    def format(self,val,key):
        if val is None:return ""
        if key in ("monto","total","igv","neto","basico","extras","descuentos","tarifa","jornal","valor_venta"):
            try:return f"S/ {float(val):,.2f}"
            except:pass
        if isinstance(val,float):return f"{val:g}"
        if key=="personal_id":
            p=self.db.one("personal",int(val));return p["nombre"] if p else f"ID {val}"
        return str(val).replace("\n"," ")[:140]
    def selected(self,table):
        if self.current_table!=table:return None
        sel=self.current_tree.selection()
        return self.db.one(table,int(sel[0])) if sel else None
    def edit_selected(self,table):
        r=self.selected(table)
        if not r:messagebox.showinfo("Selecciona un registro","Haz clic en una fila para editarla.");return
        FormDialog(self,table,record=r)
    def open_selected_file(self,table):
        r=self.selected(table)
        if not r:return messagebox.showinfo("Selecciona un registro","Elige una fila primero.")
        path=r.get("archivo")
        if not path:return messagebox.showinfo("Sin archivo","Este registro aún no tiene evidencia adjunta.")
        p=self.db.filepath(path)
        if not p.is_file():return messagebox.showerror("Archivo no encontrado",str(p))
        if sys.platform=="win32":os.startfile(str(p))
        else:
            import subprocess
            subprocess.Popen(["xdg-open",str(p)])
    def archive_selected(self,table):
        r=self.selected(table)
        if not r:return messagebox.showinfo("Selecciona un registro","Elige una fila primero.")
        if not messagebox.askyesno("Archivar registro",f"¿Archivar el registro #{r['id']}? Quedará en historial, no se borrará físicamente."):return
        try:self.db.archive(table,r["id"]);self.go(table)
        except Exception as e:messagebox.showerror("No se pudo archivar",str(e))
    def pdf_selected(self,table):
        r=self.selected(table)
        if not r:return messagebox.showinfo("Selecciona un registro","Elige una fila primero.")
        p=filedialog.asksaveasfilename(defaultextension=".pdf",initialfile=f"GFLM_{table}_{r['id']:06}.pdf",filetypes=[("PDF","*.pdf")])
        if not p:return
        try:reports.create_pdf(self.db,table,r,p);messagebox.showinfo("PDF listo",f"Documento creado:\n{p}\n\nImprímelo, recoge la firma física y carga después la foto firmada como evidencia.")
        except Exception as e:messagebox.showerror("Error al crear PDF",str(e))
    def export(self,target):
        fn="GFLM_Rendicion_Integral.xlsx" if target=="rendition" else "GFLM_Inventario.xlsx" if target=="inventory" else "GFLM_Reporte_Completo.xlsx" if target=="full" else f"GFLM_{target}.xlsx"
        p=filedialog.asksaveasfilename(defaultextension=".xlsx",initialfile=fn,filetypes=[("Libro Excel","*.xlsx")])
        if not p:return
        try:
            if target=="rendition":reports.export_rendition(self.db,p)
            elif target=="inventory":reports.export_inventory(self.db,p)
            elif target=="full":reports.export_full(self.db,p)
            else:reports.export_module(self.db,target,p)
            messagebox.showinfo("Reporte creado",f"Excel generado:\n{p}")
        except Exception as e:messagebox.showerror("Error al exportar",str(e))
    def buy_to_cash(self):
        r=self.selected("compras")
        if not r:return messagebox.showinfo("Selecciona una compra","Elige una compra para registrar su pago.")
        pref={"fecha":r.get("fecha"),"obra":r.get("obra"),"tipo":"Gasto","categoria":"Compras", "concepto":r.get("concepto"),"monto":r.get("total"),"proveedor":r.get("proveedor"),"comprobante":r.get("tipo"),"numero":r.get("serie_numero"),"compra_id":r.get("id")}
        FormDialog(self,"movimientos",prefill=pref)
    def buy_to_store(self):
        r=self.selected("compras")
        if not r:return messagebox.showinfo("Selecciona una compra","Elige una compra para ingresar materiales realmente recibidos.")
        pref={"fecha":date.today().isoformat(),"obra":r.get("obra"),"tipo":"Ingreso","material":str(r.get("concepto") or "")[:90],"referencia":r.get("serie_numero"),"compra_id":r.get("id"),"estado_firma":"Pendiente"}
        FormDialog(self,"almacen",prefill=pref)
    def req_to_order(self):
        r=self.selected("requerimientos")
        if not r:return messagebox.showinfo("Selecciona un requerimiento","Elige una solicitud primero.")
        FormDialog(self,"ordenes",prefill={"obra":r.get("obra"),"descripcion":r.get("detalle"),"requerimiento_id":r.get("id"),"entrega":r.get("entrega"),"estado":"Borrador"})
    def tareo_period(self):
        start=simpledialog.askstring("Tareo","Desde (AAAA-MM-DD)",initialvalue=date.today().replace(day=1).isoformat(),parent=self.root)
        if not start:return
        end=simpledialog.askstring("Tareo","Hasta (AAAA-MM-DD)",initialvalue=date.today().isoformat(),parent=self.root)
        if not end:return
        p=filedialog.asksaveasfilename(defaultextension=".xlsx",initialfile=f"Tareo_{start}_{end}.xlsx",filetypes=[("Excel","*.xlsx")])
        if p:
            try:reports.export_tareo_period(self.db,start,end,p);messagebox.showinfo("Tareo listo",p)
            except Exception as e:messagebox.showerror("Error",str(e))
    def backup(self):
        try:
            p=self.db.backup();messagebox.showinfo("Respaldo creado",f"Respaldo ZIP completo creado:\n{p}\n\nIncluye la base SQLite y los archivos de evidencia.")
        except Exception as e:messagebox.showerror("Respaldo",str(e))
    def history(self):
        h=self.header("Historial de actividad","Qué se cambió, cuándo y en qué módulo. No elimina registros de auditoría.")
        box=tk.Frame(self.main,bg=C["panel"]);box.pack(fill="both",expand=True,padx=26,pady=(0,20))
        tree=ttk.Treeview(box,columns=("fecha","accion","detalle"),show="headings")
        for key,width in (("fecha",170),("accion",100),("detalle",950)):
            tree.heading(key,text=key.capitalize());tree.column(key,width=width)
        for r in self.db.audit_rows():tree.insert("","end",values=(r["fecha"],r["accion"],str(r["detalle"])[:600]))
        tree.pack(fill="both",expand=True)
    def exit(self):
        self.db.close();self.root.destroy()

def run():DesktopApp()
