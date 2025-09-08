este es mi admin/app.js
// /admin/app.js  — Admin completo + CRUD de Artículos con modal accesible
import {
// Reportes / Cobros (solo se usan reportes aquí)
getOrdersRange,

// Inventario / Compras / Proveedores
subscribeInventory,
subscribeSuppliers,
recordPurchase,
upsertSupplier,
upsertInventoryItem,

// Productos (solo lectura) + refresco de catálogo para kiosko
subscribeProducts,
fetchCatalogWithFallback,

// Happy Hour
setHappyHour,
subscribeHappyHour,

// Recetario / Producción
subscribeRecipes,
produceBatch,
adjustStock,
subscribeSettings,

// Artículos (nuevo módulo)
subscribeArticles,
upsertArticle,
deleteArticle
} from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

/* ---------------- Tabs ---------------- */
const tabs = document.getElementById('admTabs') || document;
tabs.addEventListener('click', (e) => {
const t = e.target.closest('.tab'); if (!t) return;
tabs.querySelectorAll('.tab').forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-selected','false'); });
t.classList.add('is-active'); t.setAttribute('aria-selected','true');
const target = t.dataset.tab;
document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
document.getElementById('panel-' + target).classList.add('active');
});

/* ============== Reportes ============== */
const fromEl = document.getElementById('repFrom');
const toEl   = document.getElementById('repTo');
const typeEl = document.getElementById('repType');
const histEl = document.getElementById('repHist');
document.getElementById('btnRepGen')?.addEventListener('click', runReports);

const today = new Date(); const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
if (fromEl && toEl) {
fromEl.value = weekAgo.toISOString().slice(0, 10);
toEl.value   = today.toISOString().slice(0, 10);
}

async function runReports() {
try {
const from = new Date((fromEl?.value||'') + 'T00:00:00');
const to   = new Date((toEl?.value||'')   + 'T23:59:59');
const type = typeEl?.value || 'all'; // all|pickup|dinein
const includeArchive = (histEl?.value !== 'No');

const orders = await getOrdersRange({ from, to, includeArchive, orderType: type === 'all' ? null : type });  
const agg = aggregateOrders(orders);  

setTxt('kpiOrders', agg.orders);  
setTxt('kpiUnits', agg.units);  
setMoney('kpiRevenue', agg.revenue);  
setMoney('kpiAvg', agg.avgTicket);  

fillTable('tblTop', agg.topItems);  
fillTable('tblLow', agg.lowItems);  

const rows = agg.byHour.map(h =>  
  `<tr><td>${h.hour}:00</td><td>${h.orders}</td><td>${fmtMoney(h.revenue)}</td></tr>`  
).join('');  
q('#tblHours tbody').innerHTML = rows || '<tr><td colspan="3">—</td></tr>';  

toast('Reporte listo');

} catch (e) {
console.error(e); toast('No se pudo generar el reporte');
}
}

function aggregateOrders(orders) {
const ordersCount = orders.length;
const revenue = orders.reduce((a, o) => a + (o.subtotal || 0), 0);
const units = orders.reduce((a, o) => a + (o.items || []).reduce((s, i) => s + (i.qty || 1), 0), 0);
const avgTicket = ordersCount ? revenue / ordersCount : 0;

const map = new Map();
orders.forEach(o => (o.items || []).forEach(i => {
const key = i.name || i.id;
const prev = map.get(key) || { name: key, units: 0, revenue: 0 };
prev.units += (i.qty || 1);
prev.revenue += (i.lineTotal || (i.unitPrice || 0) * (i.qty || 1));
map.set(key, prev);
}));
const arr = [...map.values()];
const topItems = arr.slice().sort((a, b) => b.units - a.units).slice(0, 5);
const lowItems = arr.slice().sort((a, b) => a.units - b.units).slice(0, 5);

const by = {};
orders.forEach(o => {
const t = o.createdAt?.toDate?.() || o.createdAt || new Date();
const h = new Date(t).getHours();
const k = String(h).padStart(2, '0');
by[k] ||= { hour: k, orders: 0, revenue: 0 };
by[k].orders += 1;
by[k].revenue += (o.subtotal || 0);
});
const byHour = Object.values(by).sort((a, b) => a.hour.localeCompare(b.hour));

return { orders: ordersCount, revenue, units, avgTicket, topItems, lowItems, byHour };
}

