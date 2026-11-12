import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {weekdayReport, fuelCycles, stationRanking} from './analytics.mjs';
import {debtStatus, validateDebtAction} from './debts.mjs';
const ready=Boolean(SUPABASE_URL&&SUPABASE_PUBLISHABLE_KEY);const currency=n=>'S/ '+Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});const fmt=n=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:2});const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});const $=s=>document.querySelector(s);const root=$('#root');
let sb=null,user=null,demo=false,signupMode=false,db={profiles:[],vehicles:[],shifts:[],movements:[],fuel:[],goals:[],maintenance:[],debts:[],debt_actions:[]},page='inicio',range='30';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toNum=v=>Math.round((Number(v)||0)*100)/100;
const dateStr=s=>String(s||'').slice(0,10);
function filterDate(d){let days=Number(range);if(!days)return true;let delta=(new Date(today()+'T12:00:00')-new Date(dateStr(d)+'T12:00:00'))/86400000;return delta>=0&&delta<days}
function account(){return db.profiles[0]?.display_name||user?.email||'Usuario'}
async function init(){if(ready){try{const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});const {data}=await sb.auth.getUser();user=data.user;sb.auth.onAuthStateChange((_evt,session)=>{const id=session?.user?.id;if(id!==user?.id){user=session?.user||null;setTimeout(()=>refresh(),0)}})}catch(e){root.innerHTML='<div class="auth">No se pudo iniciar la conexión: '+esc(e.message)+'</div>';return}}await refresh()}
let dataError='';
async function refresh(){if(user&&sb&&!demo){dataError='';const tables=Object.keys(db);const results=await Promise.all(tables.map(t=>sb.from(t).select('*').eq('user_id',user.id).order('created_at',{ascending:false})));results.forEach((r,i)=>{if(r.error){console.error(tables[i],r.error.message);db[tables[i]]=[];if(['debts','debt_actions'].includes(tables[i]))dataError='La sección Pagos necesita ejecutar migration_v3.sql en el proyecto exclusivo Mi Ruta PRO.';}else db[tables[i]]=r.datafunction loginView(){
  root.innerHTML=`<main class="auth auth-refresh">
    <div class="brand">🚘 Mi Ruta <b>PRO</b></div>
    <div class="step-indicator">TU NUEVA RUTA EMPIEZA AQUÍ</div>
    <h1>${signupMode?'Crea tu cuenta':'Bienvenido de nuevo'}</h1>
    <p class="muted">${signupMode?'Tus datos serán privados. Al entrar, configurarás tu vehículo y tu saldo inicial.':'Ingresa para consultar tus jornadas, combustible, grifos y pagos.'}</p>
    ${!ready?'<div class="notice">La conexión con la base de datos no está disponible.</div>':''}
    <form id="authform" autocomplete="on">
      <label for="auth-email">Correo electrónico</label><input id="auth-email" name="email" type="email" autocomplete="email" maxlength="250" required />
      <label for="auth-password">Contraseña ${signupMode?'· mínimo 8 caracteres':''}</label><input id="auth-password" name="password" type="password" minlength="${signupMode?8:6}" autocomplete="${signupMode?'new-password':'current-password'}" required />
      ${signupMode?'<label for="auth-confirm">Confirmar contraseña</label><input id="auth-confirm" name="confirm_password" type="password" minlength="8" autocomplete="new-password" required />':''}
      <div class="auth-controls"><button class="btn big" type="submit" ${!ready?'disabled':''}>${signupMode?'Crear mi cuenta':'Iniciar sesión'}</button>
      <button class="btn secondary" id="toggle-mode" type="button">${signupMode?'Ya tengo cuenta':'Crear cuenta nueva'}</button></div>
      <p class="help" id="authstatus" role="status" aria-live="polite">${signupMode?'Si se solicita confirmación, revisa tu correo antes de ingresar.':'¿Primera vez? Crea tu cuenta y configura tu punto de partida.'}</p>
    </form>
    <p class="auth-footnote">Cada conductor utiliza su propia cuenta. No hay datos de demostración ni ingresos precargados.</p>
  </main>`;
  $('#toggle-mode').onclick=()=>{signupMode=!signupMode;loginView()};
  $('#authform').onsubmit=async e=>{
    e.preventDefault();
    const el=e.currentTarget, f=new FormData(el), email=String(f.get('email')||'').trim().toLowerCase(), password=String(f.get('password')||'');
    const status=el.querySelector('#authstatus'), btn=el.querySelector('[type=submit]');
    if(!ready||!sb){status.textContent='No hay conexión con la base de datos.';return}
    if(signupMode&&(password.length<8||password!==f.get('confirm_password'))){status.textContent='Revisa las contraseñas: deben coincidir y tener al menos 8 caracteres.';return}
    btn.disabled=true;status.textContent=signupMode?'Registrando cuenta...':'Validando acceso...';
    try {
      if(signupMode){
        const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
        if(error)throw error;
        if(data?.session?.user){user=data.session.user;signupMode=false;await refresh()}
        else{status.textContent='Solicitud enviada. Comprueba tu correo y confirma la cuenta antes de iniciar sesión. Después configura tu punto de partida.';el.querySelector('[name=password]').value='';el.querySelector('[name=confirm_password]').value=''}
      }else{
        const {data,error}=await sb.auth.signInWithPassword({email,password});
        if(error)throw error;
        user=data?.user||null;
        if(!user)throw Error('No se pudo confirmar la sesión.');
        await refresh();
      }
    }catch(err){status.textContent=String(err.message||'No se pudo completar el acceso.')}
    finally{btn.disabled=false}
  };
}
stá activada.'}}
const pages=[['inicio','▦','Inicio'],['cierre','✓','Cierre rápido'],['jornadas','🚘','Jornadas'],['movimientos','💳','Movimientos'],['combustible','⛽','Combustible'],['analisis','📊','Análisis de días'],['metas','🎯','Metas'],['pagos','💰','Préstamos y pagos'],['mantenimiento','🔧','Mantenimiento'],['configuracion','⚙️','Mi vehículo']];
function shell(){root.innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand">🚘 Mi Ruta <b>PRO</b></div>${pages.map(([p,ico,label])=>`<button data-page="${p}" class="menu ${page===p?'active':''}">${ico} ${label}</button>`).join('')}</aside><main class="main"><header class="top"><div><h1 id="heading">${esc(pages.find(x=>x[0]===page)?.[2])}</h1><p class="muted">${demo?'🧪 Modo demostración · Datos ficticios, no se guardan':'🔒 '+esc(account())+' · Datos privados de tu cuenta'}</p></div><div class="actions"><select id="range" aria-label="Período"><option value="7">7 días</option><option value="30">30 días</option><option value="90">90 días</option><option value="0">Todo</option></select><button id="signout" class="btn secondary">Salir</button></div></header><div id="db-warning"></div><div id="content"></div><footer class="foot">Mi Ruta PRO · GFLM Systems · Tu control, tu ganancia</footer></main></div>`;$('#range').value=range;$('#range').onchange=e=>{range=e.target.value;render()};$('#signout').onclick=async()=>{if(demo){demo=false;user=null;db={profiles:[],vehicles:[],shifts:[],movements:[],fuel:[],goals:[],maintenance:[],debts:[],debt_actions:[]}}else await sb.auth.signOut();user=null;render()};document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render()})}
const field=(label,name,type='text',extra='')=>`<div><label>${label}</label><input name="${name}" type="${type}" ${extra}/></div>`;
const sel=(label,name,arr)=>`<div><label>${label}</label><select name="${name}">${arr.map(a=>`<option>${esc(a)}</option>`).join('')}</select></div>`;
const form=(id,body,button='Guardar')=>`<form id="${id}" class="fields">${body}<div class="wide"><button class="btn" type="submit">${button}</button></div><p class="help wide" id="status"></p></form>`;
const dataRows=(items,cols,delTable)=>`<div class="scroll"><table><thead><tr>${cols.map(x=>`<th>${x[0]}</th>`).join('')}<th></th></tr></thead><tbody>${items.length?items.slice(0,80).map(r=>`<tr>${cols.map(x=>`<td>${esc(x[1](r))}</td>`).join('')}<td><button class="btn danger" data-delete="${delTable}:${r.id}">Eliminar</button></td></tr>`).join(''):`<tr><td colspan="${cols.length+1}" class="empty">Sin registros reales todavía</td></tr>`}</tbody></table></div>`;
function wireDeletes(){document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const [t,id]=b.dataset.delete.split(':');if(t==='shifts'){const ordered=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)));if(ordered[0]?.id!==id){alert('Para proteger la secuencia del odómetro, elimina primero las jornadas posteriores.');return}}if(!confirm('¿Eliminar este registro?'))return;if(demo){db[t]=db[t].filter(r=>r.id!==id);render();return}const {error}=await sb.from(t).delete().eq('id',id).eq('user_id',user.id);if(error)alert(error.message);else await refresh()})}
function userCar(){return db.vehicles[0]||null}
function moneyFor(d){const relevant=db.movements.filter(m=>dateStr(m.date)===d);return relevant.reduce((a,m)=>a+(m.kind==='ingreso'?Number(m.amount):0),0)}
function costsFor(d){return db.movements.filter(m=>dateStr(m.date)===d&&m.kind==='gasto_operativo').reduce((a,m)=>a+Number(m.amount),0)+db.fuel.filter(f=>dateStr(f.date)===d).reduce((a,f)=>a+Number(f.amount),0)}
function summary(){const moves=db.movements.filter(m=>filterDate(m.date)),fuel=db.fuel.filter(f=>filterDate(f.date)),shifts=db.shifts.filter(s=>filterDate(s.date));let income=moves.filter(m=>m.kind==='ingreso').reduce((a,m)=>a+Number(m.amount),0),cost=moves.filter(m=>m.kind==='gasto_operativo').reduce((a,m)=>a+Number(m.amount),0)+fuel.reduce((a,f)=>a+Number(f.amount),0),personal=moves.filter(m=>m.kind==='gasto_personal').reduce((a,m)=>a+Number(m.amount),0),reloads=moves.filter(m=>m.kind==='recarga_app').reduce((a,m)=>a+Number(m.amount),0),km=shifts.reduce((a,s)=>a+Number(s.km_total),0),work=shifts.reduce((a,s)=>a+Number(s.km_work),0);const loanPayments=db.debt_actions.filter(a=>a.kind==='pay'&&filterDate(a.date)).reduce((a,x)=>a+Number(x.amount),0);return {income,cost,net:income-cost,personal,reloads,loanPayments,km,work,privateKm:km-work,shifts:shifts.length}}
function dashboard(){
  const s=summary();
  return `<section class="panel welcome"><div><p class="eyebrow">MI RUTA PRO · INTELLIGENCE</p><h2>${db.shifts.length?'Tu jornada, en orden y sin complicaciones.':'Tu cuenta está lista. Empieza con tu primera jornada.'}</h2><p>Registra una sola vez al terminar el día. Nosotros hacemos el análisis.</p></div><button class="btn big" data-go="cierre">✅ Cerrar mi día</button></section>
  <div class="cards">${[['Ingresos de trabajo',currency(s.income)],['Saldo neto operativo',currency(s.net)],['Costos operativos',currency(s.cost)],['Flujo después de salidas personales',currency(s.net-s.personal-s.reloads-s.loanPayments)]].map(([l,v])=>`<div class="card"><small>${l}</small><strong>${v}</strong></div>`).join('')}</div>
  <div class="cards">${[['Km totales',fmt(s.km)],['Km de trabajo',fmt(s.work)],['Km personales',fmt(s.privateKm)],['Saldo / km de trabajo',s.work?currency(s.net/s.work):'—']].map(([l,v])=>`<div class="card"><small>${l}</small><strong>${v}</strong></div>`).join('')}</div>
  <div class="split"><section class="panel"><h2>📊 ¿Qué día te deja mejor saldo?</h2>${weekdayAnalysis(true)}</section>
  <section class="panel"><h2>💰 Próximos pagos</h2>${debtHighlights()}<div class="actions"><button class="btn secondary" data-go="pagos">Ver préstamos y pagos</button></div><hr class="sep"><h2>⛽ Grifos de GLP</h2>${gasStations(true)}<div class="actions"><button class="btn secondary" data-go="combustible">Ver grifos y recargas</button></div><hr class="sep"><p>🎯 Jornadas cerradas: <b>${s.shifts}</b></p><p class="help">La recarga de la billetera de una app no es gasto. Los pagos personales se separan de los costos del trabajo.</p></section></div>`;
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
  <details class="wide extras" id="debt-quick"><summary>💰 Apartar dinero para un préstamo (opcional)</summary><div class="fields"><div><label>Préstamo o pago</label><select name="debt_id"><option value="">No apartar en esta jornada</option>${db.debts.filter(d=>!debtStatus(d,actionsForDebt(d.id),today()).complete).map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · vence ${esc(d.due_date)}</option>`).join('')}</select></div>${field('Quiero apartar hoy (S/)','debt_reserve','number','step="0.01" min="0" value="0"')}<p class="help wide">Solo es dinero que decides apartar. No se considera pago realizado ni se consulta el saldo de ninguna billetera.</p></div></details><div class="wide quick-total" id="quicktotal">Saldo operativo estimado del día: <strong>${currency(0)}</strong></div>
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
 const selectedDebt = String(v.debt_id||'');
 const reserveAmount=Number(v.debt_reserve||0);
 if(selectedDebt && reserveAmount>0){validateDebtAction(db.debts.find(d=>d.id===selectedDebt),actionsForDebt(selectedDebt),{kind:'reserve',amount:reserveAmount},v.date)}
 if((selectedDebt && !Number.isFinite(reserveAmount))||reserveAmount<0||(!selectedDebt&&reserveAmount>0))throw Error('Selecciona un préstamo y un importe válido para apartar.');
 const payload={p_date:v.date,p_odometer_end:Number(v.odometer_end),p_km_work:work,p_income:toNum(v.income),p_operating:toNum(v.operating),p_personal:toNum(v.personal),p_wallet_reload:toNum(v.wallet),p_fuel_type:fuelEnabled?v.fuel_type:null,p_fuel_amount:fuelEnabled?toNum(v.fuel_amount):0,p_fuel_quantity:fuelEnabled?Number(v.fuel_quantity):0,p_fuel_station:fuelEnabled?v.station.trim():null,p_fuel_odometer:fuelEnabled?Number(v.fuel_odometer):null,p_fuel_full:fuelEnabled&&v.fuel_full==='Sí',p_fuel_exclusive:fuelEnabled&&v.fuel_exclusive==='Sí',p_note:''};
 if(demo){
  await saveShift({date:v.date,odometer_end:v.odometer_end,km_work:v.km_work,note:'Cierre rápido de demostración'});
  if(payload.p_income)await insert('movements',{date:v.date,kind:'ingreso',category:'Viajes del día',amount:payload.p_income});
  if(payload.p_operating)await insert('movements',{date:v.date,kind:'gasto_operativo',category:'Otros costos del trabajo',amount:payload.p_operating});
  if(payload.p_personal)await insert('movements',{date:v.date,kind:'gasto_personal',category:'Gastos personales',amount:payload.p_personal});
  if(payload.p_wallet_reload)await insert('movements',{date:v.date,kind:'recarga_app',category:'Recarga de billetera',amount:payload.p_wallet_reload});
  if(fuelEnabled)await insert('fuel',{date:v.date,fuel_type:v.fuel_type,odometer:payload.p_fuel_odometer,amount:payload.p_fuel_amount,quantity:payload.p_fuel_quantity,station:payload.p_fuel_station,full_tank:payload.p_fuel_full,exclusive_usage:payload.p_fuel_exclusive});
  if(selectedDebt&&reserveAmount>0)await insert('debt_actions',{debt_id:selectedDebt,date:v.date,kind:'reserve',amount:toNum(reserveAmount),from_reserved:0});
 }else{
  const p = selectedDebt && reserveAmount>0 ? {...payload,p_debt_id:selectedDebt,p_debt_reserve:toNum(reserveAmount)} : payload;
  const {error}=await sb.rpc(selectedDebt&&reserveAmount>0?'save_day_close_v3':'save_day_close',p);if(error)throw Error('No se pudo guardar el cierre: '+error.message+' Comprueba que las migraciones estén aplicadas.');
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
const categoryOptions={
 ingreso:['Viajes','Bonos','Otros ingresos'],
 gasto_operativo:['Comisiones','Mantenimiento','Lavado de carro','Peajes y estacionamiento','Otros costos del trabajo'],
 gasto_personal:['Alimentación personal','Familia','Estudios','Bancos y cuotas','Otros gastos personales'],
 recarga_app:['Recarga de billetera']
};
function movements(){return `<section class="panel"><h2>Nuevo movimiento</h2><p class="help">Categorías cortas para registrar rápido. Las categorías antiguas de V4 se siguen mostrando en el historial. Los abonos a préstamos se registran en «Préstamos y pagos» para no duplicarlos.</p>${form('moveform',field('Fecha','date','date',`value="${today()}" required`)+`<div><label>Tipo</label><select name="kind" id="movement-kind">${[['ingreso','Ingreso'],['gasto_operativo','Gasto del trabajo'],['gasto_personal','Gasto personal'],['recarga_app','Recarga de app']].map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></div><div><label>Categoría</label><select name="category" id="movement-category"></select></div>`+field('Monto S/','amount','number','step="0.01" min="0.01" required')+field('Detalle','note'))}</section><section class="panel"><h2>Ingresos, gastos y transferencias</h2>${dataRows(db.movements,[['Fecha',r=>r.date],['Tipo',r=>r.kind],['Categoría',r=>r.category],['Soles',r=>currency(r.amount)],['Detalle',r=>r.note||'']],'movements')}</section>`}
function wireMovementCategory(){const kind=$('#movement-kind'),category=$('#movement-category');if(!kind||!category)return;const update=()=>category.innerHTML=(categoryOptions[kind.value]||[]).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');kind.addEventListener('change',update);update()}

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
function actionsForDebt(id){return db.debt_actions.filter(a=>a.debt_id===id)}
function sortedDebts(){return [...db.debts].sort((a,b)=>a.due_date.localeCompare(b.due_date))}
function debtHighlights(){
 const active=sortedDebts().filter(d=>!debtStatus(d,actionsForDebt(d.id),today()).complete);
 if(!active.length)return '<p class="help">Sin pagos pendientes. Agrega préstamos o cuotas para obtener objetivos diarios automáticos.</p>';
 return active.slice(0,3).map(d=>{const st=debtStatus(d,actionsForDebt(d.id),today());return `<div class="debt-highlight"><b>${esc(d.name)}</b> · vence ${esc(d.due_date)}<div class="muted">Falta reunir ${currency(st.toCollect)} · ${st.overdue?'Plazo vencido':`objetivo ${currency(st.daily)} / día`}</div></div>`}).join('');
}
function paymentPlan(){
 const current=today();const active=sortedDebts();
 return `<section class="panel quick-panel"><div class="charttitle"><div><h2>💰 Mis préstamos y próximos pagos</h2><p class="muted">Controla lo que debes, lo que apartaste y los pagos efectivamente realizados.</p></div><span class="tag">Objetivo diario</span></div>
 <div class="notice">Apartar dinero <b>no es pagar una deuda</b>. El cálculo no consulta tu billetera ni descuenta apartados de tus ganancias operativas.</div>
 <details class="extras"><summary>➕ Añadir préstamo, cuota o pago</summary>${form('debtform',field('Concepto','name','text','placeholder="Ej. Préstamo banco" maxlength="100" required')+sel('Tipo','kind',['Préstamo','Tarjeta','Cuota','Servicio','Otro pago'])+field('Monto total a pagar S/','amount','number','min="0.01" step="0.01" required')+field('Último día para pagar','due_date','date',`value="${current}" required`),'Crear pago pendiente')}</details></section>
 <section class="panel"><div class="charttitle"><h2>Mis pagos y objetivos</h2><span class="tag">${active.length} registrado(s)</span></div>
 ${active.length?active.map(d=>{const st=debtStatus(d,actionsForDebt(d.id),current);const actions=actionsForDebt(d.id).sort((a,b)=>`${b.date||''}|${b.created_at||''}`.localeCompare(`${a.date||''}|${a.created_at||''}`));return `<article class="debt-card"><div class="charttitle"><div><strong>${esc(d.name)}</strong><div class="muted">${esc(d.kind)} · Vence ${esc(d.due_date)} · ${st.overdue?'<b class="red">Vencido</b>':st.complete?'<b class="green">Pagado</b>':st.days===0?'Vence hoy':`Faltan ${st.days} día(s)`}</div></div><button class="btn danger small" data-delete="debts:${esc(d.id)}" title="Eliminar préstamo y registros asociados">Eliminar</button></div>
 <div class="debt-stats"><div><small>Deuda pendiente</small><strong>${currency(st.amountOutstanding)}</strong></div><div><small>Apartado (declarado)</small><strong>${currency(st.reserved)}</strong></div><div><small>Falta por reunir</small><strong>${currency(st.toCollect)}</strong></div><div><small>Objetivo por día</small><strong class="${st.overdue?'red':'green'}">${st.complete?'Completado':st.overdue?'Vencido':currency(st.daily)}</strong></div></div>
 <div class="debt-progress"><span style="width:${Math.min(100,(st.paid+st.reserved)/Math.max(1,st.goal)*100)}%"></span></div><p class="help">Total ${currency(st.goal)} · Pagado ${currency(st.paid)} · Apartado ${currency(st.reserved)}. El dinero apartado no se confirma como saldo bancario.</p>
 ${st.complete?'<p class="insight">✅ Este compromiso ya aparece totalmente pagado.</p>':`<form class="debt-action fields" data-debt="${esc(d.id)}"><input name="debt_id" type="hidden" value="${esc(d.id)}"/><div><label>Acción</label><select name="kind"><option value="reserve">Apartar dinero</option><option value="pay">Registrar pago REAL</option><option value="release">Retirar de lo apartado</option></select></div>${field('Importe S/','amount','number','min="0.01" step="0.01" placeholder="Ej. 100" required')}<div><label>Fecha del movimiento</label><input name="date" type="date" value="${current}" required/></div><div class="wide"><label class="checkbox-option"><input name="use_reserved" type="checkbox" checked/> Si registro un pago, usar primero el importe que aparté</label></div><div class="wide"><button class="btn" type="submit">Guardar operación</button><p class="help status"></p></div></form>`}
 <details class="debt-history"><summary>Ver movimientos (${actions.length})</summary>${actions.length?`<div class="scroll"><table><thead><tr><th>Fecha</th><th>Operación</th><th>Monto</th><th>Usado de apartado</th></tr></thead><tbody>${actions.map(a=>`<tr><td>${esc(a.date)}</td><td>${a.kind==='reserve'?'Apartado':a.kind==='release'?'Liberado':'Pagado'}</td><td>${currency(a.amount)}</td><td>${a.kind==='pay'?currency(a.from_reserved):'—'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="help">No hay movimientos todavía.</p>'}</details>
 </article>`}).join(''):'<div class="empty">Aún no registraste préstamos o pagos. Crea uno y verás cuánto debes reunir por día hasta su vencimiento.</div>'}</section>`;
}
async function saveDebt(v){const amt=toNum(v.amount);if(!String(v.name||'').trim()||!Number.isFinite(Number(v.amount))||amt<=0||!v.due_date)throw Error('Completa concepto, monto y fecha límite.');await insert('debts',{name:v.name.trim(),kind:v.kind,amount:amt,due_date:v.due_date})}
async function saveDebtAction(v){const debt=db.debts.find(d=>d.id===v.debt_id);const actions=actionsForDebt(v.debt_id);const raw=validateDebtAction(debt,actions,{kind:v.kind,amount:v.amount,from_reserved:v.kind==='pay'&&v.use_reserved==='on'?Math.min(toNum(v.amount),debtStatus(debt,actions,v.date).reserved):0},v.date);
 if(demo){await insert('debt_actions',{debt_id:debt.id,date:v.date,kind:raw.kind,amount:raw.amount,from_reserved:raw.fromReserved});return}
 const {error}=await sb.rpc('record_debt_action',{p_debt_id:debt.id,p_kind:raw.kind,p_amount:raw.amount,p_from_reserved:raw.fromReserved,p_date:v.date});if(error)throw Error(error.message);
}
function wireDebtActions(){document.querySelectorAll('.debt-action').forEach(el=>{
 const kind=el.querySelector('[name=kind]');const use=el.querySelector('.checkbox-option');const update=()=>{use.style.display=kind.value==='pay'?'flex':'none'};kind.addEventListener('change',update);update();
 el.onsubmit=async e=>{e.preventDefault();const btn=el.querySelector('button[type=submit]');btn.disabled=true;try{await saveDebtAction(Object.fromEntries(new FormData(el)));await refresh()}catch(error){el.querySelector('.status').textContent=error.message}finally{btn.disabled=false}};
})}
function maint(){const odometer=[...db.shifts].sort((a,b)=>dateStr(b.date).localeCompare(dateStr(a.date)))[0]?.odometer_end??userCar()?.odometer_initial??0;return `<section class="panel"><h2>Nuevo mantenimiento programado</h2>${form('maintform',field('Concepto','name','text','required')+field('Próximo mantenimiento al km','due_km','number','min="0" step="1" required')+field('Costo estimado S/','estimated_cost','number','min="0" step="0.01" value="0"'))}</section><section class="panel"><h2>Próximas revisiones · Odómetro ${fmt(odometer)} km</h2>${db.maintenance.length?db.maintenance.map(m=>`<div class="card" style="margin-bottom:10px"><b>${esc(m.name)}</b><p>Vence en km ${fmt(m.due_km)} · <span class="${m.due_km<=odometer?'red':'green'}">${m.due_km<=odometer?'Vencido':fmt(m.due_km-odometer)+' km restantes'}</span></p><button class="btn danger" data-delete="maintenance:${m.id}">Eliminar</button></div>`).join(''):'<p class="empty">Sin mantenimientos programados</p>'}</section>`}
function config(){
  const v=userCar();
  if(!v)return `<section class="panel"><p class="notice">Primero configura tu punto de partida.</p></section>`;
  const locked=db.shifts.length>0||db.movements.length>0||db.fuel.length>0||db.debt_actions.length>0;
  return `<section class="panel"><h2>Mi punto de partida</h2>
    <p class="help">Estos valores se registraron al crear la cuenta. No son ganancias ni consumos del día.</p>
    <div class="cards starting-cards">
      <div class="card"><small>Inicio</small><strong>${esc(v.started_on||'—')}</strong></div>
      <div class="card"><small>Odómetro inicial</small><strong>${fmt(v.odometer_initial)} km</strong></div>
      <div class="card"><small>Efectivo declarado</small><strong>${currency(v.opening_cash||0)}</strong></div>
      <div class="card"><small>Billetera inicial</small><strong>${currency(v.opening_wallet||0)}</strong></div>
    </div>
  </section>
  <section class="panel"><h2>Datos del vehículo</h2>
    <p class="help">Puedes corregir los datos del vehículo. El odómetro inicial se bloquea después de guardar jornadas; los importes iniciales se bloquean al registrar movimientos.</p>
    ${form('carform',
     field('Marca','brand','text',`value="${esc(v.brand)}" required maxlength="70"`)+
     field('Modelo','model','text',`value="${esc(v.model)}" required maxlength="70"`)+
     field('Año','year','number',`min="1950" max="2100" value="${esc(v.year)}" required`)+
     field('Odómetro inicial (km)','odometer_initial','number',`min="0" step="0.1" value="${esc(v.odometer_initial)}" required ${db.shifts.length?'readonly':''}`)+
     field('Efectivo inicial (S/)','opening_cash','number',`step="0.01" min="0" value="${esc(v.opening_cash||0)}" required ${locked?'readonly':''}`)+
     field('Saldo inicial de apps (S/)','opening_wallet','number',`step="0.01" min="0" value="${esc(v.opening_wallet||0)}" required ${locked?'readonly':''}`)+
     field('Meta de ingresos por km (S/)','target_per_km','number',`step="0.01" min="0.01" value="${esc(v.target_per_km||2)}" required`),
     'Guardar cambios')}
  </section>
  <section class="panel"><h2>Privacidad y copia de seguridad</h2><p class="help">Cada registro pertenece a tu cuenta, protegido por reglas de acceso individuales de Supabase.</p><button id="export" class="btn secondary" type="button">Descargar mis datos (JSON)</button></section>`;
}
function onboardingView(){
  root.innerHTML=`<main class="setup-page"><section class="setup-shell">
    <div class="setup-header"><div class="brand">🚘 Mi Ruta <b>PRO</b></div><button class="btn secondary small" id="setup-signout" type="button">Cerrar sesión</button></div>
    <p class="step-indicator">CONFIGURACIÓN INICIAL · UNA SOLA VEZ</p>
    <h1>¿Con cuánto comienzas tu ruta?</h1>
    <p class="muted">Deja listo tu punto de partida. No necesitas cargar datos antiguos ni registrar cada viaje. Cuando termines de trabajar, cerrarás tu día en un minuto.</p>
    <div class="setup-steps"><div><strong>1</strong> Cuenta creada</div><div class="current"><strong>2</strong> Punto de partida</div><div><strong>3</strong> Primera jornada</div></div>
    <form id="setupform" class="fields setup-fields">
      <div class="wide setup-heading">Tus datos</div>
      <div class="wide"><label for="setup-name">¿Cómo te llamas?</label><input id="setup-name" name="display_name" type="text" maxlength="100" placeholder="Tu nombre" autocomplete="name" required /></div>
      <div class="wide setup-heading">Tu vehículo</div>
      <div><label for="setup-brand">Marca</label><input id="setup-brand" name="brand" type="text" maxlength="70" placeholder="Ej. Toyota" required /></div>
      <div><label for="setup-model">Modelo</label><input id="setup-model" name="model" type="text" maxlength="70" placeholder="Ej. Yaris" required /></div>
      <div><label for="setup-year">Año</label><input id="setup-year" name="year" type="number" min="1950" max="2100" value="${new Date().getFullYear()}" required /></div>
      <div><label for="setup-date">Fecha en que empiezas</label><input id="setup-date" name="started_on" type="date" value="${today()}" required /></div>
      <div class="wide"><label for="setup-odometer">¿Cuántos kilómetros marca tu carro ahora?</label><input id="setup-odometer" name="odometer_initial" type="number" min="0" step="0.1" placeholder="Ej. 32 450" required/><p class="help">Esta lectura es la referencia para calcular todo el kilometraje posterior. No se registra como una jornada.</p></div>
      <div class="wide setup-heading">Dinero con el que comienzas</div>
      <div><label for="setup-cash">Efectivo disponible (S/)</label><input id="setup-cash" name="opening_cash" type="number" step="0.01" min="0" value="0" required/></div>
      <div><label for="setup-wallet">Saldo en apps o billetera (S/)</label><input id="setup-wallet" name="opening_wallet" type="number" step="0.01" min="0" value="0" required/></div>
      <p class="help wide">Son saldos iniciales declarados, no ingresos de trabajo. Si prefieres no controlar una billetera, déjala en S/ 0. No calcularemos un saldo actual ficticio.</p>
      <details class="wide extras"><summary>Personalizar mi meta (opcional)</summary><label for="setup-target">Meta por km trabajado (S/)</label><input id="setup-target" name="target_per_km" type="number" step="0.01" min="0.01" value="2" required/><p class="help">Puedes modificar esta meta después.</p></details>
      <div class="wide"><button type="submit" class="btn big setup-submit">Guardar y empezar a trabajar</button><p class="help" id="setupstatus" role="status" aria-live="polite"></p></div>
    </form>
    <div class="setup-note">🔒 Estos datos pertenecen únicamente a tu cuenta. Podrás añadir tus pagos y préstamos después, sin que afecten tus ganancias iniciales.</div>
  </section></main>`;
  $('#setup-signout').onclick=async()=>{await sb.auth.signOut();user=null;db=Object.fromEntries(Object.keys(db).map(k=>[k,[]]));signupMode=false;render()};
  $('#setupform').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,btn=form.querySelector('[type=submit]'),status=$('#setupstatus');
    btn.disabled=true;status.textContent='Guardando tu punto de partida...';
    try {await saveOnboarding(Object.fromEntries(new FormData(form)));}catch(err){status.textContent=String(err.message||err)}finally{btn.disabled=false}
  };
}
async function saveOnboarding(v){
  if(!sb||!user)throw Error('Debes iniciar sesión.');
  const name=String(v.display_name||'').trim(),brand=String(v.brand||'').trim(),model=String(v.model||'').trim();
  const year=Number(v.year),km=Number(v.odometer_initial),cash=Number(v.opening_cash),wallet=Number(v.opening_wallet),target=Number(v.target_per_km);
  if(!name||!brand||!model||name.length>100||brand.length>70||model.length>70||
     !Number.isInteger(year)||year<1950||year>2100||[km,cash,wallet].some(n=>!Number.isFinite(n)||n<0)||
     !Number.isFinite(target)||target<=0||!v.started_on) throw Error('Completa correctamente el vehículo, odómetro y saldos iniciales.');
  const {error}=await sb.rpc('initialize_driver',{
    p_display_name:name,p_brand:brand,p_model:model,p_year:year,
    p_odometer_initial:km,p_opening_cash:cash,p_opening_wallet:wallet,
    p_target_per_km:target,p_started_on:v.started_on
  });
  if(error)throw Error(error.message);
  page='inicio';await refresh();
}
function render(){
 if(!user){loginView();return}
 if(!demo&&!db.vehicles.length){onboardingView();return}
 shell();
 if(dataError)$('#db-warning').innerHTML=`<div class="notice">${esc(dataError)}</div>`;
 const content=$('#content');
 content.innerHTML=({inicio:dashboard,cierre:quickClose,jornadas:journeys,movimientos:movements,combustible:fuel,
 analisis:()=>`<section class="panel"><div class="charttitle"><h2>Ganancia neta por día · solo cierres diarios</h2><span class="tag">Mis jornadas</span></div>${weekdayAnalysis()}</section>`,
 metas:goals,pagos:paymentPlan,mantenimiento:maint,configuracion:config})[page]();
 document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{page=b.dataset.go;render()});
 wireDeletes();wireQuick();wireMovementCategory();wireDebtActions();
 const forms={quickform:saveQuick,shiftform:saveShift,moveform:saveMove,fuelform:saveFuel,goalform:saveGoal,debtform:saveDebt,maintform:saveMaint,carform:saveCar};
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
async function saveCar(v){
  const current=userCar();
  const payload={
    brand:String(v.brand||'').trim(),model:String(v.model||'').trim(),year:Number(v.year),
    odometer_initial:Number(v.odometer_initial),target_per_km:toNum(v.target_per_km),
    opening_cash:toNum(v.opening_cash),opening_wallet:toNum(v.opening_wallet)
  };
  if(!current)throw Error('Primero completa la configuración inicial.');
  if(!payload.brand||!payload.model||payload.year<1950||payload.year>2100||
    !Number.isFinite(payload.odometer_initial)||payload.odometer_initial<0||
    !Number.isFinite(payload.opening_cash)||payload.opening_cash<0||
    !Number.isFinite(payload.opening_wallet)||payload.opening_wallet<0||
    payload.target_per_km<=0)throw Error('Revisa los datos del vehículo.');
  if(db.shifts.length&&payload.odometer_initial!==Number(current.odometer_initial))
    throw Error('No se puede cambiar el odómetro inicial después de registrar jornadas.');
  const locked=db.shifts.length>0||db.movements.length>0||db.fuel.length>0||db.debt_actions.length>0;
  if(locked&&(payload.opening_cash!==Number(current.opening_cash)||payload.opening_wallet!==Number(current.opening_wallet)))
    throw Error('Los saldos iniciales se bloquean después de registrar movimientos.');
  const {error}=await sb.from('vehicles').update(payload).eq('id',current.id).eq('user_id',user.id);
  if(error)throw error;
}
init();
