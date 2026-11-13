/* GFLM Systems Field Operations v5
   Flujos locales: rendición gerencial, tareo por cuadrilla, respaldo con evidencias,
   resúmenes para WhatsApp y controles de seguridad de datos.
   No implementa recepción de WhatsApp ni autenticación de usuarios. */
(function(){
"use strict";
const G=window.GFLM,Ops=window.GFLMOps;
if(!G||!Ops)return;
const BASE="gflm-web-local-v1",WSP="gflm-ops-v4",BACKUP_LIMIT=40*1024*1024;
const oldView=Ops.view,oldAfter=Ops.afterRender;
let filters={obra:"",desde:"",hasta:""},tareo={obra:"",fecha:G.today()},busy=false;
const EVIDENCE_DB="gflm-evidencias-local-v1";
for(const k of ["rendicion","cuadrilla","seguridad"])G.models[k]={short:{"rendicion":"Rendición PRO","cuadrilla":"Tareo masivo","seguridad":"Respaldos"}[k],fields:[],columns:[]};
function e(value){return G.esc(value==null?"":value);}
function n(value){const v=Number(String(value==null?"0":value).replace(",","."));return Number.isFinite(v)?v:0;}
function money(v){return G.money(v);}
function current(){return G.today();}
function dateOk(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||"");}
function get(k){return G.getRows(k);}
function selected(rows){return rows.filter(r=>(!filters.obra||r.obra===filters.obra)&&(!filters.desde||r.fecha>=filters.desde)&&(!filters.hasta||r.fecha<=filters.hasta));}
function options(value,values){return values.map(x=>'<option value="'+e(x[0])+'" '+(String(x[0])===String(value)?"selected":"")+'>'+e(x[1])+'</option>').join("");}
function projects(value,blank){const v=(blank?[["","Todas las obras"]]:[["","Seleccionar obra"]]).concat(get("obras").map(x=>[x.nombre,x.nombre]));return options(value,v);}
function btn(action,label,cls){return '<button type="button" class="field-btn '+(cls||"")+'" data-field="'+e(action)+'">'+label+'</button>';}
function header(kicker,title,subtitle){return '<div class="field-heading"><div><span class="ops-eyebrow">'+e(kicker)+'</span><h1>'+e(title)+'</h1><p>'+e(subtitle)+'</p></div><div class="field-heading-mark">G<span>/</span>5</div></div>';}
function metric(label,value,foot,highlight){return '<div class="field-stat '+(highlight||"")+'"><span>'+e(label)+'</span><strong>'+e(value)+'</strong><small>'+e(foot)+'</small></div>';}
function panel(title,kicker,body){return '<section class="field-panel"><div class="field-panel-title"><div><span class="ops-eyebrow">'+e(kicker)+'</span><h2>'+e(title)+'</h2></div></div>'+body+'</section>';}
function note(){return '<div class="field-private">⚠ <b>Versión de pruebas:</b> los datos solo existen en este navegador. Esta web pública todavía no tiene cuentas de usuario ni base de datos central. No registres datos sensibles reales.</div>';}
function finance(){
 const moves=selected(get("caja")), purchases=selected(get("compras")),works=get("obras").length;
 const summary={received:0,spentCompany:0,spentOwn:0,repaid:0,returned:0,expenses:0};
 moves.forEach(r=>{
  const amount=n(r.monto);
  if(r.tipo==="Ingreso empresa")summary.received+=amount;
  else if(r.tipo==="Gasto"){if(r.cuenta==="Dinero propio")summary.spentOwn+=amount;else summary.spentCompany+=amount;summary.expenses+=amount;}
  else if(r.tipo==="Reembolso a mí")summary.repaid+=amount;
  else if(r.tipo==="Devolución empresa")summary.returned+=amount;
 });
 summary.remaining=summary.received-summary.spentCompany-summary.repaid-summary.returned;
 summary.ownPending=summary.spentOwn-summary.repaid;
 const categories=new Map(),sources=new Map();
 moves.filter(r=>r.tipo==="Gasto").forEach(r=>{
  const cat=String(r.categoria||"Sin categoría"),key=String(r.cuenta||"Sin cuenta");
  categories.set(cat,(categories.get(cat)||0)+n(r.monto));
  sources.set(key,(sources.get(key)||0)+n(r.monto));
 });
 const pendingDocs=purchases.filter(r=>r.tipo==="Factura pendiente"||r.estado==="Pendiente"||!r.serie_numero&&r.tipo==="Factura");
 const unbacked=moves.filter(r=>r.tipo==="Gasto"&&["Sin comprobante","Factura pendiente"].includes(r.comprobante));
 return {moves,purchases,summary,categories,sources,pendingDocs,unbacked,works};
}
function rendicion(){
 const r=finance(),s=r.summary,moves=[...r.moves].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||b.id-a.id);
 let html='<div class="field-version">'+header("GERENCIA · CONTROL DE FONDOS","Rendición de obra","Depósitos, gastos, comprobantes y dinero personal en un solo informe que puedes imprimir o exportar.")+
 note()+
 '<div class="field-toolbar"><label>Obra<select id="fieldObra" class="ops-input">'+projects(filters.obra,true)+'</select></label><label>Desde<input id="fieldDesde" class="ops-input" type="date" value="'+e(filters.desde)+'"></label><label>Hasta<input id="fieldHasta" class="ops-input" type="date" value="'+e(filters.hasta)+'"></label>'+btn("report-print","Imprimir / guardar PDF","primary")+btn("report-csv","↓ Excel (CSV)")+'</div>'+
 '<div class="field-stats">'+metric("Fondos recibidos",money(s.received),"Ingresos registrados","")+
 metric("Gastos empresa",money(s.spentCompany),"Fondos bajo administración","")+
 metric("Gastos propios",money(s.spentOwn),"Dinero aportado por ti","")+
 metric("Pendiente de reembolso",money(s.ownPending),"Gastos propios menos reembolsos","attention")+'</div>';
 html+='<div class="field-report-balance"><div><span>SALDO DE FONDOS POR RENDIR</span><strong>'+e(money(s.remaining))+'</strong><small>Ingresos − gastos con fondos de empresa − reembolsos − devoluciones</small></div><div class="field-report-mini"><span>Total de gastos</span><b>'+e(money(s.expenses))+'</b><span>Reembolsos realizados</span><b>'+e(money(s.repaid))+'</b><span>Devoluciones a empresa</span><b>'+e(money(s.returned))+'</b></div></div>';
 const group=Array.from(r.categories.entries()).sort((a,b)=>b[1]-a[1]);
 const total=Math.max(s.expenses,.01);
 const graph=group.length?group.map(([name,amount])=>'<div class="field-bar-row"><div><b>'+e(name)+'</b><span>'+e(money(amount))+'</span></div><div class="field-bar"><span style="width:'+Math.max(1,Math.round(amount/total*100))+'%"></span></div></div>').join(""):'<div class="field-empty">Todavía no hay gastos registrados.</div>';
 html+='<div class="field-two">'+panel("¿En qué se gastó?","DISTRIBUCIÓN POR CATEGORÍA",'<div class="field-bars">'+graph+'</div>')+
 panel("Pendientes documentarios","ANTES DE ENTREGAR LA RENDICIÓN",'<div class="field-pending"><div>'+metric("Facturas / documentos pendientes",r.pendingDocs.length,"Compras sin sustento completo","attention")+metric("Gastos sin comprobante definitivo",r.unbacked.length,"Revisar comprobante declarado","")+'</div><p>Estos valores ayudan a verificar soportes; no reemplazan la validación contable de comprobantes ante SUNAT.</p>'+btn("goto:compras","Revisar compras →")+'</div>')+'</div>';
 html+=panel("Detalle de movimientos","REGISTRO COMPLETO · FACTURAS, BOLETAS, NOTAS Y SIN COMPROBANTE",
 '<div class="field-table-scroller"><table class="field-table"><thead><tr><th>Fecha</th><th>Obra</th><th>Movimiento</th><th>Concepto</th><th>Comprobante</th><th>Origen / destino</th><th class="right">Importe</th></tr></thead><tbody>'+
 (moves.length?moves.map(x=>'<tr><td>'+e(x.fecha)+'</td><td>'+e(x.obra||"—")+'</td><td>'+e(x.tipo)+'</td><td>'+e(x.concepto)+'</td><td>'+e(x.comprobante||"—")+'</td><td>'+e(x.cuenta||"—")+'</td><td class="right">'+e(money(x.monto))+'</td></tr>').join(""):'<tr><td colspan="7" class="field-empty">No hay operaciones dentro del rango seleccionado.</td></tr>')+
 '</tbody></table></div><div class="field-bottom-note">'+moves.length+' movimientos en el período. Compras registradas: '+r.purchases.length+'. Las compras sin movimiento de caja no se incluyen como gasto pagado.</div>')+
 '<div class="field-actions">'+btn("report-wsp","Preparar rendición por WhatsApp","primary")+btn("goto:caja","Registrar ingreso / egreso")+'</div></div>';
 return html;
}
function reportMessage(){
 const s=finance().summary;
 return "GFLM SYSTEMS · RESUMEN DE RENDICIÓN\n"+(filters.obra?"Obra: "+filters.obra+"\n":"Todas las obras\n")+
 (filters.desde||filters.hasta?"Período: "+(filters.desde||"Inicio")+" al "+(filters.hasta||"Hoy")+"\n":"")+
 "Fondos recibidos: "+money(s.received)+"\nGastos con fondos empresa: "+money(s.spentCompany)+
 "\nGastos con dinero propio: "+money(s.spentOwn)+"\nReembolsos recibidos: "+money(s.repaid)+
 "\nDevoluciones: "+money(s.returned)+"\nSaldo de fondos: "+money(s.remaining)+
 "\nPendiente de reembolso: "+money(s.ownPending)+"\nSustentos detallados disponibles en el reporte local. Envío sujeto a verificación.";
}
function csvCell(value){let v=String(value==null?"":value);if(/^[=+\-@\r\n\t]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
function csvTable(rows){return "\ufeff"+rows.map(row=>row.map(csvCell).join(";")).join("\r\n");}
function exportReport(){
 const r=finance(),s=r.summary;
 const lines=[
 ["GFLM SYSTEMS · RENDICIÓN INTEGRAL"],
 ["Obra",filters.obra||"Todas"],["Desde",filters.desde||"Todas"],["Hasta",filters.hasta||"Todas"],
 [],["RESUMEN","S/"],["Fondos recibidos",s.received.toFixed(2)],["Gastos con fondos empresa",s.spentCompany.toFixed(2)],
 ["Gastos propios",s.spentOwn.toFixed(2)],["Reembolsos recibidos",s.repaid.toFixed(2)],["Devoluciones a empresa",s.returned.toFixed(2)],
 ["Saldo fondos por rendir",s.remaining.toFixed(2)],["Pendiente de reembolso",s.ownPending.toFixed(2)],
 [],["MOVIMIENTOS"],["ID","Fecha","Obra","Tipo","Categoría","Concepto","Proveedor","Cuenta","Medio","Comprobante","Referencia","Compra vinculada","Monto S/"]
 ];
 r.moves.forEach(x=>lines.push([x.id,x.fecha,x.obra,x.tipo,x.categoria,x.concepto,x.proveedor,x.cuenta,x.medio,x.comprobante,x.referencia,x.compra_id,x.monto]));
 lines.push([],["COMPRAS Y COMPROBANTES"],["ID","Fecha","Obra","Proveedor","RUC","Comprobante","Serie / número","Concepto","Valor venta S/","IGV S/","Total S/","Estado"]);
 r.purchases.forEach(x=>lines.push([x.id,x.fecha,x.obra,x.proveedor,x.ruc,x.tipo,x.serie_numero,x.concepto,x.valor_venta,x.igv,x.total,x.estado]));
 G.download("GFLM_Rendicion_Integral_"+current()+".csv",csvTable(lines),"text/csv;charset=utf-8");G.notify("Reporte CSV compatible con Excel preparado.");
}
function reportPrint(){
 const r=finance(),s=r.summary,cat=Array.from(r.categories.entries()).sort((a,b)=>b[1]-a[1]);
 const html='<html lang="es"><head><meta charset="utf-8"><title>Rendición GFLM · '+e(current())+'</title><style>body{font:12px Arial,sans-serif;color:#18201b;margin:28px}h1{font-size:22px;margin:0 0 7px}.intro{color:#516159}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.summary>div{padding:12px;background:#eef1eb;border:1px solid #d0dccd}.summary span{display:block;font-size:10px;color:#59675b}.summary strong{font-size:16px}h2{font-size:15px;margin:22px 0 10px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border-bottom:1px solid #d6ddd3;padding:8px;text-align:left}th{background:#e7eee5}.right{text-align:right}.sign{display:flex;gap:22px;margin:75px 0 10px}.sign span{flex:1;border-top:1px solid #667;padding:13px 0;text-align:center;font-size:11px}.bottom{color:#66776c;font-size:10px;margin-top:24px}@media print{@page{size:A4;margin:15mm}body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>'+
 '<h1>GFLM SYSTEMS · RENDICIÓN</h1><div class="intro">Obra: '+e(filters.obra||"Todas las obras")+' · Desde: '+e(filters.desde||"Inicio")+' · Hasta: '+e(filters.hasta||current())+'</div>'+
 '<div class="summary">'+[["Fondos recibidos",s.received],["Gastos empresa",s.spentCompany],["Gastos propios",s.spentOwn],["Reembolsos",s.repaid],["Saldo fondos",s.remaining],["Por reembolsar",s.ownPending]].map(x=>'<div><span>'+e(x[0])+'</span><strong>'+e(money(x[1]))+'</strong></div>').join("")+'</div>'+
 '<h2>Gastos por categoría</h2><table><thead><tr><th>Categoría</th><th class="right">Total</th></tr></thead><tbody>'+cat.map(x=>'<tr><td>'+e(x[0])+'</td><td class="right">'+e(money(x[1]))+'</td></tr>').join("")+'</tbody></table>'+
 '<h2>Movimientos de caja</h2><table><thead><tr><th>Fecha</th><th>Obra</th><th>Tipo</th><th>Concepto</th><th>Sustento</th><th class="right">Monto</th></tr></thead><tbody>'+
 r.moves.map(x=>'<tr><td>'+e(x.fecha)+'</td><td>'+e(x.obra||"")+'</td><td>'+e(x.tipo)+'</td><td>'+e(x.concepto)+'</td><td>'+e(x.comprobante||"")+'</td><td class="right">'+e(money(x.monto))+'</td></tr>').join("")+'</tbody></table>'+
 '<div class="sign"><span>Elaborado por / firma</span><span>Revisado por / firma</span><span>Conformidad / firma</span></div><p class="bottom">Reporte de control interno. Comprobantes y sustentos sujetos a revisión y conciliación.</p></body></html>';
 const win=window.open("","_blank");if(!win){G.notify("Permite ventanas emergentes para imprimir.",true);return;}
 win.document.open();win.document.write(html);win.document.close();win.focus();setTimeout(()=>{try{win.print();}catch(e){}},200);
}
function cuadrilla(){
 const obs=get("obras"),obra=tareo.obra||obs[0]?.nombre||"";
 if(!tareo.obra&&obra)tareo.obra=obra;
 const workers=get("personal").filter(r=>r.estado!=="Inactivo"&&(!r.obra||r.obra===obra));
 const existing=get("tareos").filter(r=>r.obra===obra&&r.fecha===tareo.fecha);
 const total=existing.filter(r=>r.asistencia==="Asistió").length,hrs=existing.reduce((t,x)=>t+n(x.horas),0);
 let html='<div class="field-version">'+header("RECURSOS HUMANOS · CONTROL DIARIO","Tareo por cuadrilla","Marca la asistencia y las horas de todo el personal de una obra en una sola pantalla.")+
 note()+'<div class="field-toolbar"><label>Obra<select id="fieldCrewObra" class="ops-input">'+projects(obra,false)+'</select></label><label>Fecha<input id="fieldCrewFecha" class="ops-input" type="date" value="'+e(tareo.fecha)+'"></label>'+btn("crew-save","Guardar todo el tareo","primary")+btn("crew-csv","↓ Exportar día")+'</div>'+
 '<div class="field-stats crew-stats">'+metric("Trabajadores listados",workers.length,"Personal activo o disponible")+
 metric("Registros existentes",existing.length,"Para la obra y fecha seleccionadas")+
 metric("Asistieron",total,"Tareos registrados")+metric("Horas acumuladas",hrs.toFixed(1),"Horas del día")+'</div>';
 const statuses=["Asistió","Falta","Descanso","Permiso","Vacaciones"];
 let content='<div class="field-table-scroller"><table class="field-table" id="fieldCrewTable"><thead><tr><th>Marcar</th><th>Trabajador</th><th>Cargo</th><th>Asistencia</th><th>Horas</th><th>Observación</th></tr></thead><tbody>';
 if(!obra||!workers.length)content+='<tr><td colspan="6" class="field-empty">Primero registra una obra y personal activo asignado a ella.</td></tr>';
 workers.forEach(w=>{
  const old=existing.find(t=>String(t.trabajador)===String(w.id));
  const status=old?.asistencia||"Asistió",hours=old?.horas??"8";
  content+='<tr data-crew="'+e(w.id)+'"><td><input type="checkbox" class="field-attend" '+(old?"checked":"")+' aria-label="Incluir trabajador"></td><td><b>'+e(w.nombre)+'</b><small>'+e(w.documento||"")+'</small></td><td>'+e(w.cargo||"—")+'</td><td><select class="ops-input field-status">'+options(status,statuses.map(x=>[x,x]))+'</select></td><td><input class="ops-input field-hours" type="number" min="0" max="24" step=".5" value="'+e(hours)+'"></td><td><input class="ops-input field-note" placeholder="Observación" value="'+e(old?.notas||"")+'"></td></tr>';
 });
 content+='</tbody></table></div><div class="field-bottom-note">Marca «Incluir» para guardar un trabajador. Si ya existe un tareo del mismo día, se actualizará en lugar de duplicarse. Desmarcar no elimina registros anteriores.</div>';
 html+=panel("Registro diario","ASISTENCIA POR PERSONA",content)+
 '<div class="field-actions">'+btn("crew-mark-all","Seleccionar todos")+btn("crew-unmark","Desmarcar todos")+btn("goto:personal","Gestionar personal →")+'</div></div>';
 return html;
}
function crewData(){
 const obra=String(document.getElementById("fieldCrewObra")?.value||"");
 const fecha=String(document.getElementById("fieldCrewFecha")?.value||"");
 if(!obra||!get("obras").some(o=>o.nombre===obra))throw Error("Selecciona una obra válida");
 if(!dateOk(fecha))throw Error("Selecciona una fecha válida");
 const trs=[...document.querySelectorAll("#fieldCrewTable tbody tr[data-crew]")],items=[];
 for(const tr of trs){
  const check=tr.querySelector(".field-attend");if(!check?.checked)continue;
  const workerId=Number(tr.dataset.crew),attendance=tr.querySelector(".field-status").value,
   rawHours=tr.querySelector(".field-hours").value,hours=Number(rawHours),note=tr.querySelector(".field-note").value.trim();
  if(!get("personal").some(x=>x.id===workerId))throw Error("Trabajador no encontrado");
  if(rawHours===""||!Number.isFinite(hours)||hours<0||hours>24)throw Error("Horas inválidas en un trabajador");
  if(attendance!=="Asistió"&&hours>0)throw Error("Falta, descanso, permiso y vacaciones deben tener cero horas trabajadas");
  items.push({workerId,asistencia:attendance,horas:String(hours),notas:note});
 }
 return {obra,fecha,items};
}
function crewSave(){
 let data;try{data=crewData();}catch(err){G.notify(err.message,true);return;}
 if(!data.items.length){G.notify("Marca por lo menos a un trabajador para guardar.",true);return;}
 const table=G.db.tables.tareos,backup=JSON.stringify(table),auditBackup=JSON.stringify(G.db.audit);
 let made=0,updated=0;
 data.items.forEach(x=>{
  const existing=table.find(r=>!r.archived&&r.obra===data.obra&&r.fecha===data.fecha&&String(r.trabajador)===String(x.workerId));
  if(existing){
   existing.asistencia=x.asistencia;existing.horas=x.horas;existing.notas=x.notas;existing.updatedAt=new Date().toISOString();
   updated++;
  }else{
   const id=table.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;
   table.push({id,fecha:data.fecha,obra:data.obra,trabajador:String(x.workerId),asistencia:x.asistencia,horas:x.horas,notas:x.notas,createdAt:new Date().toISOString()});made++;
  }
 });
 G.db.audit.unshift({at:new Date().toISOString(),action:"TAREO MASIVO",table:"tareos",id:data.fecha,summary:data.obra+" · "+made+" nuevos / "+updated+" actualizados"});
 G.db.audit=G.db.audit.slice(0,400);
 try{localStorage.setItem(BASE,JSON.stringify(G.db));}catch(err){
  G.db.tables.tareos=JSON.parse(backup);G.db.audit=JSON.parse(auditBackup);
  G.notify("No se pudo guardar el tareo. Verifica espacio del navegador.",true);return;
 }
 G.render();G.notify("Tareo guardado: "+made+" nuevos, "+updated+" actualizados.");
}
function crewCsv(){
 let d;try{d=crewData();}catch(err){G.notify(err.message,true);return;}
 const names=new Map(get("personal").map(w=>[Number(w.id),w]));
 const lines=[["GFLM SYSTEMS · TAREO DIARIO"],["Obra",d.obra],["Fecha",d.fecha],[],["ID","Trabajador","Documento","Cargo","Asistencia","Horas","Observaciones"]];
 d.items.forEach(x=>{const w=names.get(x.workerId)||{};lines.push([x.workerId,w.nombre,w.documento,w.cargo,x.asistencia,x.horas,x.notas]);});
 G.download("GFLM_Tareo_"+d.obra.replace(/[^a-zA-Z0-9_-]/g,"_")+"_"+d.fecha+".csv",csvTable(lines),"text/csv;charset=utf-8");
 G.notify("Tareo del día exportado.");
}
function openEvidenceDb(){
 return new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error("Este navegador no admite evidencias locales"));return;}
  const req=indexedDB.open(EVIDENCE_DB,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("files")){const store=db.createObjectStore("files",{keyPath:"id",autoIncrement:true});store.createIndex("record","record",{unique:false});}};
  req.onerror=()=>reject(req.error||Error("No se pudo abrir archivo local"));req.onsuccess=()=>resolve(req.result);
 });
}
async function readEvidence(){
 const db=await openEvidenceDb();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction("files","readonly"),req=tx.objectStore("files").getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}
 finally{db.close();}
}
function blobAsDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
async function fileHash(file){
 const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function makeFullBackup(){
 if(busy)return;busy=true;
 try{
  G.notify("Preparando respaldo con evidencias. Espera la descarga...");
  const files=await readEvidence(),total=files.reduce((sum,x)=>sum+n(x.size),0);
  if(total>BACKUP_LIMIT)throw Error("Las evidencias superan 40 MB. Descarga algunas por separado antes del respaldo integral.");
  const pack={format:"gflm-completo",version:5,exportedAt:new Date().toISOString(),data:JSON.parse(JSON.stringify(G.db)),
    whatsapp:JSON.parse(localStorage.getItem(WSP)||"{}"),files:[]};
  for(const x of files){
   const hash=x.hash||await fileHash(x.file);
   pack.files.push({id:x.id,record:x.record,module:x.module,recordId:x.recordId,name:x.name,type:x.type,
    at:x.at,size:x.size,hash,data:await blobAsDataUrl(x.file)});
  }
  const str=JSON.stringify(pack);
  G.download("GFLM_Respaldo_Integral_"+current()+".json",str,"application/json;charset=utf-8");
  localStorage.setItem("gflm-field-lastbackup",new Date().toISOString());
  G.render();G.notify("Respaldo integral preparado. Confirma que quedó descargado en tu dispositivo.");
 }catch(err){G.notify("No se pudo exportar: "+err.message,true);}
 finally{busy=false;}
}
function blobFromDataUri(url,mime){
 const m=String(url).match(/^data:(image\/jpeg|image\/png|image\/webp|application\/pdf);base64,([a-zA-Z0-9+/=]+)$/);
 if(!m||m[1]!==mime)throw Error("Formato de evidencia no válido");
 const binary=atob(m[2]),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type:mime});
}
async function restoreFullBackup(file){
 if(busy)return;if(!file)return;busy=true;
 try{
  if(file.size>65*1024*1024)throw Error("Este respaldo supera el límite de 65 MB.");
  const pkg=JSON.parse(await file.text());
  if(pkg.format!=="gflm-completo"||pkg.version!==5||!pkg.data?.tables||!Array.isArray(pkg.data.audit)||!Array.isArray(pkg.files))throw Error("Archivo incompatible con el respaldo integral GFLM v5");
  if(!Array.isArray(pkg.data.tables.obras)||!Array.isArray(pkg.data.tables.caja))throw Error("El respaldo no contiene las tablas principales");
  const validFiles=[],total=pkg.files.reduce((sum,x)=>sum+n(x.size),0);
  if(total>BACKUP_LIMIT)throw Error("Evidencias superiores al límite de 40 MB.");
  for(const x of pkg.files){
   if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(x.type))throw Error("Tipo de adjunto no permitido");
   if(n(x.size)>8*1024*1024)throw Error("Un adjunto excede el máximo de 8 MB");
   const blob=blobFromDataUri(x.data,x.type);
   if(blob.size!==x.size)throw Error("Tamaño de archivo inconsistente: "+x.name);
   const hash=await fileHash(blob);
   if(hash!==x.hash)throw Error("La evidencia no supera la verificación de integridad: "+x.name);
   validFiles.push({record:String(x.record),module:String(x.module),recordId:x.recordId,
     name:String(x.name||"Evidencia"),type:x.type,size:blob.size,hash,at:x.at,file:new File([blob],String(x.name||"Evidencia"),{type:x.type})});
  }
  if(!confirm("¿Restaurar este respaldo? Sustituirá todos los registros, mensajes y evidencias locales de este navegador. Esta acción no se puede deshacer."))return;
  const normalized={version:1,tables:{},audit:pkg.data.audit.filter(x=>x&&typeof x==="object").slice(0,400)};
  Object.keys(G.models).forEach(k=>normalized.tables[k]=Array.isArray(pkg.data.tables[k])?pkg.data.tables[k].filter(x=>x&&typeof x==="object"&&Number.isFinite(Number(x.id))):[]);
  const originalData=JSON.parse(JSON.stringify(G.db)),originalWsp=localStorage.getItem(WSP);
  // Guardar datos de texto antes de reemplazar las evidencias; si falla, no se alteran adjuntos.
  try{localStorage.setItem(BASE,JSON.stringify(normalized));localStorage.setItem(WSP,JSON.stringify(pkg.whatsapp||{}));}
  catch(err){localStorage.setItem(BASE,JSON.stringify(originalData));if(originalWsp!==null)localStorage.setItem(WSP,originalWsp);else localStorage.removeItem(WSP);throw Error("Sin espacio para restaurar los registros");}
  const db=await openEvidenceDb();
  try{await new Promise((resolve,reject)=>{
   const tx=db.transaction("files","readwrite"),store=tx.objectStore("files");store.clear();
   validFiles.forEach(f=>store.add(f));
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error("Error de almacenamiento"));tx.onabort=()=>reject(Error("Se interrumpió la restauración"));
  });}catch(err){localStorage.setItem(BASE,JSON.stringify(originalData));if(originalWsp!==null)localStorage.setItem(WSP,originalWsp);else localStorage.removeItem(WSP);throw err;}finally{db.close();}
  Object.keys(G.models).forEach(k=>G.db.tables[k]=normalized.tables[k]);
  G.db.audit=normalized.audit;
  G.render();G.notify("Respaldo integral restaurado. Actualiza la página para cargar la configuración importada de WhatsApp.");
 }catch(err){G.notify("Restauración fallida: "+err.message,true);}
 finally{busy=false;}
}
function backupView(){
 const last=localStorage.getItem("gflm-field-lastbackup");
 const m=get("documentos").length,linked=G.db.audit.filter(x=>x.action==="ADJUNTAR ARCHIVO LOCAL").length;
 return '<div class="field-version">'+header("INTEGRIDAD DE INFORMACIÓN","Centro de respaldos","Protege tus rendiciones y evidencias físicas con una copia que puedas trasladar de computadora.")+note()+
 '<div class="field-safe-hero"><div><span class="ops-eyebrow">RESPALDO INTEGRAL · RECOMENDADO</span><h2>Registros + fotos + PDFs + WhatsApp asistido</h2><p>El respaldo JSON básico no incluye los archivos adjuntos. Esta función sí integra las evidencias almacenadas en este navegador, hasta 40 MB de archivos.</p><div class="field-hero-actions">'+btn("backup-full","↓ Descargar respaldo integral","primary")+btn("restore-open","↑ Restaurar desde archivo")+'</div><small>Última generación de respaldo: '+e(last?new Date(last).toLocaleString("es-PE"):"Aún no registrada")+'</small></div><span class="field-safe-icon">◈</span></div>'+
 '<div class="field-stats">'+metric("Obras",get("obras").length,"Registradas localmente")+metric("Movimientos",get("caja").length,"Caja y rendiciones")+metric("Documentos",m,"Referencias registradas")+metric("Archivos adjuntados",linked,"Acciones históricas, pueden repetirse")+'</div>'+
 panel("Qué protege y qué no","TRANSPARENCIA Y PREVENCIÓN",'<div class="field-protection"><div><b>✓ Datos que se exportan</b><p>Obras, personal, compras, movimientos, tareos, alquileres, actas, historial local, mensajes preparados y fotos/PDF en IndexedDB.</p></div><div><b>⚠ Riesgos que siguen existiendo</b><p>No hay base de datos central, usuarios ni cifrado remoto. Si pierdes el dispositivo sin respaldo, puedes perder información. Los archivos de respaldo pueden contener información confidencial: guárdalos en un lugar protegido.</p></div><div><b>◷ Antes de restaurar</b><p>Verifica la copia, descarga un respaldo actual y confirma que trabajas en el navegador correcto. Restaurar reemplaza los datos locales, no mezcla proyectos.</p></div></div>')+
 '<input type="file" id="fieldRestoreFile" accept="application/json,.json" hidden></div>';
}
function ensureWspDraft(text,type){
 G.changePage("whatsapp");
 if(type){const tab=document.querySelector('.ops-tabs button[data-op="channel:'+type+'"]');if(tab)tab.click();}
 const area=document.getElementById("opsMessage");if(area){area.value=text;area.focus();G.notify("Mensaje preparado. Comprueba el destinatario y confirma el envío dentro de WhatsApp.");}
 else G.notify("No se encontró el compositor de WhatsApp",true);
}
function reminders(){
 const alerts=G.alerts().slice(0,12);
 const pending=get("requerimientos").filter(x=>!["Cerrado","Entregado","Cancelado"].includes(x.estado)&&["Crítica","Urgente"].includes(x.prioridad)).slice(0,8);
 let text="GFLM SYSTEMS · REPORTE DE PENDIENTES\nFecha: "+current()+"\n";
 if(alerts.length){text+="\nVENCIMIENTOS:\n"+alerts.map(x=>"- "+x.label+" (obra: "+(x.obra||"sin definir")+", "+x.date+")").join("\n")+"\n";}
 if(pending.length){text+="\nREQUERIMIENTOS PRIORITARIOS:\n"+pending.map(x=>"- REQ-"+x.id+" / "+x.prioridad+": "+x.detalle+" / "+(x.entrega||"fecha por confirmar")).join("\n")+"\n";}
 if(!alerts.length&&!pending.length)text+="\nSin alertas ni requerimientos prioritarios registrados.";
 text+="\nSolicito confirmar atención, fecha y responsable.";
 return text;
}
function addWspEnhancements(){
 const form=document.querySelector(".ops-composer-inner");
 if(form&&!document.getElementById("fieldWspAssist")){
  const block=document.createElement("div");block.id="fieldWspAssist";block.className="field-whatsapp-enhance";
  block.innerHTML='<b>Plantillas de supervisión</b><p>Prepara textos basados en registros locales; revisa los datos antes de enviarlos.</p><div>'+btn("wsp-pendientes","◷ Resumen diario de pendientes")+btn("wsp-rendicion","S/ Rendición resumida")+btn("wsp-copy","Copiar mensaje")+'</div><small>Meta API aún no conectada. Los recordatorios NO se envían automáticamente.</small>';
  form.prepend(block);
 }
}
function afterRender(page){
 oldAfter(page);
 const nav=document.getElementById("navigation");
 if(nav&&!nav.querySelector('[data-nav="rendicion"]')){
  nav.insertAdjacentHTML("beforeend",'<div class="sidebar-label">HERRAMIENTAS DE CAMPO</div>'+
   '<button class="nav-link '+(page==="rendicion"?"active":"")+'" data-nav="rendicion"><span class="nav-icon">▥</span><span>Rendición PRO</span></button>'+
   '<button class="nav-link '+(page==="cuadrilla"?"active":"")+'" data-nav="cuadrilla"><span class="nav-icon">♙</span><span>Tareo masivo</span></button>'+
   '<button class="nav-link '+(page==="seguridad"?"active":"")+'" data-nav="seguridad"><span class="nav-icon">◈</span><span>Respaldo integral</span></button>');
 }
 if(["rendicion","cuadrilla","seguridad"].includes(page))document.getElementById("addBtn").style.display="none";
 if(page==="whatsapp")addWspEnhancements();
 if(page==="dashboard"&&!document.getElementById("fieldQuickBar")){
  const dash=document.querySelector(".ops-rapid");
  if(dash){const extra=document.createElement("div");extra.id="fieldQuickBar";extra.className="field-dashboard-actions";
   extra.innerHTML=btn("goto:rendicion","▥ Rendición PRO","primary")+btn("goto:cuadrilla","♙ Tareo de hoy")+btn("goto:seguridad","◈ Respaldo integral");
   dash.parentElement.insertBefore(extra,dash.nextSibling);
  }
 }
}
Ops.view=function(page){if(page==="rendicion")return rendicion();if(page==="cuadrilla")return cuadrilla();if(page==="seguridad")return backupView();return oldView(page);};
Ops.afterRender=afterRender;
async function action(action){
 if(action.startsWith("goto:")){G.changePage(action.slice(5));return;}
 if(action==="report-print"){reportPrint();return;}
 if(action==="report-csv"){exportReport();return;}
 if(action==="report-wsp"){ensureWspDraft(reportMessage(),"rendiciones");return;}
 if(action==="crew-save"){crewSave();return;}
 if(action==="crew-csv"){crewCsv();return;}
 if(action==="crew-mark-all"||action==="crew-unmark"){
  document.querySelectorAll(".field-attend").forEach(x=>x.checked=action==="crew-mark-all");
  G.notify(action==="crew-mark-all"?"Trabajadores seleccionados. Guarda para registrar.":"Selección retirada; los tareos guardados no se borran.");return;
 }
 if(action==="backup-full"){await makeFullBackup();return;}
 if(action==="restore-open"){document.getElementById("fieldRestoreFile")?.click();return;}
 if(action==="wsp-pendientes"){const el=document.getElementById("opsMessage");if(el){el.value=reminders();G.notify("Pendientes preparados para revisión antes de enviar.");}return;}
 if(action==="wsp-rendicion"){const el=document.getElementById("opsMessage");if(el){el.value=reportMessage();G.notify("Resumen financiero preparado para revisión.");}return;}
 if(action==="wsp-copy"){const txt=document.getElementById("opsMessage")?.value||"";if(!txt){G.notify("No hay un mensaje para copiar.",true);return;}
  try{await navigator.clipboard.writeText(txt);G.notify("Mensaje copiado al portapapeles.");}catch(err){G.notify("El navegador no permitió copiar; selecciona y copia el texto manualmente.",true);}
  return;
 }
}
document.addEventListener("click",function(ev){const el=ev.target.closest("[data-field]");if(!el)return;ev.preventDefault();action(el.dataset.field).catch?.(err=>G.notify(err.message,true));});
document.addEventListener("change",function(ev){
 const el=ev.target;
 if(["fieldObra","fieldDesde","fieldHasta"].includes(el.id)){filters.obra=document.getElementById("fieldObra")?.value||"";filters.desde=document.getElementById("fieldDesde")?.value||"";filters.hasta=document.getElementById("fieldHasta")?.value||"";G.render();}
 else if(["fieldCrewObra","fieldCrewFecha"].includes(el.id)){tareo.obra=document.getElementById("fieldCrewObra")?.value||"";tareo.fecha=document.getElementById("fieldCrewFecha")?.value||current();G.render();}
 else if(el.id==="fieldRestoreFile"){restoreFullBackup(el.files[0]);el.value="";}
 else if(el.classList?.contains("field-status")){const row=el.closest("tr"),hours=row?.querySelector(".field-hours");if(hours)hours.value=el.value==="Asistió"?"8":"0";}
});
if("serviceWorker" in navigator&&location.protocol==="https:"){
 window.addEventListener("load",function(){navigator.serviceWorker.register("./sw.js").catch(()=>{});});
}
G.render();
window.GFLMField={finance:finance,reportMessage:reportMessage,reminders:reminders,restoreFullBackup:restoreFullBackup,makeFullBackup:makeFullBackup};
})();