function fillTable(id, arr) {
const tb = q('#' + id + ' tbody');
tb.innerHTML = (arr && arr.length)
? arr.map(r => <tr><td>${esc(r.name)}</td><td>${r.units}</td><td>${fmtMoney(r.revenue)}</td></tr>).join('')
: '<tr><td colspan="3">—</td></tr>';
}

/* ============== Inventario (suscripción) ============== */
const invRows = [];
const invMap  = new Map();
subscribeInventory(items => {
invRows.length = 0; invRows.push(...items);
invMap.clear(); items.forEach(it => invMap.set(it.id, it));
renderInventoryTable();
renderRecipeTable(); // refresca nombres en recetario
});
q('#btnInvRefresh')?.addEventListener('click', renderInventoryTable);
q('#invSearch')?.addEventListener('input', renderInventoryTable);
function renderInventoryTable() {
const qstr = (q('#invSearch')?.value || '').toLowerCase();
const tb = q('#tblInv tbody');
const rows = invRows
.filter(x => x.name.toLowerCase().includes(qstr))
.map(i => <tr>   <td>${esc(i.name)}</td>   <td>${Number(i.currentStock ?? 0).toFixed(2)}</td>   <td>${esc(i.unit || '-')}</td>   <td>${fmtMoney(i.costAvg || 0)}</td>   <td>${fmtMoney((i.currentStock || 0) * (i.costAvg || 0))}</td>   </tr>).join('');
tb.innerHTML = rows || '<tr><td colspan="5">—</td></tr>';
}

/* ============== Compras ============== */
const btnAddPurchase = document.getElementById('btnAddPurchase');
btnAddPurchase && (btnAddPurchase.onclick = async () => {
const name = (q('#pName')?.value || '').trim();
const qty  = Number(q('#pQty')?.value || 0);
const cost = Number(q('#pCost')?.value || 0);
const supplierId = (q('#pVendor')?.value || '').trim() || null; // opcional
if (!name || qty <= 0 || cost <= 0) {
toast('Completa ingrediente, cantidad y costo');
return;
}

try {
// 1) Buscar item existente por nombre (insensible a mayúsculas)
const norm = (s)=> String(s||'').trim().toLowerCase();
const found = invRows.find(it => norm(it.name) === norm(name));

// 2) Crear si no existe  
let itemId = found?.id;  
if (!itemId) {  
  itemId = await upsertInventoryItem({  
    name, unit: 'unit', currentStock: 0, min: 0, max: 0, perish: false  
  });  
  toast('Ingrediente nuevo creado en inventario');  
}  

// 3) Registrar compra + abonar stock  
await recordPurchase({ itemId, qty, unitCost: cost, supplierId });  

// 4) Reset UI  
if (q('#pQty'))  q('#pQty').value = '1';  
if (q('#pCost')) q('#pCost').value = '0';  
toast('Compra registrada');

} catch (e) {
console.error(e);
toast('Error al registrar compra');
}
});

/* ============== Proveedores ============== */
subscribeSuppliers(renderVendors);
q('#btnSaveVendor')?.addEventListener('click', async () => {
const name = (q('#vName')?.value || '').trim();
const contact = (q('#vContact')?.value || '').trim();
if (!name) { toast('Nombre del proveedor requerido'); return; }
try { await upsertSupplier({ name, contact }); toast('Proveedor guardado'); }
catch (e) { console.error(e); toast('Error al guardar proveedor'); }
});
function renderVendors(arr = []) {
const tb = q('#tblVendors tbody');
tb.innerHTML = arr.map(v => <tr><td>${esc(v.name)}</td><td>${esc(v.contact || '-')}</td><td>${v.id}</td></tr>).join('') || '<tr><td colspan="3">—</td></tr>';
}

