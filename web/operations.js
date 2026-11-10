/* GFLM FIELD OPERATIONS · Web v4
   Centro de mando, WhatsApp asistido, captura rápida y evidencias locales.
   NO usa la API de WhatsApp, ni recibe mensajes automáticamente. */
(function(){
"use strict";
const A=window.GFLM;
if(!A)return;
const SKEY="gflm-ops-v4";
let state=loadState(),evidenceContext=null,quickSource="requerimientos",channel="requerimientos",lastDraft="",evidenceDbPromise=null;
function h(s){return A.esc(s==null?"":s);}
function money(x){return A.money(x);}
function number(x){return Number(String(x||"0").replace(",","."))||0;}
function date(){return A.today();}
function rows(k){return A.rowsProject(k);}
function get(k,id){return A.getRows(k).find(function(x){return String(x.id)===String(id);});}
function formatDate(s){if(!s)return "Sin fecha";const d=new Date(s+"T12:00:00");return Number.isNaN(d.getTime())?String(s):d.toLocaleDateString("es-PE",{day:"2-digit",month:"short",year:"numeric"});}
function loadState(){try{const o=JSON.parse(localStorage.getItem(SKEY)||"{}");return {phone:String(o.phone||""),messages:Array.isArray(o.messages)?o.messages.slice(0,80):[]};}catch(e){return {phone:"",messages:[]};}}
function saveState(){try{localStorage.setItem(SKEY,JSON.stringify(state));return true;}catch(e){A.notify("No se pudo guardar la configuración local",true);return false;}}
function badge(value,type){return '<span class="op-badge '+(type||"")+'">'+h(value)+'</span>';}
function button(action,label,more){return '<button type="button" class="op-button '+(more||"")+'" data-op="'+h(action)+'">'+label+'</button>';}
function lead(kicker,title,subtitle){return '<div class="ops-lead"><div><div class="ops-kicker">'+h(kicker)+'</div><h1>'+h(title)+'</h1><p>'+h(subtitle)+'</p></div><div class="ops-lead-actions">'+button("quick","✳ Captura rápida","strong")+button("whatsapp","◉ WhatsApp","")+'</div></div>';}
function pill(label,value,kind){return '<div class="ops-metric '+(kind||"")+'"><span>'+h(label)+'</span><strong>'+h(value)+'</strong></div>';}
function panel(title,over,content,cls){return '<section class="ops-panel '+(cls||"")+'"><div class="ops-panel-top"><div><span class="ops-eyebrow">'+h(over)+'</span><h2>'+h(title)+'</h2></div></div>'+content+'</section>';}
function status(r){if(r.estado_firma==="Verificado")return "Confirmado";if(["Foto recibida","Firmado en físico"].includes(r.estado_firma))return "Por verificar";return "Falta evidencia";}
function getRisks(){
const risks=[],p=A.project,now=date();
A.alerts().forEach(function(r){risks.push({score:120,label:r.label,meta:"Venció: "+formatDate(r.date)+" · "+(r.obra||r.module),type:"Vencido",module:r.module,id:r.id});});
rows("custodia").filter(function(r){return r.estado_firma!=="Verificado";}).forEach(function(r){risks.push({score:r.estado_firma==="Pendiente"?98:76,label:(r.equipo||"Equipo")+" · "+status(r),meta:(r.obra||"")+" · "+(r.destinatario||"Sin receptor"),type:"Acta",module:"custodia",id:r.id});});
rows("requerimientos").filter(function(r){return ["Cerrado","Entregado","Cancelado"].indexOf(r.estado)<0&&["Crítica","Urgente"].includes(r.prioridad);}).forEach(function(r){risks.push({score:r.prioridad==="Crítica"?110:70,label:r.detalle||"Requerimiento urgente",meta:(r.obra||"")+" · "+(r.prioridad||"Urgente")+" · "+(r.entrega?formatDate(r.entrega):"Sin fecha límite"),type:"Requerimiento",module:"requerimientos",id:r.id});});
rows("compras").filter(function(r){return r.tipo==="Factura pendiente"||r.estado==="Pendiente";}).forEach(function(r){risks.push({score:60,label:"Comprobante pendiente · "+r.concepto,meta:(r.proveedor||"")+" · "+money(r.total),type:"Factura",module:"compras",id:r.id});});
rows("cobros").filter(function(r){return !["Cobrado","Cancelado"].includes(r.estado)&&r.vencimiento&&r.vencimiento>=now;}).forEach(function(r){const delta=Math.ceil((new Date(r.vencimiento+"T12:00:00")-new Date(now+"T12:00:00"))/86400000);if(delta<=7)risks.push({score:65+(7-delta),label:"Por cobrar · "+(r.cliente||r.concepto),meta:money(r.monto)+" · "+formatDate(r.vencimiento),type:"Cobro próximo",module:"cobros",id:r.id});});
return risks.sort(function(a,b){return b.score-a.score;});
}
function activeCount(k){return rows(k).filter(function(r){return !["Cancelado","Cerrado","Devuelto","Cobrado","Verificado","Finalizada"].includes(r.estado);}).length;}
function dashboard(){
const cash=A.cash(),risk=getRisks(),pending=rows("requerimientos").filter(function(r){return !["Entregado","Cerrado","Cancelado"].includes(r.estado);});
const custody=rows("custodia").filter(function(r){return r.estado_firma!=="Verificado";});
const unpaid=rows("cobros").filter(function(r){return !["Cobrado","Cancelado"].includes(r.estado);}),receivable=unpaid.reduce(function(t,r){return t+number(r.monto)-number(r.retencion);},0);
const works=rows("obras"),latest=A.db.audit.slice(0,5);
let out='<div class="ops-dashboard">'+lead("GFLM · CONTROL DE OBRA","Tu obra, bajo control.","Decide qué atender primero. Cada alerta nace de tus propios registros.")+
'<div class="ops-site-line"><div class="ops-live-dot"></div><b>PANEL OPERATIVO</b><span>'+h(new Date().toLocaleDateString("es-PE",{weekday:"long",day:"numeric",month:"long"}))+'</span><span class="ops-flex"></span>'+badge("Información local · sin sincronización","warning")+'</div>';
out+='<div class="ops-top-grid">'+
'<div class="ops-money-card"><div class="ops-small-head">DINERO BAJO ADMINISTRACIÓN</div><div class="ops-money-number">'+h(money(cash.saldo))+'</div><p>Saldo de fondos de empresa por rendir</p><div class="ops-money-divider"></div><div class="ops-money-split"><div><small>Desembolsos propios</small><strong>'+h(money(cash.own))+'</strong></div><div><small>Por reembolsar</small><strong>'+h(money(cash.porReembolsar))+'</strong></div></div>'+button("add:caja","＋ Registrar movimiento","dark")+'</div>'+
'<div class="ops-stat-card"><div class="ops-big-icon">!</div><span>DECISIONES PENDIENTES</span><strong>'+h(String(risk.length))+'</strong><p>Alertas, requerimientos críticos y evidencias sin verificar</p>'+button("scroll:risks","Revisar prioridades →","light")+'</div>'+
'<div class="ops-stat-card"><div class="ops-big-icon">↗</div><span>VALORIZACIONES POR COBRAR</span><strong>'+h(money(receivable))+'</strong><p>'+h(String(unpaid.length))+' cobros sin cerrar · importes netos de retención</p>'+button("goto:cobros","Ver cuentas por cobrar →","light")+'</div>'+
'</div>';
out+='<div class="ops-rapid">'+
'<div><span class="ops-eyebrow">ACCESOS DE CAMPO</span><strong>Registra en segundos</strong></div>'+
button("add:requerimientos","☷ Requerimiento","chip")+
button("add:compras","▣ Comprobante","chip")+
button("add:almacen","▤ Ingreso / salida","chip")+
button("add:custodia","◎ Acta de entrega","chip")+
button("quick","✳ Texto de WhatsApp","chip")+
'</div>';
out+='<div class="ops-main-grid">';
let alertContent='<div class="ops-risk-list">';
if(risk.length){risk.slice(0,7).forEach(function(r,i){alertContent+='<div class="ops-risk"><div class="ops-risk-index">'+h(String(i+1).padStart(2,"0"))+'</div><div class="ops-risk-copy"><b>'+h(r.label)+'</b><small>'+h(r.meta)+'</small></div>'+badge(r.type,r.score>=95?"danger":"warm")+button("goto:"+r.module,"Revisar →","small")+'</div>';});}
else alertContent+='<div class="ops-blank"><b>Sin alertas críticas.</b><span>Los registros urgentes aparecerán aquí automáticamente.</span></div>';
alertContent+='</div>';
out+=panel("Prioridades que no deben esperar","BANDEJA DE CONTROL",alertContent,'ops-risk-panel')+'<div class="ops-side-panels">'+panel("Firma y conformidad","CONTROL DE EVIDENCIAS",
'<div class="ops-health-number">'+h(String(custody.length))+' <span>actas por verificar</span></div><p class="ops-desc">Entrega, devolución y estado físico de equipos con responsables identificados.</p><div class="ops-pillstrip">'+badge("Firmadas "+rows("custodia").filter(function(r){return r.estado_firma==="Verificado";}).length,"good")+badge("Sin verificar "+custody.length,"warm")+'</div>'+button("goto:custodia","Administrar actas →","light"),"")+
panel("WhatsApp de obra","UN SOLO NÚMERO · DOS FLUJOS",
'<p class="ops-desc">Requerimientos y rendiciones con plantillas preparadas para enviar. También puedes pegar mensajes y convertirlos en borradores.</p><div class="ops-chat-preview"><span>◉</span><div><b>Canal operativo listo</b><small>Sin conexión automática con Meta</small></div></div>'+button("whatsapp","Abrir centro de WhatsApp →","strong"),"")+'</div>';
out+='</div>';
let workContent='<div class="ops-work-grid">';
if(!works.length)workContent+='<div class="ops-blank">Todavía no hay obras creadas. '+button("add:obras","Crear primera obra →","small")+'</div>';
works.slice(0,5).forEach(function(w){const req=pending.filter(function(r){return r.obra===w.nombre;}).length,al=risk.filter(function(r){return r.meta.includes(w.nombre);}).length;workContent+='<div class="ops-work"><div class="ops-work-top"><span class="ops-work-dot"></span><b>'+h(w.nombre)+'</b>'+badge(w.estado||"Sin estado",w.estado==="Activa"?"good":"warm")+'</div><div class="ops-work-bottom"><span>'+h(w.ubicacion||"Sin ubicación")+'</span><strong>'+req+' solicitudes · '+al+' alertas</strong></div></div>';});
workContent+='</div>';
out+='<div class="ops-bottom-grid">'+panel("Pulso por obra","PROYECTOS ACTIVOS",workContent)+panel("Últimas acciones","TRAZABILIDAD LOCAL",
latest.length?'<div class="ops-timeline">'+latest.map(function(x){return '<div class="ops-timeline-row"><span class="ops-timeline-dot"></span><div><b>'+h(x.action)+" · "+h(x.summary)+'</b><small>'+h(new Date(x.at).toLocaleString("es-PE"))+'</small></div></div>';}).join("")+'</div>':'<div class="ops-blank">Todavía no se registran movimientos.</div>')+'</div>';
out+='<div class="ops-footnote">Piloto web: los registros se guardan en este navegador. No ingreses datos sensibles reales hasta activar usuarios, backend y respaldos centralizados.</div></div>';
return out;
}
function phoneNumber(input){let v=String(input||"").replace(/\D/g,"");if(v.length===9&&v[0]==="9")v="51"+v;return /^\d{10,15}$/.test(v)?v:"";}
function templates(){
 const req=rows("requerimientos").filter(function(r){return !["Cerrado","Cancelado"].includes(r.estado);});
 const cash=rows("caja").slice(-10).reverse();
 const a=channel==="requerimientos"?req:cash;
 return '<select id="opsRecord" class="ops-input"><option value="">Selecciona un registro (opcional)</option>'+a.map(function(r){return '<option value="'+h(r.id)+'">#'+h(r.id)+' · '+h(String(r.detalle||r.concepto||"").slice(0,85))+'</option>';}).join("")+'</select>';
}
function draftFor(type,recordId){
 const r=recordId?get(type==="requerimientos"?"requerimientos":"caja",recordId):null;
 if(type==="requerimientos"){
  if(r)return "REQUERIMIENTO DE OBRA\nObra: "+(r.obra||"Sin definir")+"\nPrioridad: "+(r.prioridad||"Normal")+"\nSolicitado por: "+(r.solicitante||"Por confirmar")+"\nFecha límite: "+(r.entrega||"Por confirmar")+"\nDetalle: "+(r.detalle||"")+"\nEstado: "+(r.estado||"Pendiente")+"\nRef.: REQ-"+r.id+"\nFavor confirmar atención y fecha de entrega.";
  return "REQUERIMIENTO DE OBRA\nObra: [nombre]\nMaterial o servicio: [detalle]\nCantidad: [cantidad]\nPrioridad: [normal / urgente / crítica]\nEntrega requerida: [fecha]\nFavor confirmar atención.";
 }
 if(r)return "RENDICIÓN / MOVIMIENTO\nFecha: "+(r.fecha||date())+"\nObra: "+(r.obra||"Sin definir")+"\nConcepto: "+(r.concepto||"")+"\nMonto: "+money(r.monto)+"\nTipo: "+(r.tipo||"")+"\nFondos: "+(r.cuenta||"")+"\nComprobante: "+(r.comprobante||"Pendiente de verificación")+"\nRef.: MOV-"+r.id+"\nSe adjuntará sustento por WhatsApp si corresponde.";
 const c=A.cash();
 return "RESUMEN DE RENDICIÓN\nFecha: "+date()+"\n"+(A.project?"Obra: "+A.project+"\n":"")+"Fondos recibidos: "+money(c.received)+"\nGastos con fondos empresa: "+money(c.company)+"\nGastos con dinero propio: "+money(c.own)+"\nReembolsos recibidos: "+money(c.refunded)+"\nSaldo de fondos: "+money(c.saldo)+"\nPendiente por reembolsar: "+money(c.porReembolsar)+"\nImportes sujetos a revisión de comprobantes.";
}
function messageLog(){
 if(!state.messages.length)return '<div class="ops-blank">Todavía no se prepararon mensajes desde este navegador.</div>';
 return '<div class="ops-message-list">'+state.messages.slice(0,12).map(function(m){return '<div class="ops-message-item"><div><b>'+h(m.channel==="requerimientos"?"Requerimiento":"Rendición")+'</b><small>'+h(new Date(m.at).toLocaleString("es-PE"))+' · '+h(m.status)+'</small><p>'+h(m.text.slice(0,105))+'</p></div><div class="ops-message-buttons">'+button("repeat:"+m.id,"Reabrir","small")+(m.status!=="Confirmado por usuario"?button("confirm:"+m.id,"Marcar enviado","small"):"")+'</div></div>';}).join("")+'</div>';
}
function whatsapp(){
 const configured=!!phoneNumber(state.phone);
 const template=draftFor(channel);
 const critical=rows("requerimientos").filter(function(r){return r.prioridad==="Crítica"&&!["Cerrado","Entregado"].includes(r.estado);}).length;
 return '<div class="ops-whats">'+lead("GFLM · COMUNICACIONES","WhatsApp de obra.","Un único número Business para dos flujos: requerimientos y rendiciones.")+
'<div class="ops-safety"><b>Modo asistido:</b> la web prepara mensajes y abre WhatsApp para que tú confirmes el envío. No lee chats, no recibe mensajes automáticamente y no envía recordatorios sin intervención. Para automatizarlo necesitaremos Meta WhatsApp Cloud API, webhook y base de datos segura.</div>'+
'<div class="ops-whats-layout"><div class="ops-whats-primary">'+
'<div class="ops-panel ops-config"><div class="ops-panel-top"><div><span class="ops-eyebrow">CONFIGURACIÓN · UN SOLO CANAL</span><h2>Tu número de WhatsApp Business</h2></div>'+badge(configured?"Configurado":"Sin configurar",configured?"good":"warm")+'</div><div class="ops-form-line"><label for="opsPhone">Número destinatario de los mensajes <small>Perú: 9 dígitos o código 51. Se guarda solo en este navegador.</small></label><div class="ops-inline"><input type="tel" class="ops-input" id="opsPhone" placeholder="Ej.: 9XXXXXXXX" value="'+h(state.phone)+'">'+button("save-phone","Guardar número","strong")+'</div></div></div>'+
'<div class="ops-panel ops-composer"><div class="ops-panel-top"><div><span class="ops-eyebrow">MENSAJE OPERATIVO</span><h2>Preparar comunicación</h2></div></div><div class="ops-tabs"><button class="'+(channel==="requerimientos"?"chosen":"")+'" data-op="channel:requerimientos">☷ Requerimientos '+(critical?'('+critical+' críticos)':'')+'</button><button class="'+(channel==="rendiciones"?"chosen":"")+'" data-op="channel:rendiciones">S/ Rendiciones</button></div><div class="ops-composer-inner"><label>Usar datos de un registro</label>'+templates()+'<label for="opsMessage">Mensaje editable para WhatsApp</label><textarea id="opsMessage" class="ops-input ops-text" rows="10">'+h(lastDraft||template)+'</textarea><div class="ops-compose-bottom"><span>Se abrirá WhatsApp. Debes pulsar «Enviar» dentro de WhatsApp.</span>'+button("send-whatsapp","◉ Abrir WhatsApp","strong")+'</div></div></div>'+
'</div><div class="ops-whats-secondary">'+
panel("Captura desde un chat","PEGAR · ANALIZAR · CONFIRMAR",'<p class="ops-desc">Copia un mensaje de WhatsApp, por ejemplo: «Gasté S/250 en flete, factura pendiente» o «Necesito 30 bolsas de cemento para mañana».</p><textarea id="opsPaste" class="ops-input ops-text" rows="5" placeholder="Pega aquí el mensaje..."></textarea>'+button("parse","Analizar y preparar registro →","strong")+'<div id="opsParsed" class="ops-parsed"></div>',"")+
panel("Historial de apertura","CONTROL MANUAL",messageLog(),"")+
'</div></div></div>';
}
function capture(text){
 const value=String(text||"").trim();if(!value)return {error:"Escribe o pega primero un mensaje."};
 let amountMatch=value.match(/(?:s\/\s*|soles?\s*)(\d[\d.,]*)/i)||value.match(/(\d[\d.,]*)\s*(?:soles?|s\/)/i);
 let amount=amountMatch?Number(amountMatch[1].replace(/,(?=\d{3}(?:\D|$))/g,"").replace(",",".")):0;
 const isCash=/gast[eé]|pag[ué]|deposit|compra realizada|reembols|rendici[oó]n|factura pendiente|boleta pendiente/i.test(value)&&amount>0;
 const obra=A.project||(A.getRows("obras")[0]?.nombre||"");
 if(isCash)return {module:"caja",data:{fecha:date(),obra:obra,tipo:/deposit|recib[ií]/i.test(value)?"Ingreso empresa":"Gasto",categoria:/flete|movilidad/i.test(value)?"Transporte":/aliment|almuerz|cena/i.test(value)?"Alimentación":/combustible|diesel|gasolina/i.test(value)?"Combustible":"Gastos de obra",concepto:value,monto:String(amount),cuenta:"Cuenta personal · fondo empresa",comprobante:/factura pendiente/i.test(value)?"Factura pendiente":/boleta/i.test(value)?"Boleta":/factura/i.test(value)?"Factura":"Sin comprobante"}};
 const req=/necesit|solicito|solicitamos|requier|urgente|cemento|bolsas|equipos|alquilar|compra|maquinaria|enviar/i.test(value);
 if(req)return {module:"requerimientos",data:{fecha:date(),obra:obra,detalle:value,prioridad:/urgente|hoy|cr[ií]tic/i.test(value)?"Crítica":"Normal",estado:"Pendiente",entrega:/mañana/i.test(value)?addDays(date(),1):/hoy/i.test(value)?date():""}};
 return {error:"No se identificó claramente el tipo de solicitud. Incluye palabras como «necesito» o «gasté S/250»."};
}
function addDays(d,n){const o=new Date(d+"T12:00:00");o.setDate(o.getDate()+n);return o.toISOString().slice(0,10);}
function openQuick(){
 if(document.getElementById("opsOverlay"))return;
 const div=document.createElement("div");div.className="ops-overlay";div.id="opsOverlay";div.innerHTML='<div class="ops-quick-dialog" role="dialog" aria-modal="true" aria-label="Captura rápida"><div class="ops-quick-top"><span class="ops-eyebrow">CAPTURA OPERATIVA</span>'+button("close-overlay","✕","small")+'</div><h2>De mensaje a registro.</h2><p>Pega o escribe una instrucción como si la enviaras por WhatsApp. Verás un borrador antes de guardarlo.</p><textarea class="ops-input ops-text" id="opsQuickText" rows="5" placeholder="Ej.: Necesito 40 bolsas de cemento para mañana / Gasté S/180 en flete, factura pendiente"></textarea><div class="ops-quick-footer">'+button("quick-parse","Preparar registro →","strong")+'</div><div id="opsQuickResult"></div></div>';document.body.appendChild(div);div.addEventListener("click",function(e){if(e.target===div)div.remove();});document.getElementById("opsQuickText").focus();
}
function displayCapture(parsed,where){const el=document.getElementById(where);if(!el)return;if(parsed.error){el.innerHTML='<div class="ops-error">'+h(parsed.error)+'</div>';return;}let typ=parsed.module==="caja"?"GASTO / INGRESO":"REQUERIMIENTO";el.innerHTML='<div class="ops-capture-result"><b>✓ Borrador detectado · '+h(typ)+'</b><p>'+h(parsed.data.concepto||parsed.data.detalle)+'</p>'+button("save-draft:"+parsed.module,"Revisar y guardar →","strong")+'</div>';window._gflmPendingCapture=parsed;}
function markMessage(id){const m=state.messages.find(function(x){return String(x.id)===String(id);});if(!m)return;m.status="Confirmado por usuario";saveState();A.render();A.notify("Confirmación manual registrada en este navegador.");}
function sendWhatsApp(){
 const number=phoneNumber(state.phone),input=document.getElementById("opsMessage"),value=input?.value.trim()||"";
 if(!number){A.notify("Primero guarda un número Business válido (9 dígitos Perú o formato internacional).",true);document.getElementById("opsPhone")?.focus();return;}
 if(!value){A.notify("Escribe el mensaje antes de abrir WhatsApp.",true);return;}
 const href="https://wa.me/"+number+"?text="+encodeURIComponent(value);
 const win=window.open(href,"_blank");
 if(win)win.opener=null;
 if(!win){A.notify("Permite las ventanas emergentes para abrir WhatsApp.",true);return;}
 state.messages.unshift({id:Date.now().toString(36),channel:channel,text:value,at:new Date().toISOString(),status:"Enlace abierto · sin confirmar"});
 state.messages=state.messages.slice(0,80);saveState();A.render();A.notify("WhatsApp abierto. Confirma el envío dentro del chat.");
}
function openRepeat(id){const m=state.messages.find(function(x){return String(x.id)===String(id);});if(!m)return;channel=m.channel;lastDraft=m.text;A.changePage("whatsapp");}
function recordsAction(module,id){const r=get(module,id);if(!r)return;channel=module==="caja"?"rendiciones":"requerimientos";lastDraft=draftFor(channel,module==="caja"?id:id);A.changePage("whatsapp");}
function doAction(op){
 if(op==="quick"){openQuick();return;}
 if(op==="whatsapp"){lastDraft="";A.changePage("whatsapp");return;}
 if(op.startsWith("goto:")){A.changePage(op.slice(5));return;}
 if(op.startsWith("add:")){const mod=op.slice(4);A.changePage(mod);A.showForm(mod);return;}
 if(op==="scroll:risks"){document.querySelector(".ops-risk-panel")?.scrollIntoView({behavior:"smooth"});return;}
 if(op==="save-phone"){state.phone=document.getElementById("opsPhone")?.value.trim()||"";if(!phoneNumber(state.phone)){A.notify("Ingresa un número válido: Perú 9 dígitos o con código 51.",true);return;}saveState();lastDraft=document.getElementById("opsMessage")?.value||"";A.render();A.notify("Número guardado en este navegador.");return;}
 if(op.startsWith("channel:")){channel=op.slice(8);lastDraft="";A.render();return;}
 if(op==="send-whatsapp"){sendWhatsApp();return;}
 if(op==="parse"||op==="quick-parse"){const txt=document.getElementById(op==="parse"?"opsPaste":"opsQuickText")?.value||"";displayCapture(capture(txt),op==="parse"?"opsParsed":"opsQuickResult");return;}
 if(op.startsWith("save-draft:")){const parsed=window._gflmPendingCapture;if(!parsed||parsed.module!==op.slice(11)){A.notify("El borrador ya no está disponible.",true);return;}document.getElementById("opsOverlay")?.remove();A.changePage(parsed.module);A.showForm(parsed.module,null,parsed.data);return;}
 if(op.startsWith("repeat:")){openRepeat(op.slice(7));return;}
 if(op.startsWith("confirm:")){markMessage(op.slice(8));return;}
 if(op.startsWith("wsp-record:")){const bits=op.slice(11).split(":");recordsAction(bits[0],bits[1]);return;}
 if(op==="close-overlay"){document.getElementById("opsOverlay")?.remove();return;}
}
function afterRender(page){
 const nav=document.getElementById("navigation");const logo=document.querySelector(".brand small");if(logo)logo.textContent="FIELD OPERATIONS / PERÚ";
 if(page!=="dashboard"&&page!=="whatsapp"&&page!=="auditoria"){
 const table=document.querySelector(".data-table");if(table&&["requerimientos","caja"].includes(page)){table.querySelectorAll("tbody tr").forEach(function(tr){const id=tr.querySelector("td")?.textContent?.trim().replace("#","");if(!id||!get(page,id))return;const actions=tr.querySelector(".actions");if(actions){const b=document.createElement("button");b.className="table-inline-btn";b.type="button";b.dataset.op="wsp-record:"+page+":"+id;b.textContent="WhatsApp";actions.prepend(b);}});}
 const view=document.getElementById("view");
 if(page==="custodia"){const pending=rows("custodia").filter(function(r){return r.estado_firma!=="Verificado";}),missing=rows("custodia").reduce(function(t,r){return t+number(r.faltante);},0);view.insertAdjacentHTML("afterbegin",'<div class="ops-module-banner"><div><span class="ops-eyebrow">SEGURIDAD DOCUMENTAL</span><b>¿Quién entregó? ¿Quién recibió? ¿En qué estado?</b><small>Las actas imprimibles incluyen espacios para firmas físicas; las evidencias quedan solo en este navegador.</small></div>'+pill("Actas por verificar",pending.length,"danger")+pill("Unidades observadas",missing,"warm")+'</div>');}
 if(page==="cobros"){const open=rows("cobros").filter(function(r){return !["Cobrado","Cancelado"].includes(r.estado);}),gross=open.reduce(function(t,r){return t+number(r.monto);},0),ret=open.reduce(function(t,r){return t+number(r.retencion);},0);view.insertAdjacentHTML("afterbegin",'<div class="ops-module-banner"><div><span class="ops-eyebrow">FLUJO DE COBRANZA</span><b>Valorizaciones por cobrar</b><small>Monitorea facturación, retenciones y vencimientos comprometidos.</small></div>'+pill("Pendiente bruto",money(gross))+pill("Retención",money(ret),"warm")+pill("Pendiente neto",money(gross-ret),"good")+'</div>');}
 if(page==="mantenimiento"){const gal=rows("mantenimiento").reduce(function(t,r){return t+number(r.galones);},0),cost=rows("mantenimiento").reduce(function(t,r){return t+number(r.costo);},0);view.insertAdjacentHTML("afterbegin",'<div class="ops-module-banner"><div><span class="ops-eyebrow">EQUIPOS Y SUMINISTROS</span><b>Consumo registrado, no estimado</b><small>Controla lecturas de horómetro, abastecimiento y mantenimientos.</small></div>'+pill("Galones",gal.toFixed(1))+pill("Costo total",money(cost))+'</div>');}
 }
}
function view(page){if(page==="dashboard")return dashboard();if(page==="whatsapp")return whatsapp();return null;}
document.addEventListener("click",function(e){const el=e.target.closest("[data-op]");if(el){e.preventDefault();doAction(el.dataset.op);return;}const ev=e.target.closest("[data-evidence]");if(ev){e.preventDefault();const [module,id]=ev.dataset.evidence.split(":");openEvidence(module,id);}});
document.addEventListener("change",function(e){if(e.target.id==="opsRecord"){const id=e.target.value;const msg=draftFor(channel,id);const txt=document.getElementById("opsMessage");if(txt)txt.value=msg;lastDraft=msg;}});
document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openQuick();}if(e.key==="Escape")document.getElementById("opsOverlay")?.remove();});
/* Archivo local de evidencias en IndexedDB; independiente del respaldo JSON */
function evidenceDb(){
 if(evidenceDbPromise)return evidenceDbPromise;
 evidenceDbPromise=new Promise(function(resolve,reject){
 if(!window.indexedDB){reject(Error("Este navegador no admite almacenamiento local de archivos"));return;}
 const request=indexedDB.open("gflm-evidencias-local-v1",1);
 request.onupgradeneeded=function(){const db=request.result;const store=db.createObjectStore("files",{keyPath:"id",autoIncrement:true});store.createIndex("record","record",{unique:false});};
 request.onsuccess=function(){resolve(request.result);};request.onerror=function(){reject(request.error||Error("No se pudo abrir IndexedDB"));};
 });
 return evidenceDbPromise;
}
async function putEvidence(module,id,file){
 if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type))throw Error("Solo se aceptan JPG, PNG, WebP o PDF.");
 if(file.size>8*1024*1024)throw Error("El archivo supera 8 MB. Reduce la imagen antes de adjuntarla.");
 const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer()),hash=Array.from(new Uint8Array(digest),function(b){return b.toString(16).padStart(2,"0");}).join("");
 const db=await evidenceDb();
 await new Promise(function(resolve,reject){const tx=db.transaction("files","readwrite");tx.objectStore("files").add({record:module+":"+id,module:module,recordId:id,name:file.name||"foto_camara",type:file.type,size:file.size,hash:hash,at:new Date().toISOString(),file:file});tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error||Error("No se pudo almacenar archivo"));};tx.onabort=function(){reject(Error("El almacenamiento fue cancelado"));};});
 const record=get(module,id);if(record)A.saveAudit("ADJUNTAR ARCHIVO LOCAL",module,record);
 return hash;
}
async function listEvidence(module,id){const db=await evidenceDb();return new Promise(function(resolve,reject){const tx=db.transaction("files","readonly");const req=tx.objectStore("files").index("record").getAll(module+":"+id);req.onsuccess=function(){resolve(req.result||[]);};req.onerror=function(){reject(req.error);};});}
async function findEvidence(fid){const db=await evidenceDb();return new Promise(function(resolve,reject){const tx=db.transaction("files","readonly");const req=tx.objectStore("files").get(Number(fid));req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error);};});}
async function openEvidence(module,id){
 const r=get(module,id);if(!r)return;
 evidenceContext={module:module,id:id};
 document.getElementById("opsEvidenceLayer")?.remove();
 const box=document.createElement("div");box.id="opsEvidenceLayer";box.className="ops-overlay";box.innerHTML='<div class="ops-quick-dialog ops-evidence-dialog" role="dialog" aria-modal="true" aria-label="Evidencias"><div class="ops-quick-top"><span class="ops-eyebrow">ARCHIVO LOCAL · REGISTRO '+h(id)+'</span>'+button("close-evidence","✕","small")+'</div><h2>Evidencia de '+h(module)+'</h2><p>Adjunta una fotografía del documento firmado o un PDF. Quedará solamente en este navegador; no se sincroniza ni se incluye en el respaldo JSON. Descarga copias por separado.</p><div class="ops-evidence-actions"><label class="op-button strong" for="opsAttach">＋ Adjuntar foto o PDF</label><input id="opsAttach" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden><label class="op-button" for="opsCamera">📷 Usar cámara</label><input id="opsCamera" type="file" accept="image/*" capture="environment" hidden></div><div id="opsEvidenceList" class="ops-evidence-list">Cargando...</div></div>';
 document.body.appendChild(box);box.addEventListener("click",function(e){if(e.target===box)box.remove();});
 async function upload(f){if(!f)return;try{await putEvidence(module,id,f);await renderEvidence();A.notify("Evidencia guardada localmente. Guarda copia externa para protegerla.");}catch(e){A.notify(e.message||"Error al guardar evidencia",true);}}
 box.querySelector("#opsAttach").addEventListener("change",function(e){upload(e.target.files[0]);e.target.value="";});
 box.querySelector("#opsCamera").addEventListener("change",function(e){upload(e.target.files[0]);e.target.value="";});
 await renderEvidence();
 async function renderEvidence(){const l=document.getElementById("opsEvidenceList");if(!l)return;try{const files=await listEvidence(module,id);l.innerHTML=files.length?files.map(function(x){return '<div class="ops-file"><div><b>'+h(x.name)+'</b><small>'+h(new Date(x.at).toLocaleString("es-PE"))+" · "+h((x.size/1024).toFixed(0))+' KB · SHA-256: '+h(x.hash.slice(0,14))+'…</small></div>'+button("download-file:"+x.id,"Descargar","small")+'</div>';}).join(""):'<div class="ops-blank">Todavía no hay archivos para este registro.</div>';}catch(e){l.innerHTML='<div class="ops-error">'+h(e.message)+'</div>';}}
}
document.addEventListener("click",async function(e){const el=e.target.closest("[data-op]");if(!el)return;const op=el.dataset.op;if(op==="close-evidence"){document.getElementById("opsEvidenceLayer")?.remove();return;}if(op.startsWith("download-file:")){try{const file=await findEvidence(op.slice(14));if(!file)throw Error("No se encontró el adjunto");const url=URL.createObjectURL(file.file),a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},5000);}catch(err){A.notify(err.message||"No se pudo descargar",true);}}});
window.GFLMOps={view:view,afterRender:afterRender,capture:capture,phoneNumber:phoneNumber};
A.render();
})();