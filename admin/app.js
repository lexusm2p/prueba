// /admin/app.js  (compatible con tu shared/db.js actual)
import {
  getOrdersRange,
  subscribeInventory,
  subscribeProducts,
  subscribeSuppliers,
  recordPurchase,
  upsertSupplier,
  setHappyHour,
  subscribeHappyHour,
  upsertInventoryItem,
  // === Recetario / Producción ===
  subscribeRecipes,
  produceBatch,
  adjustStock,
  subscribeSettings,
  // === Refresco de catálogo para el botón en Productos ===
  fetchCatalogWithFallback,
} from '../shared/db.js';
import { toast } from '../shared/notify.js';

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
document.getElementById('btnRepGen').onclick = runReports;

const today = new Date(); const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
if (fromEl && toEl) {
  fromEl.value = weekAgo.toISOString().slice(0, 10);
  toEl.value   = today.toISOString().slice(0, 10);
}

async function runReports() {
  try {
    const from = new Date((fromEl.value||'') + 'T00:00:00');
    const to   = new Date((toEl.value||'')   + 'T23:59:59');
    const type = typeEl?.value || 'all'; // all|pickup|dinein
    const includeArchive = (histEl?.value !== 'No');

    const orders = await getOrdersRange({ from, to, includeArchive, orderType: type === 'all' ? null : type });
    const agg = aggregateOrders(orders);

    setTxt('kpiOrders', agg.orders);
    setTxt('kpiUnits', agg.units);            // <- ahora es número, no dinero
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
    ? arr.map(r => `<tr><td>${esc(r.name)}</td><td>${r.units}</td><td>${fmtMoney(r.revenue)}</td></tr>`).join('')
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
    .map(i => `<tr>
      <td>${esc(i.name)}</td>
      <td>${Number(i.currentStock ?? 0).toFixed(2)}</td>
      <td>${esc(i.unit || '-')}</td>
      <td>${fmtMoney(i.costAvg || 0)}</td>
      <td>${fmtMoney((i.currentStock || 0) * (i.costAvg || 0))}</td>
    </tr>`).join('');
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
  const name = (q('#vName').value || '').trim();
  const contact = (q('#vContact').value || '').trim();
  if (!name) { toast('Nombre del proveedor requerido'); return; }
  try { await upsertSupplier({ name, contact }); toast('Proveedor guardado'); }
  catch (e) { console.error(e); toast('Error al guardar proveedor'); }
});
function renderVendors(arr = []) {
  const tb = q('#tblVendors tbody');
  tb.innerHTML = arr.map(v => `<tr><td>${esc(v.name)}</td><td>${esc(v.contact || '-')}</td><td>${v.id}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>';
}

/* ============== Productos (solo lectura) ============== */
subscribeProducts(renderProducts);
function renderProducts(items = []) {
  const tb = q('#tblProducts tbody');
  tb.innerHTML = items.map(p =>
    `<tr><td>${esc(p.name)}</td><td>${esc(p.type)}</td><td>${fmtMoney(p.price)}</td><td>${p.active ? 'Sí' : 'No'}</td><td>${p.id}</td></tr>`
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

/* ============== Happy Hour ============== */
subscribeHappyHour(hh => {
  if (!q('#hhEnabled')) return;
  q('#hhEnabled').value = hh?.enabled ? 'on' : 'off';
  q('#hhDisc').value = Number(hh?.discountPercent || 0);
  q('#hhMsg').value = hh?.bannerText || '';
});
q('#btnSaveHappy')?.addEventListener('click', async () => {
  const enabled = q('#hhEnabled').value === 'on';
  const discountPercent = Number(q('#hhDisc').value || 0);
  const bannerText = (q('#hhMsg').value || '').trim();
  try { await setHappyHour({ enabled, discountPercent, bannerText }); toast('Happy Hour guardada'); }
  catch (e) { console.error(e); toast('No se pudo guardar HH'); }
});

/* ============== Ajustes para vasitos 2oz ============== */
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
      return `<tr data-id="${r.id}">
        <td><b>${esc(r.name||'Receta')}</b></td>
        <td>${Number(r.yieldQty||0)} ${esc(r.yieldUnit||'ml')}</td>
        <td>${esc(outName)}</td>
        <td>${count}</td>
        <td class="right"><button class="btn small ghost" data-a="view">Ver</button></td>
      </tr>`;
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
  `;
  hint.textContent = `Salida: ${CURRENT_OUT_QTY} ml`;
  document.getElementById('rcpTitle').textContent = CURRENT_R.name || 'Receta';
}

function openRecipeModal(r){
  CURRENT_R = r;
  // usa la porción rápida seleccionada (incluye 250 ml)
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
    // 1) Producción principal
    await produceBatch({ recipeId: CURRENT_R.id, outputQty: outQty });

    // 2) Vasitos 2oz (opcional)
    const cups = Number(document.getElementById('rcpCups')?.value || 0);
    const cupId = APP_SETTINGS?.sauceCupItemId || null;
    if (cupId && cups>0){
      await adjustStock(cupId, -cups, 'use', { reason:'sauce_cups', recipeId: CURRENT_R.id, outQty });
    }

    // 3) Meta de almacenamiento (opcional)
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

/* ---------------- helpers ---------------- */
function q(sel){ return document.querySelector(sel); }
function setTxt(id,v){ const el=document.getElementById(id); if(el) el.textContent=String(v); }
function setMoney(id,v){ const el=document.getElementById(id); if(el) el.textContent=fmtMoney(v); }
const fmtMoney = n => '$' + Number(n||0).toFixed(0);
function esc(s=''){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[m]));
}

runReports(); // genera un primer reporte al abrir