/* ============== Productos (solo lectura) ============== */
subscribeProducts(renderProducts);
function renderProducts(items = []) {
const tb = q('#tblProducts tbody');
tb.innerHTML = items.map(p =>
<tr><td>${esc(p.name)}</td><td>${esc(p.type)}</td><td>${fmtMoney(p.price)}</td><td>${p.active ? 'Sí' : 'No'}</td><td>${p.id}</td></tr>
).join('') || '<tr><td colspan="5">—</td></tr>';
}
// Botón “Refrescar catálogo del kiosko”
document.getElementById('btnReloadCatalog')?.addEventListener('click', async ()=>{
try{
await fetchCatalogWithFallback(); // fuerza lectura actual de catálogo
toast('Catálogo recargado para el kiosko');
}catch(e){
console.error(e);
toast('No se pudo recargar el catálogo');
}
});

/* ============== Happy Hour (duración, fin y countdown) ============== */
let HH_TIMER = null;

subscribeHappyHour(hh => {
// Campos básicos (existentes)
if (q('#hhEnabled')) q('#hhEnabled').value = hh?.enabled ? 'on' : 'off';
if (q('#hhDisc'))    q('#hhDisc').value    = Number(hh?.discountPercent || 0);
if (q('#hhMsg'))     q('#hhMsg').value     = hh?.bannerText || '';

// Opcionales: fin programado y countdown
const endsAt = Number(hh?.endsAt || 0) || null;

// #hhEndsAt puede ser input datetime-local o text; ponemos ISO local si existe
const endsEl = q('#hhEndsAt');
if (endsEl){
if (endsAt){
const d = new Date(endsAt);
// Para <input type="datetime-local"> formateamos YYYY-MM-DDTHH:mm
const iso = ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')};
endsEl.value = iso;
endsEl.title = d.toLocaleString();
}else{
endsEl.value = '';
endsEl.title = '';
}
}

// Countdown en #hhCountdown (si existe)
const lbl = q('#hhCountdown');
if (HH_TIMER){ clearInterval(HH_TIMER); HH_TIMER = null; }
if (lbl){
if (hh?.enabled && endsAt && endsAt > Date.now()){
const tick = ()=>{
const ms = endsAt - Date.now();
if (ms <= 0){
lbl.textContent = 'Finalizó';
clearInterval(HH_TIMER); HH_TIMER = null;
return;
}
const m = Math.floor(ms/60000);
const s = Math.floor((ms%60000)/1000);
lbl.textContent = Termina en ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')};
};
tick();
HH_TIMER = setInterval(tick, 1000);
}else{
lbl.textContent = hh?.enabled ? 'Activo' : 'Inactivo';
}
}
});

// Guardar HH (usa durationMin o endsAt si están presentes)
q('#btnSaveHappy')?.addEventListener('click', async () => {
const enabled = q('#hhEnabled')?.value === 'on';
const discountPercent = Number(q('#hhDisc')?.value || 0);
const bannerText = (q('#hhMsg')?.value || '').trim();

// Opcionales
const durMinEl = q('#hhDurMin');
const endsEl   = q('#hhEndsAt');

const patch = { enabled, discountPercent, bannerText };

// Si hay duración numérica y HH habilitado, la usamos
const durMin = durMinEl ? Number(durMinEl.value||0) : 0;
if (enabled && Number.isFinite(durMin) && durMin > 0){
patch.durationMin = durMin;
} else if (enabled && endsEl && endsEl.value){
// Si hay fecha/hora de fin válida, la usamos
const t = new Date(endsEl.value);
if (!isNaN(t.getTime())) patch.endsAt = t.getTime();
}

try {
await setHappyHour(patch);
toast('Happy Hour guardada');
} catch (e) {
console.error(e); toast('No se pudo guardar HH');
}
});

