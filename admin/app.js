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

// default: últimos 7 días
const today = new Date(); const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
if (fromEl && toEl) {
  fromEl.value = weekAgo.toISOString().slice(0, 10);
  toEl.value   = today.toISOString().slice(0, 10);
}

async function runReports() {
  try {
    const from = new Date(fromEl.value + 'T00:00:00');
    const to   = new Date(toEl.value   + 'T23:59:59');
    const type = typeEl.value; // all|pickup|dinein
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

/* ============== Compras ============== */
const btnAddPurchase = document.getElementById('btnAddPurchase');
btnAddPurchase && (btnAddPurchase.onclick = async () => {
  const name = (q('#pName').value || '').trim();
  const qty  = Number(q('#pQty').value || 0);
  const cost = Number(q('#pCost').value || 0);
  const vendor = (q('#pVendor')?.value || '').trim();
  if (!name || qty <= 0 || cost <= 0) { toast('Completa ingrediente, cantidad y costo'); return; }

  try {
    // Para registrar compra necesitamos el ID del ítem en inventario.
    // Usaremos el nombre en minúsculas como ID (mismo criterio de db.js para inventory).
    const itemId = name.toLowerCase();
    await recordPurchase({ itemId, qty, unitCost: cost, supplierId: vendor || null });
    toast('Compra registrada');
  } catch (e) { console.error(e); toast('Error al registrar compra'); }
});

/* ============== Inventario ============== */
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

/* ---------------- helpers ---------------- */
function q(sel){ return document.querySelector(sel); }
function setTxt(id,v){ const el=document.getElementById(id); if(el) el.textContent=String(v); }
function setMoney(id,v){ const el=document.getElementById(id); if(el) el.textContent=fmtMoney(v); }
const fmtMoney = n => '$' + Number(n||0).toFixed(0);
const esc = s => String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
// autogenerar un primer reporte al abrir
runReports();
