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
  subscribeSettings
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
    setMoney('kpiUnits', agg.units);
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
subscribeInventory(items => {
  invRows.length = 0; invRows.push(...items);
  renderInventoryTable();
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

/* ============== Compras (CORREGIDO) ============== */
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

    // 3) Registrar compra + abonar stock (recordPurchase ya descuenta/abona vía adjustStock)
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

/* ============== Productos / Combos (solo lectura por ahora) ============== */
subscribeProducts(renderProducts);
function renderProducts(items = []) {
  const tb = q('#tblProducts tbody');
  tb.innerHTML = items.map(p =>
    `<tr><td>${esc(p.name)}</td><td>${esc(p.type)}</td><td>${fmtMoney(p.price)}</td><td>${p.active ? 'Sí' : 'No'}</td><td>${p.id}</td></tr>`
  ).join('') || '<tr><td colspan="5">—</td></tr>';
}

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

/* ============== RECETARIO (nuevo) ============== */
let RECIPES = [];
let CURRENT_RECIPE = null;
let APP_SETTINGS = {};
subscribeSettings(s => { APP_SETTINGS = s || {}; }); // para sauceCupItemId

subscribeRecipes(rows => {
  RECIPES = rows || [];
  const sel = q('#rcRecipe'); if (!sel) return;
  sel.innerHTML = RECIPES.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('') || '<option value="">—</option>';
  if (RECIPES.length && !CURRENT_RECIPE) {
    sel.value = RECIPES[0].id;
    setCurrentRecipe(RECIPES[0]);
  } else if (CURRENT_RECIPE) {
    sel.value = CURRENT_RECIPE.id;
  }
  renderRecipe();
});

q('#rcRecipe')?.addEventListener('change', (e)=>{
  const r = RECIPES.find(x => x.id === e.target.value);
  setCurrentRecipe(r);
  renderRecipe();
});

document.querySelectorAll('[data-portion]')?.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    q('#rcOut').value = btn.getAttribute('data-portion');
    renderRecipe();
  });
});
q('#rcApply')?.addEventListener('click', ()=>{ // aplica custom
  const v = Number(q('#rcCustom').value || 0);
  if (v>0) { q('#rcOut').value = String(v); renderRecipe(); }
});
q('#rcOut')?.addEventListener('input', renderRecipe);

q('#rcMake')?.addEventListener('click', onMakeBatch);

function setCurrentRecipe(r){
  CURRENT_RECIPE = r || null;
  // Mostrar producto de salida
  const outName = q('#rcOutputName');
  const outId   = q('#rcOutputId');
  if (outName) outName.value = r?.outputItemId ? (findInvName(r.outputItemId) || 'Item de inventario') : '—';
  if (outId) outId.textContent = r?.outputItemId || '—';
}

function renderRecipe(){
  const r = CURRENT_RECIPE; if (!r) { fillIngr([]); return; }
  const targetMl = Number(q('#rcOut')?.value || 0);
  const baseYield = Number(r.yieldQty || 0);
  const factor = baseYield ? (targetMl / baseYield) : 0;

  // Ingredientes escalados
  const rows = (r.ingredients || []).map(ing => {
    const qty = Number(ing.qty || 0) * factor;
    return { name: invName(ing.itemId) || ing.itemId, qty, unit: ing.unit || '' };
  });
  fillIngr(rows);

  // Producto de salida (nombre si lo tenemos en el cache invRows)
  const outName = findInvName(r.outputItemId) || 'Producto terminado';
  if (q('#rcOutputName')) q('#rcOutputName').value = outName;
  if (q('#rcOutputId'))   q('#rcOutputId').textContent = r.outputItemId || '—';
}

function fillIngr(arr){
  const tb = q('#rcIngr tbody');
  tb.innerHTML = (arr && arr.length)
    ? arr.map(i => `<tr><td>${esc(i.name)}</td><td>${Number(i.qty||0).toFixed(2)}</td><td>${esc(i.unit||'')}</td></tr>`).join('')
    : '<tr><td colspan="3">—</td></tr>';
}

function invName(id){
  const it = invRows.find(x => x.id === id);
  return it?.name || null;
}
function findInvName(id){
  return invRows.find(x=>x.id===id)?.name || null;
}

async function onMakeBatch(){
  const r = CURRENT_RECIPE;
  if (!r?.id) { toast('Selecciona una receta'); return; }
  const outMl = Number(q('#rcOut')?.value || 0);
  if (!(outMl > 0)) { toast('Ingresa una salida válida (ml)'); return; }

  const cups = Math.max(0, Number(q('#rcCupCount')?.value || 0));       // vasitos 2oz
  const store = (q('#rcStore')?.value === 'si');
  const storeQty = Math.max(0, Number(q('#rcStoreQty')?.value || 0));   // ml almacenados

  try{
    // 1) Ejecuta producción (descuenta ingredientes y abona output)
    await produceBatch({ recipeId: r.id, outputQty: outMl });

    // 2) Si envasó en vasos 2oz, descuenta vasitos del inventario (si está configurado)
    const cupId = APP_SETTINGS?.sauceCupItemId || null;
    if (cupId && cups > 0) {
      await adjustStock(cupId, -cups, 'use', { reason: 'packaging_2oz', recipeId: r.id, outputQtyMl: outMl, cups2oz: cups });
    }

    // 3) Si marcó almacenar, registra metadata (movimiento neutro) sobre el producto de salida
    if (store && r.outputItemId) {
      await adjustStock(r.outputItemId, 0, 'production_meta', {
        recipeId: r.id, stored: true, storedQtyMl: storeQty, outputQtyMl: outMl
      });
    }

    // 4) Limpieza UI
    if (q('#rcCupCount')) q('#rcCupCount').value = '0';
    if (q('#rcStore')) q('#rcStore').value = 'no';
    if (q('#rcStoreQty')) q('#rcStoreQty').value = '0';

    toast('Lote preparado y registrado');
  }catch(e){
    console.error(e);
    toast('No se pudo registrar la producción');
  }
}

/* ---------------- helpers ---------------- */
function q(sel){ return document.querySelector(sel); }
function setTxt(id,v){ const el=document.getElementById(id); if(el) el.textContent=String(v); }
function setMoney(id,v){ const el=document.getElementById(id); if(el) el.textContent=fmtMoney(v); }
const fmtMoney = n => '$' + Number(n||0).toFixed(0);
const esc = s => String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));

runReports(); // genera un primer reporte al abrir