// Acciones rápidas (opcionales: solo si existen los botones)
q('#btnHH30')?.addEventListener('click', ()=> quickHH(30));
q('#btnHH60')?.addEventListener('click', ()=> quickHH(60));
q('#btnHH90')?.addEventListener('click', ()=> quickHH(90));
q('#btnHHStop')?.addEventListener('click', async ()=>{
try{
await setHappyHour({ enabled:false, discountPercent: Number(q('#hhDisc')?.value||0), bannerText:(q('#hhMsg')?.value||'') });
toast('Happy Hour desactivada');
}catch(e){ console.error(e); toast('No se pudo desactivar'); }
});
q('#btnHHExtend15')?.addEventListener('click', async ()=>{
// Extiende 15 min desde ahora o desde endsAt vigente
try{
const disc = Number(q('#hhDisc')?.value||0);
const msg  = (q('#hhMsg')?.value||'');
await setHappyHour({ enabled:true, discountPercent: disc, bannerText: msg, durationMin: 15 });
toast('Extendido 15 min');
}catch(e){ console.error(e); toast('No se pudo extender'); }
});
async function quickHH(mins){
try{
const disc = Number(q('#hhDisc')?.value||0);
const msg  = (q('#hhMsg')?.value||'');
await setHappyHour({ enabled:true, discountPercent: disc, bannerText: msg, durationMin: mins });
toast(Happy Hour por ${mins} min);
}catch(e){ console.error(e); toast('No se pudo activar'); }
}

/* ============== Ajustes app para vasitos 2oz ============== */
let APP_SETTINGS = {};
subscribeSettings(s => { APP_SETTINGS = s || {}; });

/* ============== RECETARIO (LISTADO + MODAL) ============== */
let RECIPES = [];
subscribeRecipes(list => {
RECIPES = list || [];
renderRecipeTable();
});
q('#rcpSearch')?.addEventListener('input', renderRecipeTable);

function renderRecipeTable(){
const tb = q('#tblRecipes tbody'); if (!tb) return;
const term = (q('#rcpSearch')?.value || '').toLowerCase().trim();
const rows = (RECIPES||[])
.filter(r=>{
if(!term) return true;
const name = (r.name||'').toLowerCase();
const ing  = (r.ingredients||[]).map(i=> (invMap.get(i.itemId)?.name || i.itemId)).join(' ').toLowerCase();
return name.includes(term) || ing.includes(term);
})
.map(r=>{
const outName = invMap.get(r.outputItemId)?.name || r.outputItemId || '—';
const count = (r.ingredients||[]).length;
return <tr data-id="${r.id}">   <td><b>${esc(r.name||'Receta')}</b></td>   <td>${Number(r.yieldQty||0)} ${esc(r.yieldUnit||'ml')}</td>   <td>${esc(outName)}</td>   <td>${count}</td>   <td class="right"><button class="btn small ghost" data-a="view">Ver</button></td>   </tr>;
}).join('');
tb.innerHTML = rows || '<tr><td colspan="5">—</td></tr>';
}

document.addEventListener('click', (e)=>{
const btn = e.target.closest('#tblRecipes [data-a="view"]'); if(!btn) return;
const tr  = btn.closest('tr'); const id = tr?.dataset?.id;
const r   = RECIPES.find(x=>x.id===id); if(!r) return;
openRecipeModal(r);
});

/* ---- Modal de receta ---- */
const rcpModal = document.getElementById('rcpModal');
document.getElementById('rcpClose')?.addEventListener('click', ()=> rcpModal.style.display='none');

let CURRENT_R = null;
let CURRENT_OUT_QTY = 100;

function scaleIngredients(r, outQty){
const base = Number(r.yieldQty||0) || 1;
const factor = Number(outQty)/base;
return (r.ingredients||[]).map(ing => ({
...ing,
qtyScaled: Number(ing.qty||0)*factor,
}));
}

