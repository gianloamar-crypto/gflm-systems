import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {weekdayReport, fuelCycles, stationRanking} from './analytics.mjs';
const ready=Boolean(SUPABASE_URL&&SUPABASE_PUBLISHABLE_KEY);const currency=n=>'S/ '+Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});const fmt=n=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:2});const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});const $=s=>document.querySelector(s);const root=$('#root');
let sb=null,user=null,demo=false,db={profiles:[],vehicles:[],shifts:[],movements:[],fuel:[],goals:[],maintenance:[]},page='inicio',range='30';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toNum=v=>Math.round((Number(v)||0)*100)/100;
const dateStr=s=>String(s||'').slice(0,10);
function filterDate(d){let days=Number(range);if(!days)return true;let delta=(new Date(today()+'T12:00:00')-new Date(dateStr(d)+'T12:00:00'))/86400000;return delta>=0&&delta<days}
function account(){return user?.email||'Usuario'}
async function init(){if(ready){try{const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});const {data}=await sb.auth.getUser();user=data.user;sb.auth.onAuthStateChange((_evt,session)=>{const id=session?.user?.id;if(id!==user?.id){user=session?.user||null;setTimeout(()=>refresh(),0)}})}catch(e){root.innerHTML='<div class="auth">No se pudo iniciar la conexión: '+esc(e.message)+'</div>';return}}await refresh()}
async function refresh(){if(user&&sb&&!demo){const tables=Object.keys(db);const results=await Promise.all(tables.map(t=>sb.from(t).select('*').eq('user_id',user.id).order('created_at',{ascending:false})));results.forEach((r,i)=>{if(r.error){console.error(tables[i],r.error.message);db[tables[i]]=[]}else db[tables[i]]=r.data||[]})}render()}
function loginView(){root.innerHTML=`<main class="auth"><div class="brand">🚘 Mi Ruta <b>PRO</b></div><h1>Tu control, tu ganancia</h1><p class="muted">Tus kilómetros, ingresos, gastos y metas en un solo lugar. Cada conductor tiene su cuenta privada.</p>${!ready?'<div class="notice"><b>Cuenta real pendiente:</b> aún falta conectar un proyecto Supabase independiente. El registro permanecerá cerrado hasta configurar la base de datos y la seguridad. Consulta README.md.</div>':''}<form id="authform"><label>Correo electrónico</label><input name="email" type="email" autocomplete="username" required/><label>Contraseña</label><input name="password" type="password" minlength="6" autocomplete="current-password" required/><div class="actions" style="margin-top:20px"><button class="btn" type="submit" ${!ready?'disabled':''}>Iniciar sesión</button><button class="btn secondary" id="signup" type="button" ${!ready?'disabled':''}>Crear cuenta</button></div><p class="help" id="authstatus">${ready?'También puedes crear una cuenta nueva usando tu correo.':'El registro estará disponible cuando se conecte la base de datos.'}</p></form><button id="demo-start" class="btn secondary demo-start" type="button">👀 Ver demostración (sin cuenta)</button></main>`;$('#demo-start').onclick=()=>{demo=true;user={id:'demostracion',email:'Demostración · sin datos reales'};db=seedDemo();page='inicio';render()};$('#authform').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});$('#authstatus').textContent=error?error.message:'Acceso correcto';if(!error)await refresh()};$('#signup').onclick=async()=>{const f=new FormData($('#authform'));const {error}=await sb.auth.signUp({email:f.get('email'),password:f.get('password')});$('#authstatus').textContent=error?error.message:'Revisa tu correo para confirmar el registro si la verificación está activada.'}}
const pages=[['inicio','▦','Inicio'],['cierre','✓','Cierre rápido'],['jornadas','🚘','Jornadas'],['movimientos','💳','Movimientos'],['combustible','⛽','Combustible'],['analisis','📊','Análisis de días'],['metas','🎯','Metas'],['mantenimiento','🔧','Mantenimiento'],['configuracion','⚙️','Mi vehículo']];
function shell(){root.innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand">🚘 Mi Ruta <b>PRO</b></div>${pages.map(([p,ico,label])=>`<button data-page="${p}" class="menu ${page===p?'active':''}">${ico} ${label}</button>`).join('')}</aside><main class="main"><header class="top"><div><h1 id="heading">${esc(pages.find(x=>x[0]===page)?.[2])}</h1><p class="muted">${demo?'🧪 Modo demostración · Datos ficticios, no se guardan':'🔒 '+esc(account())+' · Datos privados de tu cuenta'}</p></div><div class="actions"><select id="range" aria-label="Período"><option value="7">7 días</option><option value="30">30 días</option><option value="90">90 días</option><option value="0">Todo</option></select><button id="signout" class="btn secondary">Salir</button></div></header><div id="content"></div><footer class="foot">Mi Ruta PRO · GFLM Systems · Tu control, tu ganancia</footer></main></div>`;$('#range').value=range;$('#range').onchange=e=>{range=e.target.value;render()};$('#signout').onclick=async()=>{if(demo){demo=false;user=null;db={profiles:[],vehicles:[],shifts:[],movements:[],fuel:[],goals:[],maintenance:[]}}else await sb.auth.signOut();user=null;render()};document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render()})}
const field=(label,name,type='text',extra='')=>`<div><label>${label}</label><input name="${name}" type="${type}" ${extra}/></div>`;
const sel=(label,name,arr)=>`<div><label>${label}</label><select name="${name}">${arr.map(a=>`<option>${esc(a)}</option>`).join('')}</select></div>`;
const form=(id,body,button='Guardar')=>`<form id="${id}" class="fields">${body}<div class="wide"><button class="btn" type="submit">${button}</button></div><p class="help wide" id="status"></p></form>`;
const dataRows=(items,cols,delTable)=>`<div class="scroll"><table><thead><tr>${cols.map(x=>`<th>${x[0]}</th>`).join('')}<th></th></tr></thead><tbody>${items.length?items.slice(0,80).map(r=>`<tr>${cols.map(x=>`<td>${esc(x[1](r))}</td>`).join('')}<td><button class="btn danger" data-delete="${delTable}:${r.id}">Eliminar</button></td></tr>`).join(''):`<tr><td colspan="${cols.length+1}" class="empty">Sin registros reales todavía</td></tr>`}</tbody></table></div>`;
function wireDeletes(){document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const [t,id]=b.dataset.delete.split(':');if(t==='shifts'){const ordered=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)));if(ordered[0]?.id!==id){alert('Para proteger la secuencia del odómetro, elimina primero las jornadas posteriores.');return}}if(!confirm('¿Eliminar este registro?'))return;if(demo){db[t]=db[t].filter(r=>r.id!==id);render();return}const {error}=await sb.from(t).delete().eq('id',id).eq('user_id',user.id);if(error)alert(error.message);else await refresh()})}
function userCar(){return db.vehicles[0]||null}
function moneyFor(d){const relevant=db.movements.filter(m=>dateStr(m.date)===d);return relevant.reduce((a,m)=>a+(m.kind==='ingreso'?Number(m.amount):0),0)}
function costsFor(d){return db.movements.filter(m=>dateStr(m.date)===d&&m.kind==='gasto_operativo').reduce((a,m)=>a+Number(m.amount),0)+db.fuel.filter(f=>dateStr(f.date)===d).reduce((a,f)=>a+Number(f.amount),0)}
function summary(){const moves=db.movements.filter(m=>filterDate(m.date)),fuel=db.fuel.filter(f=>filterDate(f.date)),shifts=db.shifts.filter(s=>filterDate(s.date));let income=moves.filter(m=>m.kind==='ingreso').reduce((a,m)=>a+Number(m.amount),0),cost=moves.filter(m=>m.kind==='gasto_operativo').reduce((a,m)=>a+Number(m.amount),0)+fuel.reduce((a,f)=>a+Number(f.amount),0),personal=moves.filter(m=>m.kind==='gasto_personal').reduce((a,m)=>a+Number(m.amount),0),reloads=moves.filter(m=>m.kind==='recarga_app').reduce((a,m)=>a+Number(m.amount),0),km=shifts.reduce((a,s)=>a+Number(s.km_total),0),work=shifts.reduce((a,s)=>a+Number(s.km_work),0);return {income,cost,net:income-cost,personal,reloads,km,work,privateKm:km-work,shifts:shifts.length}}
function dashboard(){
  const s=summary();
  return `<section class="panel welcome"><div><p class="eyebrow">MI RUTA PRO · INTELLIGENCE</p><h2>Tu jornada, en orden y sin complicaciones.</h2><p>Registra una sola vez al terminar el día. Nosotros hacemos el análisis.</p></div><button class="btn big" data-go="cierre">✅ Cerrar mi día</button></section>
  <div class="cards">${[['Ingresos de trabajo',currency(s.income)],['Saldo neto operativo',currency(s.net)],['Costos operativos',currency(s.cost)],['Flujo después de salidas personales',currency(s.net-s.personal-s.reloads)]].map(([l,v])=>`<div class="card"><small>${l}</small><strong>${v}</strong></div>`).join('')}</div>
  <div class="cards">${[['Km totales',fmt(s.km)],['Km de trabajo',fmt(s.work)],['Km personales',fmt(s.privateKm)],['Saldo / km de trabajo',s.work?currency(s.net/s.work):'—']].map(([l,v])=>`<div class="card"><small>${l}</small><strong>${v}</strong></div>`).join('')}</div>
  <div class="split"><section class="panel"><h2>📊 ¿Qué día te deja mejor saldo?</h2>${weekdayAnalysis(true)}</section>
  <section class="panel"><h2>⛽ Grifos de GLP</h2>${gasStations(true)}<div class="actions"><button class="btn secondary" data-go="combustible">Ver grifos y recargas</button></div><hr class="sep"><p>🎯 Jornadas cerradas: <b>${s.shifts}</b></p><p class="help">La recarga de la billetera de una app no es gasto. Los pagos personales se separan de los costos del trabajo.</p></section></div>`;
}
function weekdayData(){return weekdayReport({shifts:db.shifts,movements:db.movements,fuel:db.fuel,includes:filterDate})}
function weekdayAnalysis(compact=false){
 const {rows,top,workedDays,unassignedMovementDays}=weekdayData();
 const max=Math.max(1,...rows.map(x=>Math.abs(x.average??0)));
 const enough=rows.filter(x=>x.count>=3);
 const stable=enough.length>=2?enough.reduce((p,c)=>c.average>p.average?c:p):null;
 return `${top?`<p>Mayor saldo neto promedio por jornada: <b class="green">${top.day} · ${currency(top.average)}</b> <span class="tag">${top.count} jornada(s)</span></p>`:'<div class="notice">Aún no hay jornadas cerradas para analizar. No inventaremos resultados.</div>'}
 <div class="bars">${rows.map(x=>`<div class="barwrap"><span class="barvalue">${x.count?currency(x.average):'—'}</span><div class="bar ${x.average<0?'neg':''}" style="height:${x.count?Math.max(2,160*Math.abs(x.average)/max):2}px"></div><span class="barlabel">${x.day.slice(0,3)}</span></div>`).join('')}</div>
 ${stable?`<p class="insight">💡 Entre los días con al menos 3 jornadas registradas, <b>${stable.day}</b> tiene el mayor promedio (${currency(stable.average)}). Es una tendencia de tus cierres diarios, no una garantía.</p>`:workedDays?'<p class="help">Las comparaciones son preliminares. Recomendaremos días cuando al menos dos días de la semana tengan 3 jornadas registradas cada uno.</p>':''}
 ${compact?'<p class="help">Se compara el saldo neto medio de jornadas cerradas, no ingresos por hora.</p>':`<div class="scroll"><table><thead><tr><th>Día</th><th>Jornadas</th><th>Ingresos</th><th>Pagos operativos</th><th>Saldo total</th><th>Promedio/jornada</th><th>Saldo/km trabajo</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.day}</td><td>${x.count}</td><td>${currency(x.income)}</td><td>${currency(x.costs)}</td><td>${currency(x.net)}</td><td>${x.count?currency(x.average):'—'}</td><td>${x.netPerKm!=null?currency(x.netPerKm):'—'}</td></tr>`).join('')}</tbody></table></div>
 <p class="help">Se utiliza una jornada por fecha de cierre; los días sin registro NO son cero. Los gastos personales y las recargas de saldo no reducen el resultado. Los pagos del combustible afectan el día de la recarga, aunque el consumo haya ocurrido en otros días. ${unassignedMovementDays?`Hay ${unassignedMovementDays} fecha(s) con movimientos o recargas sin jornada; no se usan en esta comparación.`:''}</p>`}`;
}
function stationsList(){return `<datalist id="grifo-list">${[...new Set(db.fuel.map(f=>String(f.station||'').trim()).filter(Boolean))].slice(0,25).map(s=>`<option value="${esc(s)}"></option>`).join('')}</datalist>`}
function quickClose(){
 const car=userCar();const last=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)))[0];
 const baseline=Number(last?.odometer_end??car?.odometer_initial??0);
 if(!car)return `<section class="panel"><h2>✅ Cierre rápido</h2><p>Primero registra tu vehículo y el odómetro de partida, solo una vez.</p><button class="btn" data-go="configuracion">Configurar mi vehículo</button></section>`;
 const nextDay=last?dateStr(new Date(new Date(dateStr(last.date)+'T12:00:00Z').getTime()+86400000).toISOString()):today();
 return `<section class="panel quick-panel"><div class="charttitle"><div><h2>✅ Cerrar mi jornada</h2><p class="muted">Un registro al finalizar el día. Sin anotar ingresos por hora.</p></div><span class="tag">1 minuto</span></div>
 <form id="quickform" class="fields">
  ${field('Fecha de jornada','date','date',`value="${today()<nextDay?nextDay:today()}" min="${nextDay}" required`)}
  ${field('Odómetro final (km)','odometer_end','number',`step="0.1" min="${baseline}" placeholder="Lectura actual" required`)}
  ${field('Kilómetros de trabajo (km)','km_work','number','step="0.1" min="0" placeholder="Ej. 80" required')}
  ${field('Ingreso total del día (S/)','income','number','step="0.01" min="0" value="0" required')}
  <div class="wide live-preview" id="quickpreview">Lectura anterior: ${fmt(baseline)} km · Calcularemos automáticamente los km personales.</div>
  <details class="wide extras"><summary>➕ Añadir gastos del día (opcional)</summary><div class="fields">
    ${field('Otros gastos del trabajo, sin combustible (S/)','operating','number','step="0.01" min="0" value="0"')}
    ${field('Gastos personales (S/)','personal','number','step="0.01" min="0" value="0"')}
    ${field('Recargas de saldo de apps (S/) · no es gasto','wallet','number','step="0.01" min="0" value="0"')}
  </div></details>
  <details class="wide extras" id="fuel-details"><summary>⛽ Hoy cargué combustible (opcional)</summary><div class="fields">
    ${sel('Tipo de combustible','fuel_type',['GLP','Gasolina','GNV'])}
    ${field('¿En qué grifo?','station','text','list="grifo-list" placeholder="Nombre del grifo"')}
    ${field('Importe pagado S/','fuel_amount','number','step="0.01" min="0.01"')}
    ${field('Litros GLP/gasolina o m³ GNV','fuel_quantity','number','step="0.001" min="0.001"')}
    ${field('Odómetro al cargar (no al cerrar)','fuel_odometer','number',`step="0.1" min="${baseline}" placeholder="Lectura al abastecer"`)}
    ${sel('¿Llenaste el tanque?','fuel_full',['Sí','No'])}
    ${sel('¿Desde el llenado anterior usaste SOLO este combustible?','fuel_exclusive',['No','Sí'])}
    <p class="help wide">El grifo queda en tu historial. Para comparar rendimientos de GLP, marca «Sí» únicamente si desde el llenado anterior no usaste gasolina ni otro combustible.</p>
  </div></details>
  ${stationsList()}
  <div class="wide quick-total" id="quicktotal">Saldo operativo estimado del día: <strong>${currency(0)}</strong></div>
  <div class="wide"><button type="submit" class="btn big submit-day" ${demo?'':' '} >💾 Guardar cierre del día</button><p class="help" id="status">El combustible se registra aquí una sola vez; no lo repitas en Movimientos. ${demo?'Demostración: cualquier cambio será temporal.':''}</p></div>
 </form></section>`;
}
function wireQuick(){
 const f=$('#quickform');if(!f)return;
 const car=userCar();const last=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)))[0];const baseline=Number(last?.odometer_end??car?.odometer_initial);
 const update=()=>{
  const v=Object.fromEntries(new FormData(f)); const km=Number(v.odometer_end)-baseline;
  const personalKm=km-Number(v.km_work||0);
  const kmText=Number.isFinite(km)&&v.odometer_end&&km>=0?`${fmt(km)} km recorridos · ${personalKm<0?'Revisa km de trabajo':fmt(personalKm)+' km personales'}`:`Odómetro anterior: ${fmt(baseline)} km`;
  $('#quickpreview').textContent=kmText;
  const net=Number(v.income||0)-Number(v.operating||0)-(f.querySelector('#fuel-details')?.open?Number(v.fuel_amount||0):0);
  $('#quicktotal').innerHTML=`Saldo operativo estimado del día: <strong>${currency(net)}</strong>`;
  const odo=f.querySelector('[name=fuel_odometer]');if(odo && !odo.value && v.odometer_end)odo.placeholder=`Al cargar (≤ ${v.odometer_end})`;
 };
 f.addEventListener('input',update);f.addEventListener('change',update);f.querySelector('#fuel-details')?.addEventListener('toggle',update);update();
}
async function saveQuick(v){
 const car=userCar();if(!car)throw Error('Primero registra tu vehículo.');
 const last=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)))[0];const start=Number(last?.odometer_end??car.odometer_initial);
 const total=Number(v.odometer_end)-start;
 const work=Number(v.km_work);
 if(!v.date||!Number.isFinite(total)||total<=0||!Number.isFinite(work)||work<0||work>total)throw Error('Revisa la lectura del odómetro y los km de trabajo.');
 if(last&&v.date<=dateStr(last.date))throw Error('Debes registrar una fecha posterior a la última jornada.');
 if(db.shifts.some(s=>dateStr(s.date)===v.date))throw Error('Ya existe una jornada en esa fecha.');
 const f=$('#quickform');const fuelEnabled=!!f?.querySelector('#fuel-details')?.open;
 const fields=['income','operating','personal','wallet'];for(const key of fields){if(!Number.isFinite(Number(v[key]||0))||Number(v[key]||0)<0)throw Error('Los importes no pueden ser negativos.');}
 if(fuelEnabled){if(!String(v.station||'').trim()||!(Number(v.fuel_amount)>0)||!(Number(v.fuel_quantity)>0)||!(Number(v.fuel_odometer)>=start&&Number(v.fuel_odometer)<=Number(v.odometer_end)))throw Error('Revisa el grifo, el importe, los litros y el odómetro al cargar.');}
 const payload={p_date:v.date,p_odometer_end:Number(v.odometer_end),p_km_work:work,p_income:toNum(v.income),p_operating:toNum(v.operating),p_personal:toNum(v.personal),p_wallet_reload:toNum(v.wallet),p_fuel_type:fuelEnabled?v.fuel_type:null,p_fuel_amount:fuelEnabled?toNum(v.fuel_amount):0,p_fuel_quantity:fuelEnabled?Number(v.fuel_quantity):0,p_fuel_station:fuelEnabled?v.station.trim():null,p_fuel_odometer:fuelEnabled?Number(v.fuel_odometer):null,p_fuel_full:fuelEnabled&&v.fuel_full==='Sí',p_fuel_exclusive:fuelEnabled&&v.fuel_exclusive==='Sí',p_note:''};
 if(demo){
  await saveShift({date:v.date,odometer_end:v.odometer_end,km_work:v.km_work,note:'Cierre rápido de demostración'});
  if(payload.p_income)await insert('movements',{date:v.date,kind:'ingreso',category:'Viajes del día',amount:payload.p_income});
  if(payload.p_operating)await insert('movements',{date:v.date,kind:'gasto_operativo',category:'Otros costos del trabajo',amount:payload.p_operating});
  if(payload.p_personal)await insert('movements',{date:v.date,kind:'gasto_personal',category:'Gastos personales',amount:payload.p_personal});
  if(payload.p_wallet_reload)await insert('movements',{date:v.date,kind:'recarga_app',category:'Recarga de billetera',amount:payload.p_wallet_reload});
  if(fuelEnabled)await insert('fuel',{date:v.date,fuel_type:v.fuel_type,odometer:payload.p_fuel_odometer,amount:payload.p_fuel_amount,quantity:payload.p_fuel_quantity,station:payload.p_fuel_station,full_tank:payload.p_fuel_full,exclusive_usage:payload.p_fuel_exclusive});
 }else{
  const {error}=await sb.rpc('save_day_close',payload);if(error)throw Error('No se pudo guardar el cierre: '+error.message+' Comprueba que la migración_v2 esté aplicada.');
 }
 page='inicio';
}
function gasStations(compact=false){
 const rows=stationRanking(db.fuel,'GLP');const valid=rows.filter(r=>r.sufficient);
 const best=valid.length>=2?valid[0]:null;
 const output=rows.length?`<div class="scroll"><table><thead><tr><th>Grifo</th><th>Km/L GLP</th><th>Ciclos</th><th>Estado</th></tr></thead><tbody>${rows.slice(0,compact?4:100).map(r=>`<tr><td>${esc(r.name)}</td><td>${fmt(r.kmPerUnit)}</td><td>${r.cycles}</td><td>${r.sufficient?'Comparable':'En observación'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="notice">Aún no hay ciclos válidos de GLP para comparar grifos.</div>';
 return `${best?`<p class="insight">💡 Mayor rendimiento registrado: <b>${esc(best.name)}</b> · ${fmt(best.kmPerUnit)} km/L. Es una tendencia, no una garantía de calidad.</p>`:''}${output}<p class="help">Sólo se comparan ciclos entre llenados completos con uso exclusivo de GLP confirmado, sin mezclas de grifos entre medias. El ciclo se asocia al grifo donde empezó el tramo. Para emitir una recomendación se necesitan al menos 3 ciclos válidos por grifo y 2 grifos comparables. Ruta, tráfico y carga también afectan el rendimiento.</p>`;
}
function journeys(){const car=userCar();const latest=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)))[0];const baseline=latest?.odometer_end??car?.odometer_initial;return `<section class="panel"><h2>Registrar jornada</h2><p class="help">Odómetro anterior: <b>${baseline??'Sin configurar'} km</b>. Los kilómetros se calculan desde la última lectura. La suma de trabajo + personales debe coincidir.</p>${form('shiftform',field('Fecha','date','date',`value="${today()}" required`)+field('Odómetro final (km)','odometer_end','number',`step="0.1" min="0" required ${baseline==null?'disabled':''}`)+field('Km de trabajo','km_work','number','step="0.1" min="0" required')+field('Observación','note','text'), 'Guardar jornada')}</section><section class="panel"><h2>Historial</h2>${dataRows([...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date))),[['Fecha',r=>r.date],['Odómetro final',r=>fmt(r.odometer_end)],['Km totales',r=>fmt(r.km_total)],['Km trabajo',r=>fmt(r.km_work)],['Km personales',r=>fmt(r.km_total-r.km_work)]],'shifts')}</section>`}
function movements(){return `<section class="panel"><h2>Nuevo movimiento</h2>${form('moveform',field('Fecha','date','date',`value="${today()}" required`)+sel('Tipo','kind',['ingreso','gasto_operativo','gasto_personal','recarga_app'])+sel('Categoría','category',['Viajes','Bonos','Otros ingresos','Comisiones','Mantenimiento','Lavado de carro','Peajes','Estacionamiento','Repuestos y frenos','Llantas y ruedas','Seguros y trámites','Celular laboral','Otros costos del trabajo','Familia','Estudios','Banco - préstamo','Banco - tarjeta','Salud y farmacia','Alimentación personal','Otros gastos personales','Recarga inDrive'])+field('Monto S/','amount','number','step="0.01" min="0.01" required')+field('Detalle','note'))}</section><section class="panel"><h2>Ingresos, gastos y transferencias</h2>${dataRows(db.movements,[['Fecha',r=>r.date],['Tipo',r=>r.kind],['Categoría',r=>r.category],['Soles',r=>currency(r.amount)],['Detalle',r=>r.note||'']],'movements')}</section>`}
function fuel(){return `<section class="panel"><h2>⛽ ¿En qué grifo cargaste?</h2><p class="help">Guarda el nombre del grifo y el odómetro al cargar para conocer el rendimiento entre tanques llenos. Si hoy ya guardaste el combustible en Cierre rápido, no lo repitas aquí.</p>
${form('fuelform',field('Fecha','date','date',`value="${today()}" required`)+sel('Combustible','fuel_type',['GLP','Gasolina','GNV'])+field('Grifo / estación de servicio','station','text','list="grifo-list" placeholder="Ej. Grifo Central" required')+field('Odómetro al cargar','odometer','number','min="0" step="0.1" required')+field('Pago S/','amount','number','step="0.01" min="0.01" required')+field('Litros o m³','quantity','number','step="0.001" min="0.001" required')+sel('¿Tanque lleno?','full_tank',['Sí','No'])+sel('¿Desde el llenado anterior usaste solo este combustible?','exclusive_usage',['No','Sí'])+field('Observación','note'))}${stationsList()}</section>
<section class="panel"><h2>Historial de abastecimientos</h2>${dataRows(db.fuel,[['Fecha',r=>r.date],['Grifo',r=>r.station||'No registrado'],['Tipo',r=>r.fuel_type],['Odómetro',r=>fmt(r.odometer)],['Pago',r=>currency(r.amount)],['Cantidad',r=>fmt(r.quantity)],['Tanque lleno',r=>r.full_tank?'Sí':'No']],'fuel')}</section>
<section class="panel"><h2>🏆 ¿Qué grifo rinde mejor con GLP?</h2>${gasStations()}</section>${fuelEfficiency()}`}
function fuelEfficiency(){
 const rows=['GLP','Gasolina','GNV'].map(type=>{
 const c=fuelCycles(db.fuel,type);const valid=c.filter(x=>x.usable);
 const last=valid.at(-1);
 return `<tr><td>${type}</td><td>${last?fmt(last.kmPerUnit):'—'}</td><td>${last?currency(last.solesPerKm):'—'}</td><td>${valid.length}</td></tr>`;
 }).join('');
 return `<section class="panel"><h2>Rendimiento de combustible por ciclo confirmado</h2><table><thead><tr><th>Tipo</th><th>Km/unidad · último ciclo válido</th><th>S/ por km</th><th>Ciclos válidos</th></tr></thead><tbody>${rows}</tbody></table><p class="help">El rendimiento se estima con el volumen repuesto hasta llenar y los kilómetros desde el llenado anterior; no se deduce del pago diario. Para autos bicombustible, marca «uso exclusivo» solo si corresponde.</p></section>`;
}
function goals(){const s=summary();return `<section class="panel"><h2>🎯 Crear meta</h2>${form('goalform',field('Nombre de meta','name','text','required')+field('Objetivo S/','target','number','step="0.01" min="0.01" required')+field('Dinero reservado S/','reserved','number','step="0.01" min="0" value="0" required')+field('Fecha límite','deadline','date','required'))}</section><section class="panel"><h2>Mis metas y proyecciones</h2>${db.goals.length?db.goals.map(g=>{const left=Math.max(0,Number(g.target)-Number(g.reserved));const remaining=Math.max(0,Math.ceil((new Date(g.deadline+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000));const avg=s.shifts>=3?s.net/s.shifts:null;return `<div class="card" style="margin-bottom:10px"><b>${esc(g.name)}</b><span class="muted"> · Vence ${g.deadline}</span><p>Objetivo ${currency(g.target)} · Reservado ${currency(g.reserved)} · Falta <b>${currency(left)}</b></p><p class="help">Necesitarías reservar ${remaining?currency(left/remaining):'—'} por día calendario. Proyección por jornada: ${avg==null?'Sin promedio (mínimo 3 jornadas)':currency(avg)}.</p><button class="btn danger" data-delete="goals:${g.id}">Eliminar</button></div>`}).join(''):'<p class="empty">No has creado metas todavía</p>'}</section>`}
function maint(){const odometer=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)))[0]?.odometer_end??userCar()?.odometer_initial??0;return `<section class="panel"><h2>Nuevo mantenimiento programado</h2>${form('maintform',field('Concepto','name','text','required')+field('Próximo mantenimiento al km','due_km','number','min="0" step="1" required')+field('Costo estimado S/','estimated_cost','number','min="0" step="0.01" value="0"'))}</section><section class="panel"><h2>Próximas revisiones · Odómetro ${fmt(odometer)} km</h2>${db.maintenance.length?db.maintenance.map(m=>`<div class="card" style="margin-bottom:10px"><b>${esc(m.name)}</b><p>Vence en km ${fmt(m.due_km)} · <span class="${m.due_km<=odometer?'red':'green'}">${m.due_km<=odometer?'Vencido':fmt(m.due_km-odometer)+' km restantes'}</span></p><button class="btn danger" data-delete="maintenance:${m.id}">Eliminar</button></div>`).join(''):'<p class="empty">Sin mantenimientos programados</p>'}</section>`}
function config(){const v=userCar();return `<section class="panel"><h2>Mi vehículo · Configuración inicial</h2><p class="help">El odómetro inicial no debe modificarse después de registrar jornadas; el historial depende de él.</p>${form('carform',field('Marca','brand','text',`value="${esc(v?.brand||'')}" required`)+field('Modelo','model','text',`value="${esc(v?.model||'')}" required`)+field('Año','year','number',`min="1950" max="2100" value="${esc(v?.year||2020)}" required`)+field('Odómetro inicial','odometer_initial','number',`min="0" step="0.1" value="${esc(v?.odometer_initial??'')}" required ${db.shifts.length?'readonly':''}`)+field('Meta ingresos / km S/','target_per_km','number',`step="0.01" value="${esc(v?.target_per_km??2)}" required`),v?'Actualizar vehículo':'Guardar vehículo')}</section><section class="panel"><h2>Privacidad y copias</h2><p class="help">Cada registro se identifica con el ID inmutable de tu sesión. Supabase aplica restricciones RLS por cuenta, tanto para lectura como escritura y eliminación. Ningún cliente debe usar claves de administrador.</p><button id="export" class="btn secondary">Descargar mis datos (JSON)</button></section>`}
function render(){
 if(!user){loginView();return}
 shell();
 const content=$('#content');
 content.innerHTML=({inicio:dashboard,cierre:quickClose,jornadas:journeys,movimientos:movements,combustible:fuel,
 analisis:()=>`<section class="panel"><div class="charttitle"><h2>Ganancia neta por día · solo cierres diarios</h2><span class="tag">Mis jornadas</span></div>${weekdayAnalysis()}</section>`,
 metas:goals,mantenimiento:maint,configuracion:config})[page]();
 document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{page=b.dataset.go;render()});
 wireDeletes();wireQuick();
 const forms={quickform:saveQuick,shiftform:saveShift,moveform:saveMove,fuelform:saveFuel,goalform:saveGoal,maintform:saveMaint,carform:saveCar};
 Object.entries(forms).forEach(([id,fn])=>{const el=$('#'+id);if(el)el.onsubmit=async e=>{
  e.preventDefault();const btn=el.querySelector('[type=submit]');if(btn)btn.disabled=true;
  try{await fn(Object.fromEntries(new FormData(el)));await refresh()}catch(error){const status=$('#status');if(status)status.textContent=error.message;else alert(error.message)}finally{if(btn)btn.disabled=false}
 }});
 if($('#export'))$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),...db},null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='mi-ruta-pro-mis-datos.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};
}
async function insert(t,payload){if(demo){db[t].unshift({id:globalThis.crypto?.randomUUID?.()||String(Date.now()+Math.random()),created_at:new Date().toISOString(),user_id:user.id,...payload});return}const {error}=await sb.from(t).insert({...payload,user_id:user.id});if(error)throw error}
async function saveShift(v){const car=userCar();if(!car)throw Error('Primero configura el vehículo y su odómetro inicial.');const prev=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)))[0];const odo=Number(v.odometer_end),start=Number(prev?.odometer_end??car.odometer_initial),km=toNum(odo-start),work=toNum(v.km_work);if(odo<=start||km<=0)throw Error('La nueva lectura debe ser mayor a la anterior.');if(work<0||work>km)throw Error('Los kilómetros de trabajo no pueden superar el recorrido.');if(prev&&v.date<dateStr(prev.date))throw Error('Registra las jornadas en orden cronológico para proteger el odómetro.');if(db.shifts.some(s=>dateStr(s.date)===v.date))throw Error('Ya existe una jornada en esa fecha. Edita/elimina la anterior antes de crear otra.');await insert('shifts',{date:v.date,odometer_start:start,odometer_end:odo,km_total:km,km_work:work,note:v.note||''})}
async function saveMove(v){if(Number(v.amount)<=0)throw Error('Monto no válido.');await insert('movements',{date:v.date,kind:v.kind,category:v.category,amount:toNum(v.amount),note:v.note||''})}
async function saveFuel(v){if(Number(v.quantity)<=0||Number(v.amount)<=0)throw Error('Importe y cantidad deben ser positivos.');if(!String(v.station||'').trim())throw Error('Indica el nombre del grifo.');await insert('fuel',{date:v.date,fuel_type:v.fuel_type,station:v.station.trim(),odometer:Number(v.odometer),amount:toNum(v.amount),quantity:Number(v.quantity),full_tank:v.full_tank==='Sí',exclusive_usage:v.exclusive_usage==='Sí',note:v.note||''})}
async function saveGoal(v){await insert('goals',{name:v.name,target:toNum(v.target),reserved:toNum(v.reserved),deadline:v.deadline})}
async function saveMaint(v){await insert('maintenance',{name:v.name,due_km:Number(v.due_km),estimated_cost:toNum(v.estimated_cost)})}
async function saveCar(v){const payload={brand:v.brand,model:v.model,year:Number(v.year),odometer_initial:Number(v.odometer_initial),target_per_km:toNum(v.target_per_km)};if(db.vehicles.length){if(demo)db.vehicles[0]={...db.vehicles[0],...payload};else{const {error}=await sb.from('vehicles').update(payload).eq('id',db.vehicles[0].id).eq('user_id',user.id);if(error)throw error}}else await insert('vehicles',payload)}

function seedDemo(){
  const data={profiles:[],vehicles:[{id:'demo-auto',brand:'Vehículo',model:'De ejemplo',year:2024,odometer_initial:12200,target_per_km:2,created_at:new Date().toISOString()}],shifts:[],movements:[],fuel:[],goals:[],maintenance:[]};
  const now=new Date(today()+'T12:00:00Z');let previous=12200;
  const getDate=offset=>{const dt=new Date(now);dt.setUTCDate(dt.getUTCDate()+offset);return dt.toISOString().slice(0,10)};
  for(let i=0;i<21;i++){
    const date=getDate(i-21),wd=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
    const km=52+(i%4)*8,work=km-9,odo=previous+km;
    data.shifts.push({id:'s'+i,date,odometer_start:previous,odometer_end:odo,km_total:km,km_work:work,created_at:new Date().toISOString()});
    data.movements.push({id:'m'+i,date,kind:'ingreso',category:'Viajes',amount:wd===5?210:wd===4?185:wd===0?90:135+(i%3)*6,created_at:new Date().toISOString()});
    data.movements.push({id:'c'+i,date,kind:'gasto_operativo',category:'Otros costos',amount:6+(i%3),created_at:new Date().toISOString()});
    previous=odo;
  }
  const stations=['Grifo Los Olivos','Grifo Los Olivos','Grifo Los Olivos','Grifo Central','Grifo Central','Grifo Central','Grifo Los Olivos'];
  for(let j=0;j<7;j++){
    const shift=data.shifts[2+j*3];
    const qty=20+(j%3)*.5;
    data.fuel.push({id:'f'+j,date:shift.date,fuel_type:'GLP',station:stations[j],odometer:shift.odometer_end,amount:qty*2.7,quantity:qty,full_tank:true,exclusive_usage:true,created_at:new Date().toISOString()});
  }
  return data;
}

init();