function renderRecipeModal(){
if(!CURRENT_R) return;
const outItem = invMap.get(CURRENT_R.outputItemId)?.name || CURRENT_R.outputItemId || '—';
const list = scaleIngredients(CURRENT_R, CURRENT_OUT_QTY);
const body = document.getElementById('rcpBody');
const hint = document.getElementById('rcpHint');

body.innerHTML = `
<div class="field"><label>Receta</label>
<div><b>${esc(CURRENT_R.name||'Receta')}</b></div>
<div class="muted small">Rinde base: ${Number(CURRENT_R.yieldQty||0)} ${esc(CURRENT_R.yieldUnit||'ml')}</div>
<div class="muted small">Producto terminado: ${esc(outItem)}</div>
</div>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px">  
  <div class="field">  
    <label>Porción (ml)</label>  
    <input id="rcpOutQty" type="number" min="10" step="10" value="${CURRENT_OUT_QTY}"/>  
  </div>  
  <div class="field">  
    <label>Vasos 2oz usados (opcional)</label>  
    <input id="rcpCups" type="number" min="0" step="1" placeholder="0"/>  
    <div class="muted small">Si configuraste <code>sauceCupItemId</code> en settings, se descuentan.</div>  
  </div>  
  <div class="field">  
    <label>Guardar para almacenar</label>  
    <select id="rcpStore"><option value="no">No</option><option value="si">Sí</option></select>  
  </div>  
  <div class="field">  
    <label>Cantidad almacenada (ml)</label>  
    <input id="rcpStoreQty" type="number" min="0" step="10" value="${CURRENT_OUT_QTY}"/>  
  </div>  
</div>  

<div class="field"><label>Ingredientes escalados</label>  
  <div style="max-height:320px; overflow:auto; border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:8px">  
    ${list.map(ing=>{  
      const name = invMap.get(ing.itemId)?.name || ing.itemId;  
      const unit = ing.unit || 'ml';  
      return `<div class="row" style="gap:8px; justify-content:space-between">  
        <div style="min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(name)}</div>  
        <div>${ing.qtyScaled.toFixed(1)} ${esc(unit)}</div>  
      </div>`;  
    }).join('')}  
  </div>  
</div>

;   hint.textContent = Salida: ${CURRENT_OUT_QTY} ml`;
document.getElementById('rcpTitle').textContent = CURRENT_R.name || 'Receta';
}

function openRecipeModal(r){
CURRENT_R = r;
CURRENT_OUT_QTY = Number(document.getElementById('rcpQuickPort')?.value || 100);
rcpModal.style.display='grid';
renderRecipeModal();
}

// Botones rápidos del modal
document.getElementById('rcpScale500')?.addEventListener('click', ()=>{ CURRENT_OUT_QTY=500; renderRecipeModal(); });
document.getElementById('rcpScale250')?.addEventListener('click', ()=>{ CURRENT_OUT_QTY=250; renderRecipeModal(); });
document.getElementById('rcpScale200')?.addEventListener('click', ()=>{ CURRENT_OUT_QTY=200; renderRecipeModal(); });
document.getElementById('rcpScale100')?.addEventListener('click', ()=>{ CURRENT_OUT_QTY=100; renderRecipeModal(); });

// Input manual en el modal
document.getElementById('rcpBody')?.addEventListener('input', (e)=>{
if (e.target && e.target.id==='rcpOutQty'){
const v = Number(e.target.value||0);
CURRENT_OUT_QTY = Math.max(10, v||10);
renderRecipeModal();
}
});

/* Preparar lote desde el modal */
document.getElementById('rcpPrepare')?.addEventListener('click', async ()=>{
if (!CURRENT_R) return;
const outQty = Number(document.getElementById('rcpOutQty')?.value || CURRENT_OUT_QTY || 0);
if (!outQty || outQty<=0){ toast('Indica cantidad de salida en ml'); return; }

try{
await produceBatch({ recipeId: CURRENT_R.id, outputQty: outQty });

const cups = Number(document.getElementById('rcpCups')?.value || 0);  
const cupId = APP_SETTINGS?.sauceCupItemId || null;  
if (cupId && cups>0){  
  await adjustStock(cupId, -cups, 'use', { reason:'sauce_cups', recipeId: CURRENT_R.id, outQty });  
}  

const store = (document.getElementById('rcpStore')?.value === 'si');  
const storeQty = Number(document.getElementById('rcpStoreQty')?.value || 0);  
if (store && CURRENT_R.outputItemId){  
  await adjustStock(CURRENT_R.outputItemId, 0, 'production_meta', {  
    recipeId: CURRENT_R.id, stored: true, storedQtyMl: storeQty, outputQtyMl: outQty  
  });  
}  

toast('Lote preparado');  
document.getElementById('rcpClose')?.click();

}catch(e){
console.error(e);
toast('No se pudo preparar el lote');
}
});

/* ============== ARTÍCULOS (CRUD con modal) ============== */
let ARTICLES = [];
let ART_SORT = { by: 'name', dir: 'asc' };
let ART_FILTER = '';

subscribeArticles(arr => {
ARTICLES = Array.isArray(arr) ? arr : [];
renderArticles();
});

const btnAddArticulo = document.getElementById('btnAddArticulo');
btnAddArticulo?.addEventListener('click', () => openArticleModal());

document.addEventListener('input', (e)=>{
const input = e.target.closest('#artSearch');
if (!input) return;
ART_FILTER = String(input.value||'').toLowerCase().trim();
renderArticles();
});

document.addEventListener('click', async (e)=>{
// Acciones de tabla
const btn = e.target.closest('#tblArticulos [data-a]');
if (btn){
const id = btn.dataset.id;
const a  = ARTICLES.find(x=>x.id===id);
const act = btn.dataset.a;

if (act === 'edit') { openArticleModal(a); return; }  
if (act === 'dup')  { if(a) duplicateArticle(a); return; }  
if (act === 'del')  { if(a) confirmDeleteArticle(a); return; }  
if (act === 'toggle'){  
  try {  
    await upsertArticle({ ...a, active: !a?.active });  
    toast(a?.active ? 'Artículo desactivado' : 'Artículo activado');  
  } catch(err){ console.error(err); toast('No se pudo actualizar activo'); }  
  return;  
}

}

// Ordenamiento por encabezados
const th = e.target.closest('#tblArticulos thead [data-sort]');
if (th){
const by = th.dataset.sort;
if (ART_SORT.by === by){ ART_SORT.dir = (ART_SORT.dir==='asc'?'desc':'asc'); }
else { ART_SORT.by = by; ART_SORT.dir = 'asc'; }
renderArticles();
}
});

function renderArticles(){
const tb = q('#tblArticulos tbody'); if (!tb) return;

let rows = ARTICLES.slice();

// Filtro
if (ART_FILTER){
rows = rows.filter(a=>{
const hay = (a.name||'') + ' ' + (a.desc||'');
return hay.toLowerCase().includes(ART_FILTER);
});
}

// Orden
rows.sort((a,b)=>{
const dir = ART_SORT.dir==='asc'?1:-1;
const va = (ART_SORT.by==='price') ? Number(a.price||0) :
(ART_SORT.by==='active')? (a.active?1:0) :
String(a.name||'').toLowerCase();
const vb = (ART_SORT.by==='price') ? Number(b.price||0) :
(ART_SORT.by==='active')? (b.active?1:0) :
String(b.name||'').toLowerCase();
if (va<vb) return -1dir; if (va>vb) return 1dir; return 0;
});

tb.innerHTML = rows.map(a =>   <tr>   <td style="min-width:180px">${esc(a.name||'—')}<div class="muted small">${esc(a.desc||'')}</div></td>   <td>${fmtMoney(a.price||0)}</td>   <td>${a.active ? 'Sí' : 'No'}</td>   <td class="right" style="white-space:nowrap;gap:6px">   <button class="btn small ghost" data-a="toggle" data-id="${a.id}">${a.active?'Desactivar':'Activar'}</button>   <button class="btn small" data-a="edit" data-id="${a.id}">Editar</button>   <button class="btn small ghost" data-a="dup"  data-id="${a.id}">Duplicar</button>   <button class="btn small danger" data-a="del"  data-id="${a.id}">Eliminar</button>   </td>   </tr>  ).join('') || '<tr><td colspan="4">—</td></tr>';

// Encabezados con sort (si no existen, los agregamos una vez)
const thead = q('#tblArticulos thead tr');
if (thead && !thead.querySelector('[data-sort]')) {
thead.innerHTML =   <th data-sort="name"   style="cursor:pointer">Nombre</th>   <th data-sort="price"  style="cursor:pointer">Precio</th>   <th data-sort="active" style="cursor:pointer">Activo</th>   <th>Acciones</th>  ;
}
}

/* ---- Modal de Artículo (crea/edita) ---- */
function openArticleModal(article = null){
const isEdit = !!(article && article.id);
const data = {
id: article?.id || null,
name: article?.name || '',
price: Number(article?.price || 0),
active: article?.active ?? true,
desc: article?.desc || ''
};

// contenedor modal
const wrap = document.createElement('div');
wrap.className = 'modal';
wrap.setAttribute('role','dialog');
wrap.setAttribute('aria-modal','true');
wrap.style.display = 'grid';
wrap.innerHTML =   <div class="modal-card">   <div class="modal-head">   <div>${isEdit? 'Editar artículo' : 'Nuevo artículo'}</div>   <button class="btn ghost small" id="aClose" aria-label="Cerrar">Cerrar</button>   </div>   <div class="modal-body">   <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:8px">   <div class="field">   <label>Nombre <span class="muted small">*</span></label>   <input id="aName" type="text" placeholder="Nombre" value="${escAttr(data.name)}" required/>   <div class="muted small" id="aNameErr" style="color:#ffb4b4;display:none">Requerido</div>   </div>   <div class="field">   <label>Precio</label>   <input id="aPrice" type="number" min="0" step="0.01" value="${String(data.price)}"/>   </div>   <div class="field">   <label>Activo</label>   <select id="aActive">   <option value="on" ${data.active?'selected':''}>Sí</option>   <option value="off" ${!data.active?'selected':''}>No</option>   </select>   </div>   </div>   <div class="field">   <label>Descripción</label>   <textarea id="aDesc" placeholder="Opcional">${escHtml(data.desc)}</textarea>   </div>   </div>   <div class="modal-foot">   <div class="total-bar">   <div></div>   <div class="row" style="gap:8px">   ${isEdit ?<button class="btn ghost danger" id="aDelete">Eliminar</button>:''}   <button class="btn" id="aSave">Guardar</button>   </div>   </div>   </div>   </div>   ;
document.body.appendChild(wrap);

const $ = (id)=> wrap.querySelector(id);
const close = ()=>{ wrap.remove(); };
$('#aClose')?.addEventListener('click', close);
wrap.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
setTimeout(()=> $('#aName')?.focus(), 0);

// Validación simple
function validate(){
const name = $('#aName')?.value.trim();
const ok = !!name;
$('#aNameErr').style.display = ok ? 'none' : '';
return ok;
}
wrap.addEventListener('input', (e)=>{
if (e.target.id === 'aName') validate();
});

async function save(){
if (!validate()){ beep(); return; }
const payload = {
id: data.id || undefined,
name: $('#aName').value.trim(),
price: Number($('#aPrice').value || 0),
active: $('#aActive').value === 'on',
desc: $('#aDesc').value.trim()
};
try{
await upsertArticle(payload);
toast('Artículo guardado');
close();
}catch(err){
console.error(err);
toast('No se pudo guardar el artículo');
}
}

$('#aSave')?.addEventListener('click', save);
wrap.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } });

if (isEdit){
$('#aDelete')?.addEventListener('click', ()=> confirmDeleteArticle({ id:data.id, name:data.name }));
}
}

async function duplicateArticle(a){
try{
const copy = {
name: (a.name || 'Artículo') + ' (copia)',
price: Number(a.price||0),
active: false,
desc: a.desc || ''
};
await upsertArticle(copy);
toast('Artículo duplicado (quedó inactivo)');
}catch(err){
console.error(err);
toast('No se pudo duplicar');
}
}

function confirmDeleteArticle(article){
if (!article) return;
if (!confirm(¿Eliminar artículo "${article.name}"?)) return;
deleteArticle(article.id)
.then(()=> toast('Artículo eliminado'))
.catch((e)=>{ console.error(e); toast('No se pudo eliminar'); });
}

/* ---------------- helpers ---------------- */
function q(sel){ return document.querySelector(sel); }
function setTxt(id,v){ const el=document.getElementById(id); if(el) el.textContent=String(v); }
function setMoney(id,v){ const el=document.getElementById(id); if(el) el.textContent=fmtMoney(v); }
const fmtMoney = n => '$' + Number(n||0).toFixed(0);
function esc(s=''){
return String(s).replace(/[&<>"']/g, m => ({
'&':'&','<':'<','>':'>','"':'"',''':'''
}[m]));
}
function escAttr(s=''){ return String(s).replace(/"/g, '"'); }
function escHtml(s=''){
return String(s).replace(/[&<>"']/g, m=>({
'&':'&','<':'<','>':'>','"':'"'
}[m]));
}

runReports(); // primer reporte al abrir


