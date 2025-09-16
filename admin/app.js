/* ========================================================================== *
 * /admin/app.js
 * Admin completo + Historial + Recetario (validación inversa) + CRUD Artículos
 * + Pestaña TEMAS (preview local + guardar GLOBAL en settings/theme)
 * + Panel “Productos” (CRUD sobre Artículos)
 * Modo PRUEBA integrado (no escribe en Firestore cuando está ON)
 *
 * Requiere: ../shared/db.js, ../shared/notify.js, ../shared/theme.js
 * ========================================================================== */

'use strict';

/* ========================= Imports ========================= */
import {
  // Reportes
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

  // Artículos (base CRUD)
  subscribeArticles,
  upsertArticle,
  deleteArticle,

  // TEMAS
  setTheme,
  subscribeTheme,
} from '../shared/db.js';

import { toast, beep } from '../shared/notify.js';

// 🎨 utilidades de tema (colores/vars CSS, tipografías)
import {
  initThemeFromSettings,
  applyThemeLocal,
  listThemes,
} from '../shared/theme.js';

/* ========================= Utils base ========================= */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const noop = () => {};

const safeNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const clamp = (n, min, max) => Math.min(Math.max(safeNum(n, min), min), max);

const toLocalISO = (d) => {
  const t = (d instanceof Date ? d : new Date(d));
  if (!Number.isFinite(t?.getTime?.())) return '';
  const tz = t.getTimezoneOffset() * 60000;
  return new Date(t - tz).toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm
};
const parseLocalDate = (input, fallback = null) => {
  if (!input) return fallback;
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d : fallback;
};

// Money helpers (2 decimales solo si hay centavos “reales”)
const money = (n) => {
  const x = safeNum(n, 0);
  const hasCents = Math.abs(x % 1) > 0.0001;
  const s = hasCents ? x.toFixed(2) : x.toFixed(0);
  return '$' + s;
};
function setTxt(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v ?? '');
}
function setMoney(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = money(v);
}

// Escapes correctos
function esc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function escAttr(s = '') { return esc(s); }
function escHtml(s = '') { return esc(s); }

// Debounce simple
function debounce(fn, wait = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ========================= Training (PRUEBA) ========================= */
function isTraining() {
  try { return sessionStorage.getItem('training') === '1'; }
  catch { return false; }
}
function setTraining(on) {
  try { sessionStorage.setItem('training', on ? '1' : '0'); } catch {}
  paintTrainingBadge();
  document.title = (on ? '🧪 ' : '') + document.title.replace(/^🧪\s*/, '');
  toast(on ? 'Modo PRUEBA activo (no escribe en Firestore)' : 'Modo PRUEBA desactivado');
}
function paintTrainingBadge() {
  let b = document.getElementById('admTrainingBadge');
  if (!b) {
    b = document.createElement('button');
    b.id = 'admTrainingBadge';
    b.className = 'btn tiny';
    b.type = 'button';
    b.setAttribute('aria-live', 'polite');
    b.setAttribute('title', 'Alternar modo PRUEBA (Ctrl/Cmd+T)');
    Object.assign(b.style, {
      position: 'fixed', left: '14px', bottom: '14px',
      zIndex: 9999, borderRadius: '999px', opacity: .92,
    });
    b.addEventListener('click', () => setTraining(!isTraining()));
    document.body.appendChild(b);
  }
  const on = isTraining();
  b.textContent = on ? 'PRUEBA: ON' : 'PRUEBA: OFF';
  b.classList.toggle('danger', on);
  b.classList.toggle('ghost', !on);
}
document.addEventListener('DOMContentLoaded', paintTrainingBadge);
// Atajo: Ctrl/Cmd+T alterna PRUEBA
document.addEventListener('keydown', (e) => {
  const k = String(e.key || '').toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 't') {
    e.preventDefault();
    setTraining(!isTraining());
  }
});

/* ========================= Tabs ========================= */
const tabs = document.getElementById('admTabs') || document;
tabs.addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;

  $$('.tab', tabs).forEach((b) => {
    b.classList.remove('is-active');
    b.setAttribute?.('aria-selected', 'false');
  });
  t.classList.add('is-active');
  t.setAttribute('aria-selected', 'true');

  const target = t.dataset.tab;
  $$('.panel').forEach((p) => p.classList.remove('active'));
  document.getElementById('panel-' + target)?.classList.add('active');

  if (target === 'hist') {
    startHistAutoRefresh(); loadHistory();
  } else {
    stopHistAutoRefresh();
  }

  if (target === 'recetas') { openQuickPrepDialog(); }
});

/* ========================= Reportes ========================= */
const fromEl = document.getElementById('repFrom');
const toEl   = document.getElementById('repTo');
const typeEl = document.getElementById('repType');
const histEl = document.getElementById('repHist');

document.getElementById('btnRepGen')?.addEventListener('click', runReports);

(function initDefaultReportRange() {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  if (fromEl && toEl) {
    // yyyy-MM-dd (local)
    const d0 = new Date(weekAgo.getFullYear(), weekAgo.getMonth(), weekAgo.getDate());
    const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    fromEl.value = d0.toISOString().slice(0, 10);
    toEl.value   = d1.toISOString().slice(0, 10);
  }
})();

async function runReports() {
  try {
    const from = parseLocalDate((fromEl?.value || '') + 'T00:00:00');
    const to   = parseLocalDate((toEl?.value   || '') + 'T23:59:59');
    const type = typeEl?.value || 'all';
    const includeArchive = (histEl?.value !== 'No');

    const orders = await getOrdersRange({
      from, to, includeArchive,
      orderType: type === 'all' ? null : type,
    }) || [];

    const agg = aggregateOrders(orders);

    setTxt('kpiOrders',   agg.orders);
    setTxt('kpiUnits',    agg.units);
    setMoney('kpiRevenue', agg.revenue);
    setMoney('kpiAvg',     agg.avgTicket);

    fillTable('tblTop', agg.topItems);
    fillTable('tblLow', agg.lowItems);

    const rows = agg.byHour.map(h =>
      `<tr><td>${h.hour}:00</td><td>${h.orders}</td><td>${money(h.revenue)}</td></tr>`
    ).join('');
    const body = $('#tblHours tbody');
    if (body) body.innerHTML = rows || '<tr><td colspan="3">—</td></tr>';

    toast('Reporte listo');
  } catch (e) {
    console.error(e);
    toast('No se pudo generar el reporte');
  }
}

function aggregateOrders(orders = []) {
  const ordersCount = orders.length;
  const revenue = orders.reduce((a, o) => a + safeNum(o.subtotal ?? o.total, 0), 0);
  const units   = orders.reduce((a, o) => a + (o.items || [])
    .reduce((s, i) => s + safeNum(i.qty || 1, 0), 0), 0);
  const avgTicket = ordersCount ? revenue / ordersCount : 0;

  const map = new Map();
  orders.forEach(o => (o.items || []).forEach(i => {
    const key = i.name || i.id || '—';
    const prev = map.get(key) || { name: key, units: 0, revenue: 0 };
    prev.units += safeNum(i.qty || 1, 0);
    const unitPrice = safeNum(i.unitPrice, NaN);
    const lineTotal = ('lineTotal' in i)
      ? safeNum(i.lineTotal, 0)
      : (Number.isFinite(unitPrice) ? unitPrice * safeNum(i.qty || 1, 0) : 0);
    prev.revenue += lineTotal;
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
    by[k].revenue += safeNum(o.subtotal ?? o.total, 0);
  });
  const byHour = Object.values(by).sort((a, b) => a.hour.localeCompare(b.hour));

  return { orders: ordersCount, revenue, units, avgTicket, topItems, lowItems, byHour };
}

function fillTable(id, arr = []) {
  const tb = document.querySelector('#' + id + ' tbody');
  if (!tb) return;
  tb.innerHTML = (arr.length)
    ? arr.map(r =>
      `<tr><td>${esc(r.name)}</td><td>${r.units}</td><td>${money(r.revenue)}</td></tr>`
    ).join('')
    : '<tr><td colspan="3">—</td></tr>';
}

/* ========================= HISTORIAL ========================= */
let HIST_ALL = [];
let HIST_TIMER = null;

const histSearchEl = document.getElementById('histSearch');
const histTypeEl   = document.getElementById('histType');
const histStateEl  = document.getElementById('histState');
const histLimitEl  = document.getElementById('histLimit');

$('#btnHistLoad')?.addEventListener('click', () => loadHistory());
$('#btnHistCSV') ?.addEventListener('click', exportHistoryCSV);
histSearchEl?.addEventListener('input', debounce(renderHistory, 120));
histTypeEl  ?.addEventListener('change', renderHistory);
histStateEl ?.addEventListener('change', renderHistory);
histLimitEl ?.addEventListener('input', renderHistory);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopHistAutoRefresh();
  else if (isHistActive()) startHistAutoRefresh();
});
function isHistActive() {
  return document.getElementById('panel-hist')?.classList.contains('active');
}
function startHistAutoRefresh() {
  stopHistAutoRefresh();
  HIST_TIMER = setInterval(() => {
    if (isHistActive()) loadHistory(false);
  }, 10000);
}
function stopHistAutoRefresh() {
  if (HIST_TIMER) {
    clearInterval(HIST_TIMER);
    HIST_TIMER = null;
  }
}

async function loadHistory(showToast = true) {
  try {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const to   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const includeArchive = ($('#repHist')?.value !== 'No');

    const ords = await getOrdersRange({ from, to, includeArchive, orderType: null }) || [];
    HIST_ALL = (ords || []).map(o => {
      const t = o.createdAt?.toDate?.() || o.createdAt || new Date();
      const when = new Date(t);
      const num = o.number ?? o.orderNumber ?? o.no ?? null;
      const custName = o.customerName ?? o.customer?.name ?? o.client?.name ?? '';
      const phone    = o.customerPhone ?? o.customer?.phone ?? o.client?.phone ?? '';
      const state = (o.state || o.status || '').toString().toUpperCase();
      const type  = (o.orderType || o.type || '').toString().toLowerCase();
      const total = safeNum(o.total ?? o.subtotal, 0);
      const items = (o.items || []).map(i => ({
        name: i.name || i.id || '',
        qty:  safeNum(i.qty || 1, 0),
      }));
      return { id: o.id, _ts: when.getTime(), when, num, custName, phone, state, type, total, items };
    }).sort((a, b) => b._ts - a._ts);

    if (histLimitEl && !histLimitEl.dataset.touched) {
      histLimitEl.value = '5';
    }
    renderHistory();
    if (showToast) toast('Historial actualizado');
  } catch (err) {
    console.error(err);
    toast('No se pudo cargar el historial');
  }
}

function renderHistory() {
  const tb = document.querySelector('#tblHist tbody');
  if (!tb) return;

  const qraw   = (histSearchEl?.value || '').trim();
  const qstr   = qraw.toLowerCase();
  const typeF  = histTypeEl?.value || 'all';
  const stateF = (histStateEl?.value || 'all').toUpperCase();

  if (histLimitEl) histLimitEl.dataset.touched = '1';
  const limit = Math.max(1, safeNum(histLimitEl?.value, 5) || 5);

  const rows = HIST_ALL.filter(o => {
    if (typeF !== 'all' && o.type !== typeF) return false;
    if (stateF !== 'ALL' && o.state !== stateF) return false;
    if (!qstr) return true;

    const id    = (o.id || '').toLowerCase();
    const num   = (o.num == null ? '' : String(o.num)).toLowerCase();
    const name  = (o.custName || '').toLowerCase();
    const phone = (o.phone || '').toLowerCase();
    const type  = (o.type || '').toLowerCase();
    const state = (o.state || '').toLowerCase();
    const items = o.items.map(i => `${i.name} x${i.qty}`).join(' ').toLowerCase();

    if (qraw && /^\d+$/.test(qraw) && num === qraw) return true;
    return id.includes(qstr) || num.includes(qstr) || name.includes(qstr) ||
           phone.includes(qstr) || type.includes(qstr) || state.includes(qstr) ||
           items.includes(qstr);
  }).slice(0, limit);

  const html = rows.map(o => {
    const d = o.when;
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const tag = o.type === 'pickup' ? 'Pickup' : (o.type === 'dinein' ? 'Mesa' : (o.type || '-'));
    const itemsText = o.items.map(i => `${esc(i.name)} x${i.qty}`).join(', ');
    const numTxt = (o.num != null) ? `#${esc(o.num)}` : (o.id || '—');
    const badgeCls = (o.state === 'READY' || o.state === 'CHARGED') ? 'ok' : 'warn';

    return `<tr>
      <td>${fecha}</td>
      <td>${esc(o.custName || '—')}<div class="muted small">${esc(o.phone || '')}</div></td>
      <td>${esc(tag)}</td>
      <td style="max-width:420px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis">${itemsText || '—'}</td>
      <td class="right">${money(o.total)}</td>
      <td><span class="k-badge ${badgeCls}">${esc(o.state || '-')}</span></td>
      <td class="right"><span class="muted small mono">${numTxt}</span></td>
    </tr>`;
  }).join('');

  tb.innerHTML = html || '<tr><td colspan="7">—</td></tr>';
}

function exportHistoryCSV() {
  const qraw   = (histSearchEl?.value || '').trim();
  const qstr   = qraw.toLowerCase();
  const typeF  = histTypeEl?.value || 'all';
  const stateF = (histStateEl?.value || 'all').toUpperCase();
  const limit  = Math.max(1, safeNum(histLimitEl?.value, 5) || 5);

  const rows = HIST_ALL.filter(o => {
    if (typeF !== 'all' && o.type !== typeF) return false;
    if (stateF !== 'ALL' && o.state !== stateF) return false;
    if (!qstr) return true;
    const id=(o.id||'').toLowerCase(), num=(o.num==null?'':String(o.num)).toLowerCase();
    const name=(o.custName||'').toLowerCase(), phone=(o.phone||'').toLowerCase();
    const type=(o.type||'').toLowerCase(), state=(o.state||'').toLowerCase();
    const items=o.items.map(i=>`${i.name} x${i.qty}`).join(' ').toLowerCase();
    if (qraw && /^\d+$/.test(qraw) && num === qraw) return true;
    return id.includes(qstr)||num.includes(qstr)||name.includes(qstr)||
           phone.includes(qstr)||type.includes(qstr)||state.includes(qstr)||items.includes(qstr);
  }).slice(0,limit);

  const header=['Fecha','Numero/ID','Cliente','Teléfono','Tipo','Estado','Artículos','Total'];
  const lines=[header.join(',')];

  for (const o of rows) {
    const d=o.when;
    const fecha=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const numTxt=(o.num!=null)?`#${o.num}`:(o.id||'');
    const items=o.items.map(i=>`${i.name} x${i.qty}`).join(' | ');
    const csvRow=[fecha,numTxt,o.custName||'',o.phone||'',o.type||'',o.state||'',items,safeNum(o.total,0).toFixed(2)]
      .map(csvEscape).join(',');
    lines.push(csvRow);
  }

  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`historial_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function csvEscape(v){
  const s=String(v??'');
  return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}

(function autoLoadHistOnBoot(){
  try{
    if (histLimitEl) {
      histLimitEl.value = '5';
      histLimitEl.dataset.touched = '1';
    }
    loadHistory(false);
  }catch{}
})();

/* ========================= Inventario ========================= */
const invRows = [];
const invMap  = new Map();

subscribeInventory(items => {
  const arr = Array.isArray(items) ? items : [];
  invRows.length = 0;
  invRows.push(...arr);
  invMap.clear();
  arr.forEach(it => invMap.set(it.id, it));
  renderInventoryTable();
  renderRecipeTable(); // refresca nombres en recetario
});
$('#btnInvRefresh')?.addEventListener('click', renderInventoryTable);
$('#invSearch')?.addEventListener('input', debounce(renderInventoryTable, 120));

function renderInventoryTable() {
  const qstr = ($('#invSearch')?.value || '').toLowerCase();
  const tb = $('#tblInv tbody');
  if (!tb) return;
  const rows = invRows
    .filter(x => (x.name || '').toLowerCase().includes(qstr))
    .map(i => `<tr>
      <td>${esc(i.name)}</td>
      <td>${safeNum(i.currentStock ?? 0, 0).toFixed(2)}</td>
      <td>${esc(i.unit || '-')}</td>
      <td>${money(i.costAvg || 0)}</td>
      <td>${money(safeNum(i.currentStock || 0, 0) * safeNum(i.costAvg || 0, 0))}</td>
    </tr>`).join('');
  tb.innerHTML = rows || '<tr><td colspan="5">—</td></tr>';
}

/* ========================= Compras / Proveedores ========================= */
let SUPPLIERS = [];
subscribeSuppliers(arr => {
  SUPPLIERS = arr || [];
  renderVendors(arr);
});

const btnAddPurchase = document.getElementById('btnAddPurchase');
btnAddPurchase && (btnAddPurchase.onclick = async () => {
  const name = ($('#pName')?.value || '').trim();
  const qty  = safeNum($('#pQty')?.value, 0);
  const cost = safeNum($('#pCost')?.value, 0);
  const supplierId = ($('#pVendor')?.value || '').trim() || null;

  if (!name || qty <= 0 || cost <= 0) {
    toast('Completa ingrediente, cantidad y costo');
    return;
  }
  try {
    const norm = (s)=> String(s||'').trim().toLowerCase();
    const found = invRows.find(it => norm(it.name) === norm(name));
    let itemId = found?.id;
    if (!itemId) {
      itemId = await upsertInventoryItem(
        { name, unit:'unit', currentStock:0, min:0, max:0, perish:false },
        { training: isTraining() }
      );
      toast('Ingrediente nuevo creado en inventario');
    }
    await recordPurchase({ itemId, qty, unitCost: cost, supplierId }, { training: isTraining() });
    if ($('#pQty'))  $('#pQty').value = '1';
    if ($('#pCost')) $('#pCost').value = '0';
    toast('Compra registrada' + (isTraining() ? ' (PRUEBA)' : ''));
  } catch (e) {
    console.error(e);
    toast('Error al registrar compra');
  }
});

function renderVendors(arr = []) {
  const tb = $('#tblVendors tbody');
  if (!tb) return;
  tb.innerHTML = (arr||[]).map(v =>
    `<tr><td>${esc(v.name)}</td><td>${esc(v.contact || '-')}</td><td>${v.id}</td></tr>`
  ).join('') || '<tr><td colspan="3">—</td></tr>';
}
$('#btnSaveVendor')?.addEventListener('click', async () => {
  const name = ($('#vName')?.value || '').trim();
  const contact = ($('#vContact')?.value || '').trim();
  if (!name) {
    toast('Nombre del proveedor requerido');
    return;
  }
  try {
    await upsertSupplier({ name, contact }, { training: isTraining() });
    toast('Proveedor guardado' + (isTraining() ? ' (PRUEBA)' : ''));
  } catch (e) {
    console.error(e);
    toast('Error al guardar proveedor');
  }
});

/* ========================= Productos (solo lectura) ========================= */
subscribeProducts(renderProducts);
function renderProducts(items = []) {
  const tb = $('#tblProducts tbody');
  if (!tb) return;
  tb.innerHTML = (items||[]).map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.type||'-')}</td>
      <td>${money(p.price)}</td>
      <td>${p.active ? 'Sí' : 'No'}</td>
      <td>${p.id}</td>
    </tr>
  `).join('') || '<tr><td colspan="5">—</td></tr>';
}
document.getElementById('btnReloadCatalog')?.addEventListener('click', async ()=>{
  try {
    await fetchCatalogWithFallback();
    toast('Catálogo recargado para el kiosko');
  } catch(e){
    console.error(e);
    toast('No se pudo recargar el catálogo');
  }
});

/* ========================= Happy Hour ========================= */
let HH_TIMER = null;
subscribeHappyHour(hh => {
  $('#hhEnabled') && ($('#hhEnabled').value = hh?.enabled ? 'on' : 'off');
  $('#hhDisc')    && ($('#hhDisc').value    = safeNum(hh?.discountPercent || 0, 0));
  $('#hhMsg')     && ($('#hhMsg').value     = hh?.bannerText || '');

  const endsAt = Number(hh?.endsAt || 0) || null;
  const endsEl = $('#hhEndsAt');
  if (endsEl) {
    if (endsAt) {
      const d = new Date(endsAt);
      endsEl.value = toLocalISO(d);
      endsEl.title = d.toLocaleString();
    } else {
      endsEl.value = '';
      endsEl.title = '';
    }
  }

  const lbl = $('#hhCountdown');
  if (HH_TIMER) { clearInterval(HH_TIMER); HH_TIMER = null; }
  if (lbl) {
    if (hh?.enabled && endsAt && endsAt > Date.now()) {
      const tick = () => {
        const ms = endsAt - Date.now();
        if (ms <= 0) {
          lbl.textContent = 'Finalizó';
          clearInterval(HH_TIMER); HH_TIMER = null; return;
        }
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        lbl.textContent = `Termina en ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      };
      tick();
      HH_TIMER = setInterval(tick, 1000);
    } else {
      lbl.textContent = hh?.enabled ? 'Activo' : 'Inactivo';
    }
  }
});

$('#btnSaveHappy')?.addEventListener('click', async () => {
  const enabled = $('#hhEnabled')?.value === 'on';
  const discountPercent = safeNum($('#hhDisc')?.value, 0);
  const bannerText = ($('#hhMsg')?.value || '').trim();
  const durMinEl = $('#hhDurMin');
  const endsEl = $('#hhEndsAt');
  const patch = { enabled, discountPercent, bannerText };

  const durMin = durMinEl ? safeNum(durMinEl.value, 0) : 0;
  if (enabled && Number.isFinite(durMin) && durMin > 0) {
    patch.durationMin = durMin;
  } else if (enabled && endsEl && endsEl.value) {
    const t = parseLocalDate(endsEl.value);
    if (t) patch.endsAt = t.getTime();
  }

  try {
    await setHappyHour(patch, { training: isTraining() });
    toast('Happy Hour guardada' + (isTraining() ? ' (PRUEBA)' : ''));
  } catch (e) {
    console.error(e);
    toast('No se pudo guardar HH');
  }
});
$('#btnHH30')?.addEventListener('click', ()=> quickHH(30));
$('#btnHH60')?.addEventListener('click', ()=> quickHH(60));
$('#btnHH90')?.addEventListener('click', ()=> quickHH(90));
$('#btnHHStop')?.addEventListener('click', async ()=>{
  try{
    await setHappyHour(
      { enabled:false, discountPercent:safeNum($('#hhDisc')?.value,0), bannerText:($('#hhMsg')?.value||'') },
      { training: isTraining() }
    );
    toast('Happy Hour desactivada' + (isTraining() ? ' (PRUEBA)' : ''));
  } catch(e){
    console.error(e);
    toast('No se pudo desactivar');
  }
});
$('#btnHHExtend15')?.addEventListener('click', async ()=>{
  try{
    const disc=safeNum($('#hhDisc')?.value,0);
    const msg=($('#hhMsg')?.value||'');
    await setHappyHour({ enabled:true, discountPercent:disc, bannerText:msg, durationMin:15 }, { training: isTraining() });
    toast('Extendido 15 min' + (isTraining() ? ' (PRUEBA)' : ''));
  }catch(e){
    console.error(e);
    toast('No se pudo extender');
  }
});
async function quickHH(mins){
  try{
    const disc=safeNum($('#hhDisc')?.value,0);
    const msg=($('#hhMsg')?.value||'');
    await setHappyHour({ enabled:true, discountPercent:disc, bannerText:msg, durationMin:mins }, { training: isTraining() });
    toast(`Happy Hour por ${mins} min` + (isTraining() ? ' (PRUEBA)' : ''));
  } catch(e){
    console.error(e);
    toast('No se pudo activar');
  }
}

/* ========================= Ajustes globales ========================= */
let APP_SETTINGS = {};
subscribeSettings(s => {
  APP_SETTINGS = s || {};
});

/* ========================= RECETARIO ========================= */
let RECIPES = [];
subscribeRecipes(list => {
  RECIPES = list || [];
  renderRecipeTable();
});

$('#rcpSearch')?.addEventListener('input', debounce(renderRecipeTable, 120));

document.addEventListener('click', (e)=>{
  const viewBtn = e.target.closest('#tblRecipes [data-a="view"]');
  if (viewBtn){
    const id = viewBtn.closest('tr')?.dataset?.id;
    const r = RECIPES.find(x=>x.id===id);
    if (r) openRecipeModal(r);
    return;
  }
  const prepBtn = e.target.closest('#tblRecipes [data-a="prep"]');
  if (prepBtn){
    const id = prepBtn.closest('tr')?.dataset?.id;
    const r = RECIPES.find(x=>x.id===id);
    if (r) openQuickPrepDialog(r);
    return;
  }
});

function renderRecipeTable(){
  const tb = $('#tblRecipes tbody');
  if (!tb) return;
  const term = ($('#rcpSearch')?.value || '').toLowerCase().trim();
  const rows = (RECIPES||[])
    .filter(r=>{
      if(!term) return true;
      const name = (r.name||'').toLowerCase();
      const ing  = (r.ingredients||[])
        .map(i=> (invMap.get(i.itemId)?.name || i.itemId))
        .join(' ').toLowerCase();
      return name.includes(term) || ing.includes(term);
    })
    .map(r=>{
      const outName = invMap.get(r.outputItemId)?.name || r.outputItemId || '—';
      const count = (r.ingredients||[]).length;
      const low = isLowStock(r.outputItemId);
      const warn = low ? `<span class="k-badge warn" title="Stock bajo">LOW</span>` : '';
      return `<tr data-id="${r.id}">
        <td><b>${esc(r.name||'Receta')}</b> ${warn}</td>
        <td>${safeNum(r.yieldQty||0,0)} ${esc(r.yieldUnit||'ml')}</td>
        <td>${esc(outName)}</td>
        <td>${count}</td>
        <td class="right" style="white-space:nowrap">
          <button class="btn small ghost" data-a="view">Ver</button>
          <button class="btn small" data-a="prep">Preparar</button>
        </td>
      </tr>`;
    }).join('');
  tb.innerHTML = rows || '<tr><td colspan="5">—</td></tr>';
}
function isLowStock(itemId){
  if (!itemId) return false;
  const it = invMap.get(itemId);
  const th = safeNum(APP_SETTINGS?.lowStockThreshold, 5);
  return it && safeNum(it.currentStock||0,0) <= th;
}

/* ---- Modal de receta (solo lectura) ---- */
const rcpModal = document.getElementById('rcpModal');
document.getElementById('rcpClose')?.addEventListener('click', ()=>{
  if (rcpModal) rcpModal.style.display='none';
});

let CURRENT_R = null;
let CURRENT_OUT_QTY = 100;

function scaleIngredients(r, outQty){
  const base = safeNum(r.yieldQty||0, 0) || 1;
  const factor = safeNum(outQty, 0) / base;
  return (r.ingredients||[]).map(ing => ({
    ...ing, qtyScaled: safeNum(ing.qty||0, 0) * factor
  }));
}

function renderRecipeModal(){
  if(!CURRENT_R) return;
  const body = document.getElementById('rcpBody');
  if (!body) return;
  const hint = document.getElementById('rcpHint');
  const outItem = invMap.get(CURRENT_R.outputItemId)?.name || CURRENT_R.outputItemId || '—';
  const list = scaleIngredients(CURRENT_R, CURRENT_OUT_QTY);

  body.innerHTML = `
    <div class="field">
      <label>Receta</label>
      <div><b>${esc(CURRENT_R.name||'Receta')}</b></div>
    </div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px">
      <div class="field">
        <label>Porción (ml)</label>
        <input id="rcpOutQty" type="number" min="10" step="10" value="${String(CURRENT_OUT_QTY)}" />
        <div class="row" style="gap:6px;margin-top:6px">
          <button class="btn tiny ghost" id="rcpScale500" type="button">500</button>
          <button class="btn tiny ghost" id="rcpScale250" type="button">250</button>
          <button class="btn tiny ghost" id="rcpScale200" type="button">200</button>
          <button class="btn tiny ghost" id="rcpScale100" type="button">100</button>
        </div>
      </div>
      <div class="field">
        <label>Vasos 2oz usados (opcional)</label>
        <input id="rcpCups" type="number" min="0" step="1" value="0" />
        <div class="muted small">Si configuraste <code>sauceCupItemId</code> en settings, se descuentan.</div>
      </div>
      <div class="field">
        <label>Guardar para almacenar</label>
        <select id="rcpStore">
          <option value="no" selected>No</option>
          <option value="si">Sí</option>
        </select>
        <div class="row" style="margin-top:6px;gap:6px">
          <input id="rcpStoreQty" type="number" min="0" step="10" placeholder="Cantidad almacenada (ml)" />
        </div>
      </div>
    </div>

    <div class="field">
      <label>Producto terminado</label>
      <div>
        ${esc(outItem)}
        ${isLowStock(CURRENT_R.outputItemId) ? '<span class="k-badge warn" style="margin-left:6px">⚠ Stock bajo</span>' : ''}
      </div>
    </div>

    <div class="field">
      <label>Ingredientes escalados</label>
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

    ${CURRENT_R.method ? `<div class="field"><label>Método</label><div class="muted sm" style="white-space:pre-wrap">${esc(CURRENT_R.method)}</div></div>` : ''}
  `;

  if (hint) hint.textContent = `Salida: ${CURRENT_OUT_QTY} ml`;
  const titleEl = document.getElementById('rcpTitle');
  if (titleEl) titleEl.textContent = CURRENT_R.name || 'Receta';
}

function openRecipeModal(r){
  CURRENT_R = r;
  CURRENT_OUT_QTY = safeNum(document.getElementById('rcpQuickPort')?.value, 100) || 100;
  if (rcpModal) rcpModal.style.display='grid';
  renderRecipeModal();
}
document.getElementById('rcpScale500')?.addEventListener('click', ()=>{ CURRENT_OUT_QTY=500; renderRecipeModal(); });
document.getElementById('rcpScale250')?.addEventListener('click', ()=>{ CURRENT_OUT_QTY=250; renderRecipeModal(); });
document.getElementById('rcpScale200')?.addEventListener('click', ()=>{ CURRENT_OUT_QTY=200; renderRecipeModal(); });
document.getElementById('rcpScale100')?.addEventListener('click', ()=>{ CURRENT_OUT_QTY=100; renderRecipeModal(); });
document.getElementById('rcpBody')?.addEventListener('input', (e)=>{
  if (e.target && e.target.id==='rcpOutQty'){
    const v = safeNum(e.target.value, 10);
    CURRENT_OUT_QTY = clamp(v || 10, 10, 100000);
    renderRecipeModal();
  }
});
document.getElementById('rcpPrepare')?.addEventListener('click', doPrepareFromView);

async function doPrepareFromView(){
  if (!CURRENT_R) return;
  const outQty = safeNum(document.getElementById('rcpOutQty')?.value, CURRENT_OUT_QTY || 0);
  if (!outQty || outQty<=0){
    toast('Indica cantidad de salida en ml');
    return;
  }
  try{
    await produceBatch({ recipeId: CURRENT_R.id, outputQty: outQty }, { training: isTraining() });
    const cups = safeNum(document.getElementById('rcpCups')?.value, 0);
    const cupId = APP_SETTINGS?.sauceCupItemId || null;
    if (cupId && cups>0){
      await adjustStock(cupId, -cups, 'use',
        { reason:'sauce_cups', recipeId: CURRENT_R.id, outQty },
        { training: isTraining() });
    }
    const store = (document.getElementById('rcpStore')?.value === 'si');
    const storeQty = safeNum(document.getElementById('rcpStoreQty')?.value, 0);
    if (store && CURRENT_R.outputItemId){
      await adjustStock(CURRENT_R.outputItemId, 0, 'production_meta',
        { recipeId: CURRENT_R.id, stored:true, storedQtyMl:storeQty, outputQtyMl:outQty },
        { training: isTraining() });
    }
    toast('Lote preparado' + (isTraining() ? ' (PRUEBA)' : ''));
    document.getElementById('rcpClose')?.click();
  }catch(e){
    console.error(e);
    toast('No se pudo preparar el lote');
  }
}

/* ---- Diálogo rápido “Preparar receta” (validación inversa) ---- */
function openQuickPrepDialog(prefRecipe = null){
  if (!RECIPES.length){
    toast('No hay recetas registradas');
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.setAttribute('role','dialog');
  wrap.setAttribute('aria-modal','true');
  wrap.style.display='grid';

  const quickDefault = safeNum(document.getElementById('rcpQuickPort')?.value, 100) || 100;
  const options = RECIPES.map(r=>`<option value="${r.id}" ${prefRecipe && prefRecipe.id===r.id?'selected':''}>${esc(r.name||'Receta')}</option>`).join('');
  const r0 = prefRecipe || RECIPES[0];

  wrap.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <div>Preparar receta</div>
        <button class="btn ghost small" data-close aria-label="Cerrar">Cerrar</button>
      </div>
      <div class="modal-body">
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:8px">
          <div class="field">
            <label>Receta</label>
            <select id="qpRecipe">${options}</select>
          </div>
          <div class="field">
            <label>Cantidad a preparar (ml)</label>
            <input id="qpQty" type="number" min="10" step="10" value="${String(quickDefault)}" />
            <div class="row" style="margin-top:6px"><button class="btn tiny ghost" id="qpSuggest" type="button">Sugerir cantidad</button></div>
          </div>
        </div>
        <div id="qpPreview" class="field" style="margin-top:8px"></div>
        <div id="qpIssues"  class="field" style="margin-top:6px"></div>
        <div id="qpCost"    class="field" style="margin-top:6px"></div>
      </div>
      <div class="modal-foot">
        <div class="total-bar">
          <div class="muted small" id="qpHint"></div>
          <div class="row" style="gap:8px">
            <button class="btn ghost" id="qpBuyMissing" disabled>Registrar compras faltantes</button>
            <button class="btn" id="qpConfirm" disabled>Confirmar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  const _ = (s)=> wrap.querySelector(s);
  function close(){ wrap.remove(); }

  const state = { r: r0, qty: quickDefault, needs: [] };
  renderAll();

  wrap.addEventListener('change', (e)=>{
    if (e.target.id==='qpRecipe'){
      const rr = RECIPES.find(x=>x.id===e.target.value);
      if (rr){ state.r = rr; renderAll(); }
    }
  });
  wrap.addEventListener('input', (e)=>{
    if (e.target.id==='qpQty'){
      state.qty = clamp(safeNum(e.target.value, 10) || 10, 10, 100000);
      renderAll();
    }
  });
  wrap.addEventListener('click', async (e)=>{
    if (e.target.matches('[data-close]')) { close(); return; }

    if (e.target.id==='qpSuggest'){
      e.preventDefault();
      const q = await suggestQty(state.r);
      if (q){
        _('#qpQty').value = q;
        state.qty = q;
        renderAll();
      }
      return;
    }

    if (e.target.id==='qpBuyMissing'){
      const rows = [...wrap.querySelectorAll('.qp-buyrow')];
      if (!rows.length) return;
      try{
        for (const row of rows){
          const itemId = row.dataset.item;
          const qty = safeNum(row.querySelector('[data-qty]')?.value, 0);
          const cost = safeNum(row.querySelector('[data-cost]')?.value, 0);
          const supplierId = row.querySelector('[data-sup]')?.value || null;
          if (itemId && qty>0 && cost>0){
            await recordPurchase({ itemId, qty, unitCost: cost, supplierId }, { training: isTraining() });
          }
        }
        toast('Compras registradas' + (isTraining() ? ' (PRUEBA)' : ''));
        renderAll();
      }catch(err){
        console.error(err);
        toast('No se pudieron registrar compras');
      }
      return;
    }

    if (e.target.id==='qpConfirm'){
      try{
        await produceBatch({ recipeId: state.r.id, outputQty: state.qty }, { training: isTraining() });
        await adjustStock(state.r.outputItemId, 0, 'production_meta',
          { recipeId: state.r.id, stored:true, storedQtyMl: state.qty, outputQtyMl: state.qty },
          { training: isTraining() });
        toast('Producción confirmada' + ( isTraining() ? ' (PRUEBA)' : '' ));
        close();
      }catch(err){
        console.error(err);
        toast('No se pudo confirmar producción');
      }
    }
  });

  function renderAll(){ renderPreview(); renderValidation(); renderCost(); }

  function renderPreview(){
    const list = scaleIngredients(state.r, state.qty);
    const low  = isLowStock(state.r.outputItemId);
    _('#qpPreview').innerHTML = `
      <label>Ingredientes para ${state.qty} ml ${low?'<span class="k-badge warn" style="margin-left:6px">Stock bajo producto final</span>':''}</label>
      <div class="rc-ingredients">
        ${list.map(ing=>{
          const name = invMap.get(ing.itemId)?.name || ing.itemId;
          const unit = ing.unit || 'ml';
          return `
            <div class="row" style="justify-content:space-between">
              <div>${esc(name)}</div>
              <div>${ing.qtyScaled.toFixed(1)} ${esc(unit)}</div>
            </div>`;
        }).join('')}
      </div>
      ${state.r.method ? `<div class="muted sm" style="white-space:pre-wrap"><b>Método:</b>\n${esc(state.r.method)}</div>`:''}
    `;
  }

  function renderValidation(){
    const list = scaleIngredients(state.r, state.qty);
    const needs = [];
    const issues = list.map(ing=>{
      const inv = invMap.get(ing.itemId);
      const have = safeNum(inv?.currentStock||0, 0);
      const need = safeNum(ing.qtyScaled||0, 0);
      const costAvg = safeNum(inv?.costAvg||0, 0);

      const faltaStock = have < need;
      const faltaCosto = costAvg <= 0;

      if (faltaStock || faltaCosto){
        needs.push({ itemId: ing.itemId, need, have, faltaStock, faltaCosto });
      }
      return { ing, inv, have, need, costAvg, faltaStock, faltaCosto };
    });

    state.needs = needs;

    if (!needs.length){
      _('#qpIssues').innerHTML = `<div class="muted small" style="color:#a7ffbf">✔ Insumos OK: stock y costos promedio están listos.</div>`;
      _('#qpBuyMissing').disabled = true;
      _('#qpConfirm').disabled = false;
      _('#qpHint').textContent = '';
      return;
    }

    const supplierOpts = `<option value="">— proveedor —</option>` + (SUPPLIERS||[])
      .map(s=>`<option value="${s.id}">${esc(s.name||s.id)}</option>`).join('');

    _('#qpIssues').innerHTML = `
      <label>Faltantes / datos requeridos</label>
      <div class="muted small" style="margin-bottom:6px">Debes completar estos datos antes de confirmar.</div>
      <div class="col" style="gap:6px">
        ${issues.filter(i=> i.faltaStock || i.faltaCosto).map(row=>{
          const name = invMap.get(row.ing.itemId)?.name || row.ing.itemId;
          const compQty = Math.max(0, (row.need - row.have));
          return `
          <div class="card qp-buyrow" data-item="${row.ing.itemId}" style="padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:10px">
            <div class="row" style="justify-content:space-between; gap:8px">
              <div style="min-width:0"><b>${esc(name)}</b>
                <div class="muted small">Necesitas ${row.need.toFixed(2)} • Disponible ${row.have.toFixed(2)} ${row.faltaCosto? '• <span style="color:#ffd27f">sin costo promedio</span>':''}</div>
              </div>
              <div class="row" style="gap:8px; flex-wrap:wrap">
                <select data-sup class="small">${supplierOpts}</select>
                <input data-qty  type="number" min="0" step="0.01" value="${compQty.toFixed(2)}" class="small" title="Cantidad a comprar">
                <input data-cost type="number" min="0" step="0.01" placeholder="Costo unit." class="small" title="Costo unitario">
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
    _('#qpBuyMissing').disabled = false;
    _('#qpConfirm').disabled = true;
    _('#qpHint').textContent = `Completa compras/costos para habilitar “Confirmar”.`;
  }

  function renderCost(){
    const list = scaleIngredients(state.r, state.qty);
    let total = 0;
    for (const ing of list){
      const inv = invMap.get(ing.itemId);
      const cost = safeNum(inv?.costAvg||0, 0);
      total += cost * safeNum(ing.qtyScaled||0,0);
    }
    const costPerMl = state.qty > 0 ? total / state.qty : 0;
    _('#qpCost').innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div class="muted">Costo estimado del lote</div>
        <div><b>${money(total)}</b> <span class="muted small">(${money(costPerMl)}/ml)</span></div>
      </div>
    `;
  }
}

/* Recomendación de cantidad: ventas últimos 7 días × ml por pedido */
async function suggestQty(recipe){
  try{
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate()-7);
    from.setHours(0,0,0,0);
    const to   = new Date(now);
    to.setHours(23,59,59,999);

    const orders = await getOrdersRange({ from, to, includeArchive:true, orderType:null }) || [];
    const perOrderMl = safeNum(recipe?.suggestMlPerOrder || APP_SETTINGS?.defaultSuggestMlPerOrder, 20);
    const totalOrders = (orders||[]).length || 0;
    const dailyAvgOrders = totalOrders / 7;

    const qtyRaw = Math.max(100, dailyAvgOrders * perOrderMl * 1.2); // +20% colchón
    const qty = Math.ceil(qtyRaw / 10) * 10; // redondeo a 10ml
    toast(`Sugerencia basada en ventas: ~${qty} ml`);
    return qty;
  }catch(e){
    console.error(e);
    toast('No se pudo calcular sugerencia');
    return null;
  }
}

/* ========================= ARTÍCULOS (CRUD) ========================= */
let ARTICLES = [];
let ART_SORT = { by: 'name', dir: 'asc' };
let ART_FILTER = '';

subscribeArticles(arr => {
  ARTICLES = Array.isArray(arr) ? arr : [];
  renderArticles();
});
document.getElementById('btnAddArticulo')?.addEventListener('click', () => openArticleModal());

document.addEventListener('input', (e)=>{
  const input = e.target.closest('#artSearch');
  if (!input) return;
  ART_FILTER = String(input.value||'').toLowerCase().trim();
  renderArticles();
});

document.addEventListener('click', async (e)=>{
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
        await upsertArticle({ ...a, active: !a?.active }, { training: isTraining() });
        toast(a?.active ? 'Artículo desactivado' : 'Artículo activado');
      } catch(err){
        console.error(err);
        toast('No se pudo actualizar activo');
      }
      return;
    }
  }

  const th = e.target.closest('#tblArticulos thead [data-sort]');
  if (th){
    const by = th.dataset.sort;
    if (ART_SORT.by === by){
      ART_SORT.dir = (ART_SORT.dir==='asc'?'desc':'asc');
    } else {
      ART_SORT.by = by;
      ART_SORT.dir = 'asc';
    }
    renderArticles();
  }
});

function renderArticles(){
  const tb = $('#tblArticulos tbody');
  if (!tb) return;

  let rows = ARTICLES.slice();
  if (ART_FILTER){
    rows = rows.filter(a=>{
      const hay = (a.name||'') + ' ' + (a.desc||'');
      return hay.toLowerCase().includes(ART_FILTER);
    });
  }

  rows.sort((a,b)=>{
    const dir = ART_SORT.dir==='asc'?1:-1;
    const va = (ART_SORT.by==='price') ? safeNum(a.price||0,0)
             : (ART_SORT.by==='active')? (a.active?1:0)
             : String(a.name||'').toLowerCase();
    const vb = (ART_SORT.by==='price') ? safeNum(b.price||0,0)
             : (ART_SORT.by==='active')? (b.active?1:0)
             : String(b.name||'').toLowerCase();
    if (va<vb) return -1*dir; if (va>vb) return 1*dir; return 0;
  });

  tb.innerHTML = rows.map(a => `
    <tr>
      <td style="min-width:180px">${esc(a.name||'—')}<div class="muted small">${esc(a.desc||'')}</div></td>
      <td>${money(a.price||0)}</td>
      <td>${a.active ? 'Sí' : 'No'}</td>
      <td class="right" style="white-space:nowrap;gap:6px">
        <button class="btn small ghost" data-a="toggle" data-id="${a.id}">${a.active?'Desactivar':'Activar'}</button>
        <button class="btn small" data-a="edit" data-id="${a.id}">Editar</button>
        <button class="btn small ghost" data-a="dup"  data-id="${a.id}">Duplicar</button>
        <button class="btn small danger" data-a="del"  data-id="${a.id}">Eliminar</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4">—</td></tr>';

  const thead = $('#tblArticulos thead tr');
  if (thead && !thead.querySelector('[data-sort]')) {
    thead.innerHTML = `
      <th data-sort="name"   style="cursor:pointer">Nombre</th>
      <th data-sort="price"  style="cursor:pointer">Precio</th>
      <th data-sort="active" style="cursor:pointer">Activo</th>
      <th>Acciones</th>
    `;
  }
}

/* ---- Modal de Artículo ---- */
function openArticleModal(article = null){
  const isEdit = !!(article && article.id);
  const data = {
    id: article?.id || null,
    name: article?.name || '',
    price: safeNum(article?.price || 0, 0),
    active: article?.active ?? true,
    desc: article?.desc || '',
  };

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.setAttribute('role','dialog');
  wrap.setAttribute('aria-modal','true');
  wrap.style.display = 'grid';
  wrap.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <div>${isEdit? 'Editar artículo' : 'Nuevo artículo'}</div>
        <button class="btn ghost small" id="aClose" aria-label="Cerrar">Cerrar</button>
      </div>
      <div class="modal-body">
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:8px">
          <div class="field">
            <label>Nombre <span class="muted small">*</span></label>
            <input id="aName" type="text" placeholder="Nombre" value="${escAttr(data.name)}" required/>
            <div class="muted small" id="aNameErr" style="color:#ffb4b4;display:none">Requerido</div>
          </div>
          <div class="field">
            <label>Precio</label>
            <input id="aPrice" type="number" min="0" step="0.01" value="${String(data.price)}"/>
          </div>
          <div class="field">
            <label>Activo</label>
            <select id="aActive">
              <option value="on" ${data.active?'selected':''}>Sí</option>
              <option value="off" ${!data.active?'selected':''}>No</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Descripción</label>
          <textarea id="aDesc" placeholder="Opcional">${escHtml(data.desc)}</textarea>
        </div>
      </div>
      <div class="modal-foot">
        <div class="total-bar">
          <div></div>
          <div class="row" style="gap:8px">
            ${isEdit ?'<button class="btn ghost danger" id="aDelete">Eliminar</button>':''}
            <button class="btn" id="aSave">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const q = (sel)=> wrap.querySelector(sel);
  const close = ()=>{ wrap.remove(); };

  q('#aClose')?.addEventListener('click', close);
  wrap.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
  setTimeout(()=> q('#aName')?.focus(), 0);

  function validate(){
    const name = q('#aName')?.value.trim();
    const ok = !!name;
    q('#aNameErr').style.display = ok ? 'none' : '';
    return ok;
  }
  wrap.addEventListener('input', (e)=>{
    if (e.target.id === 'aName') validate();
  });

  async function save(){
    if (!validate()){ beep(); return; }
    const payload = {
      id: data.id || undefined,
      name: q('#aName').value.trim(),
      price: safeNum(q('#aPrice').value, 0),
      active: q('#aActive').value === 'on',
      desc: q('#aDesc').value.trim(),
    };
    try{
      await upsertArticle(payload, { training: isTraining() });
      toast('Artículo guardado' + (isTraining() ? ' (PRUEBA)' : ''));
      close();
    } catch(err){
      console.error(err);
      toast('No se pudo guardar el artículo');
    }
  }
  q('#aSave')?.addEventListener('click', save);
  wrap.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){
      e.preventDefault();
      save();
    }
  });

  if (isEdit){
    q('#aDelete')?.addEventListener('click', ()=> confirmDeleteArticle({ id:data.id, name:data.name }));
  }
}

async function duplicateArticle(a){
  try{
    const copy = {
      name:(a.name || 'Artículo') + ' (copia)',
      price:safeNum(a.price||0,0),
      active:false,
      desc:a.desc || ''
    };
    await upsertArticle(copy, { training: isTraining() });
    toast('Artículo duplicado (quedó inactivo)' + (isTraining() ? ' (PRUEBA)' : ''));
  }catch(err){
    console.error(err);
    toast('No se pudo duplicar');
  }
}
function confirmDeleteArticle(article){
  if (!article) return;
  if (!confirm(`¿Eliminar artículo "${article.name}"?`)) return;
  deleteArticle(article.id, { training: isTraining() })
    .then(()=> toast('Artículo eliminado' + (isTraining() ? ' (PRUEBA)' : '')))
    .catch((e)=>{
      console.error(e);
      toast('No se pudo eliminar');
    });
}

/* ========================= TEMAS — Pestaña fija ========================= */
(function initThemesTab(){
  const TABS = document.getElementById('admTabs');
  if (!TABS) return;

  // 1) Agregar botón de tab si no existe
  if (!TABS.querySelector('[data-tab="temas"]')){
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.tab = 'temas';
    tab.type = 'button';
    tab.textContent = 'Temas';
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-selected','false');
    TABS.appendChild(tab);
  }

  // 2) Agregar panel si no existe
  if (!document.getElementById('panel-temas')){
    const panel = document.createElement('section');
    panel.id = 'panel-temas';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="card" style="max-width:680px;margin:auto">
        <h3>Tema (Kiosko/UI)</h3>
        <div class="field">
          <label>Selecciona tema</label>
          <select id="themeSelect" style="width:100%"></select>
        </div>
        <div class="row" style="gap:12px;margin-top:12px;flex-wrap:wrap">
          <button id="btnThemePreview" class="btn" type="button">Probar local</button>
          <button id="btnThemeSave" class="btn primary" type="button">Guardar GLOBAL</button>
        </div>
        <p class="muted small" id="themeHint" style="margin-top:10px">
          “Probar local” solo cambia tu pantalla (sessionStorage). “Guardar GLOBAL” escribe en <code>settings/theme</code>.
        </p>
      </div>
    `;
    (document.getElementById('admTabs').parentElement || document.body).appendChild(panel);
  }

  const sel   = document.getElementById('themeSelect');
  const btnPrev = document.getElementById('btnThemePreview');
  const btnSave = document.getElementById('btnThemeSave');
  const hint    = document.getElementById('themeHint');

  // 3) Llenar lista de temas
  function renderThemeOptions(names){
    const current = sel.value;
    sel.innerHTML = (names||[]).map(n => `<option value="${n}">${n}</option>`).join('') || `<option value="Base">Base</option>`;
    if (current && [...sel.options].some(o=>o.value===current)) sel.value = current;
  }
  try {
    const names = listThemes();
    renderThemeOptions(names);
  } catch {
    renderThemeOptions(['Base','Independencia','Muertos','Navidad','Fiestas','San Valentín','Halloween','Fútbol','Lucha Libre','Pixel Art','Retro Arcade','Y2K']);
  }

  // 4) Suscripciones
  let unsubTheme = null;
  try { initThemeFromSettings({ defaultName: 'Independencia' }); } catch {}
  try {
    unsubTheme = subscribeTheme((t)=>{
      if (t?.name && sel && [...sel.options].some(o=>o.value===t.name)) {
        sel.value = t.name;
      }
    });
  } catch {}

  subscribeSettings((s)=>{
    if (Array.isArray(s?.themes) && s.themes.length) {
      renderThemeOptions(s.themes);
      if (s.theme && [...sel.options].some(o=>o.value===s.theme)) sel.value = s.theme;
    }
  });

  // 5) Acciones
  btnPrev?.addEventListener('click', ()=>{
    const name = sel.value || 'Base';
    try {
      applyThemeLocal(name);
      try { sessionStorage.setItem('localTheme', name); } catch {}
      hint.textContent = `Tema aplicado localmente: ${name}`;
      toast(`Tema local: ${name}`);
    } catch (e) {
      console.error(e);
      hint.textContent = 'No se pudo aplicar local.';
    }
  });

  btnSave?.addEventListener('click', async ()=>{
    const name = sel.value || 'Base';
    try {
      await setTheme({ name }, { training: isTraining() });
      hint.textContent = `Tema GLOBAL guardado: ${name}` + (isTraining() ? ' (PRUEBA)' : '');
      toast(`Tema global: ${name}`);
    } catch (e) {
      console.error(e);
      hint.textContent = 'No se pudo guardar GLOBAL.';
    }
  });

  // 6) Aplicar tema local si existe en sessionStorage
  try {
    const local = sessionStorage.getItem('localTheme');
    if (local) document.documentElement.setAttribute('data-theme', local);
  } catch {}

  // 7) Limpieza
  window.addEventListener('beforeunload', ()=>{
    try{ unsubTheme?.(); }catch{}
  });

  // 8) Ocultar panel flotante viejo si existe
  const oldFloat = document.getElementById('admThemePanel');
  if (oldFloat) oldFloat.style.display = 'none';
})();

/* ========================= PANEL: Productos (CRUD sobre Artículos) ========================= */
(function initProductsPanel(){
  const TABS = document.getElementById('admTabs');
  if (!TABS) return;

  // 1) Inyectar tab y panel
  if (!TABS.querySelector('[data-tab="prod"]')){
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.tab = 'prod';
    tab.type = 'button';
    tab.textContent = 'Productos';
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-selected','false');
    TABS.appendChild(tab);
  }
  if (!document.getElementById('panel-prod')){
    const panel = document.createElement('section');
    panel.id = 'panel-prod';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="card" style="max-width:980px;margin:auto">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <div class="field" style="flex:1 1 280px">
            <label>Búsqueda</label>
            <input id="prodSearch" type="search" placeholder="Nombre, descripción, categoría…" />
          </div>
          <div class="field">
            <label>Filtro</label>
            <select id="prodFilter">
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="hold">En espera</option>
              <option value="featured">Destacados</option>
              <option value="limited">Edición limitada</option>
            </select>
          </div>
          <div class="row" style="align-items:flex-end;gap:8px">
            <button class="btn" id="prodNew" type="button">Nuevo producto</button>
            <button class="btn ghost" id="prodRefresh" type="button">Refrescar</button>
          </div>
        </div>

        <div class="table-wrap" style="margin-top:10px">
          <table class="tbl" id="tblProd">
            <thead>
              <tr>
                <th data-sort="name"   style="cursor:pointer">Nombre</th>
                <th data-sort="price"  style="cursor:pointer">Precio</th>
                <th data-sort="status" style="cursor:pointer">Estado</th>
                <th data-sort="category" style="cursor:pointer">Categoría</th>
                <th style="min-width:220px">Flags</th>
                <th class="right">Acciones</th>
              </tr>
            </thead>
            <tbody><tr><td colspan="6">—</td></tr></tbody>
          </table>
        </div>
      </div>
    `;
    (document.getElementById('admTabs').parentElement || document.body).appendChild(panel);
  }

  // 2) Estado y suscripción
  let PROD = [];
  let PROD_SORT = { by:'name', dir:'asc' };
  let PROD_FILTER = 'all';
  let PROD_QUERY = '';

  const unsubArticles = subscribeArticles(arr => {
    PROD = Array.isArray(arr) ? arr : [];
    renderProd();
  });

  // 3) UI events
  document.getElementById('prodSearch')?.addEventListener('input', debounce((e)=>{
    PROD_QUERY = String(e.target.value||'').toLowerCase().trim();
    renderProd();
  }, 120));
  document.getElementById('prodFilter')?.addEventListener('change', (e)=>{
    PROD_FILTER = e.target.value || 'all';
    renderProd();
  });
  document.getElementById('prodRefresh')?.addEventListener('click', ()=> renderProd());
  document.getElementById('prodNew')?.addEventListener('click', ()=> openProdModal());

  document.getElementById('tblProd')?.addEventListener('click', async (e)=>{
    const th = e.target.closest('thead [data-sort]');
    if (th){
      const by = th.dataset.sort;
      if (PROD_SORT.by === by) PROD_SORT.dir = (PROD_SORT.dir==='asc'?'desc':'asc');
      else { PROD_SORT.by = by; PROD_SORT.dir = 'asc'; }
      renderProd();
      return;
    }

    const btn = e.target.closest('[data-a]');
    if (!btn) return;
    const id = btn.dataset.id;
    const row = PROD.find(x=>x.id===id);
    const act = btn.dataset.a;

    if (act==='edit'){ openProdModal(row); return; }
    if (act==='dup'){
      try{
        const copy = {
          name: (row?.name||'Producto')+' (copia)',
          price: safeNum(row?.price||0,0),
          active: false,
          onHold: true,
          desc: row?.desc||'',
          category: row?.category||'burgers',
          featured: !!row?.featured,
          limitedTime: !!row?.limitedTime,
          limitedUntil: row?.limitedUntil||null,
          sound: row?.sound||'',
          themeTag: row?.themeTag||'',
          ingredients: row?.ingredients||[]
        };
        await upsertArticle(copy, { training: isTraining() });
        toast('Producto duplicado (en espera)' + (isTraining() ? ' (PRUEBA)' : ''));
      }catch(e){ console.error(e); toast('No se pudo duplicar'); }
      return;
    }
    if (act==='del'){
      if (!confirm(`¿Eliminar "${row?.name||'producto'}"?`)) return;
      try{
        await deleteArticle(id, { training: isTraining() });
        toast('Producto eliminado' + (isTraining() ? ' (PRUEBA)' : ''));
      }
      catch(e){ console.error(e); toast('No se pudo eliminar'); }
      return;
    }
    if (act==='toggle-active'){
      try{
        await upsertArticle({ ...row, active: !row?.active, onHold: row?.onHold && !row?.active ? false : row?.onHold }, { training: isTraining() });
        toast(row?.active?'Desactivado':'Activado');
      }catch(e){ console.error(e); toast('No se pudo cambiar estado'); }
      return;
    }
    if (act==='hold'){
      try{
        await upsertArticle({ ...row, onHold: !row?.onHold, active: row?.onHold ? true : false }, { training: isTraining() });
        toast(row?.onHold?'Quitado de espera':'Puesto en espera');
      }catch(e){ console.error(e); toast('No se pudo cambiar a espera'); }
      return;
    }
    if (act==='feature'){
      try{
        await upsertArticle({ ...row, featured: !row?.featured }, { training: isTraining() });
        toast(row?.featured?'Quitado de destacados':'Destacado');
      }catch(e){ console.error(e); toast('No se pudo destacar'); }
      return;
    }
  });

  // 4) Render
  function renderProd(){
    const tb = document.querySelector('#tblProd tbody');
    if (!tb) return;

    let rows = PROD.slice().filter(p=>{
      const hay = `${p.name||''} ${p.desc||''} ${p.category||''}`.toLowerCase();
      if (PROD_QUERY && !hay.includes(PROD_QUERY)) return false;
      if (PROD_FILTER==='active'   && !p.active) return false;
      if (PROD_FILTER==='hold'     && !p.onHold) return false;
      if (PROD_FILTER==='featured' && !p.featured) return false;
      if (PROD_FILTER==='limited'  && !p.limitedTime) return false;
      return true;
    });

    const dir = (PROD_SORT.dir==='asc')?1:-1;
    rows.sort((a,b)=>{
      const ka = (PROD_SORT.by==='price')? safeNum(a.price||0,0)
               : (PROD_SORT.by==='status')? (a.onHold?0:(a.active?2:1))
               : (PROD_SORT.by==='category')? String(a.category||'').toLowerCase()
               : String(a.name||'').toLowerCase();
      const kb = (PROD_SORT.by==='price')? safeNum(b.price||0,0)
               : (PROD_SORT.by==='status')? (b.onHold?0:(b.active?2:1))
               : (PROD_SORT.by==='category')? String(b.category||'').toLowerCase()
               : String(b.name||'').toLowerCase();
      if (ka<kb) return -1*dir; if (ka>kb) return 1*dir; return 0;
    });

    tb.innerHTML = rows.map(p=>{
      const badgeSt =
        p.onHold ? `<span class="k-badge warn">En espera</span>` :
        p.active ? `<span class="k-badge ok">Activo</span>` :
                   `<span class="k-badge">Inactivo</span>`;
      const flags = [
        p.featured ? '⭐ Destacado' : '',
        p.limitedTime ? `⏳ Limitado${p.limitedUntil?` (hasta ${new Date(Number(p.limitedUntil)).toLocaleDateString()})`:''}` : '',
        p.sound ? '🔊 Sonido' : ''
      ].filter(Boolean).join(' · ') || '—';

      return `<tr>
        <td style="min-width:200px">${esc(p.name||'—')}<div class="muted small">${esc(p.desc||'')}</div></td>
        <td>${money(p.price||0)}</td>
        <td>${badgeSt}</td>
        <td>${esc(p.category||'-')}</td>
        <td>${flags}</td>
        <td class="right" style="white-space:nowrap; gap:6px">
          <button class="btn small" data-a="edit" data-id="${p.id}">Editar</button>
          <button class="btn small ghost" data-a="feature" data-id="${p.id}">${p.featured?'Quitar dest.':'Destacar'}</button>
          <button class="btn small ghost" data-a="hold" data-id="${p.id}">${p.onHold?'Quitar espera':'En espera'}</button>
          <button class="btn small ghost" data-a="toggle-active" data-id="${p.id}">${p.active?'Desactivar':'Activar'}</button>
          <button class="btn small ghost" data-a="dup" data-id="${p.id}">Duplicar</button>
          <button class="btn small danger" data-a="del" data-id="${p.id}">Eliminar</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="6">—</td></tr>';
  }

  // 5) Modal de Producto (reutiliza upsertArticle)
  function openProdModal(prod = null){
    const isEdit = !!(prod && prod.id);
    const data = {
      id: prod?.id || null,
      name: prod?.name || '',
      price: safeNum(prod?.price || 0, 0),
      active: prod?.active ?? true,
      onHold: prod?.onHold ?? false,
      category: prod?.category || 'burgers',
      desc: prod?.desc || '',
      featured: !!prod?.featured,
      limitedTime: !!prod?.limitedTime,
      limitedUntil: prod?.limitedUntil ? new Date(Number(prod?.limitedUntil)) : null,
      sound: prod?.sound || '',
      themeTag: prod?.themeTag || '',
      ingredients: Array.isArray(prod?.ingredients) ? prod.ingredients : [],
    };

    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.setAttribute('role','dialog');
    wrap.setAttribute('aria-modal','true');
    wrap.style.display = 'grid';

    const dateVal = data.limitedUntil ? toLocalISO(data.limitedUntil) : '';
    wrap.innerHTML = `
      <div class="modal-card">
        <div class="modal-head">
          <div>${isEdit?'Editar producto':'Nuevo producto'}</div>
          <button class="btn ghost small" id="pClose" aria-label="Cerrar">Cerrar</button>
        </div>
        <div class="modal-body">
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px">
            <div class="field">
              <label>Nombre *</label>
              <input id="pName" type="text" placeholder="Nombre" value="${escAttr(data.name)}" />
              <div class="muted small" id="pNameErr" style="color:#ffb4b4;display:none">Requerido</div>
            </div>
            <div class="field">
              <label>Precio</label>
              <input id="pPrice" type="number" min="0" step="0.01" value="${String(data.price)}" />
            </div>
            <div class="field">
              <label>Categoría</label>
              <select id="pCat">
                <option value="burgers" ${data.category==='burgers'?'selected':''}>Burgers</option>
                <option value="minis"   ${data.category==='minis'?'selected':''}>Minis</option>
                <option value="drinks"  ${data.category==='drinks'?'selected':''}>Drinks</option>
                <option value="sides"   ${data.category==='sides'?'selected':''}>Sides</option>
              </select>
            </div>
            <div class="field">
              <label>Estado</label>
              <select id="pState">
                <option value="active" ${(!data.onHold && data.active)?'selected':''}>Activo</option>
                <option value="hold"   ${(data.onHold)?'selected':''}>En espera</option>
                <option value="off"    ${(!data.onHold && !data.active)?'selected':''}>Inactivo</option>
              </select>
            </div>
          </div>

          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin-top:6px">
            <div class="field">
              <label>Destacado</label>
              <select id="pFeatured">
                <option value="no" ${!data.featured?'selected':''}>No</option>
                <option value="si" ${data.featured?'selected':''}>Sí</option>
              </select>
            </div>
            <div class="field">
              <label>Edición limitada</label>
              <select id="pLimited">
                <option value="no" ${!data.limitedTime?'selected':''}>No</option>
                <option value="si" ${data.limitedTime?'selected':''}>Sí</option>
              </select>
            </div>
            <div class="field">
              <label>Vence (si limitada)</label>
              <input id="pUntil" type="datetime-local" value="${dateVal}" ${data.limitedTime?'':'disabled'}>
            </div>
            <div class="field">
              <label>Audio (ruta)</label>
              <input id="pSound" type="text" placeholder="/sounds/viva-mexico.mp3" value="${escAttr(data.sound)}">
            </div>
          </div>

          <div class="grid" style="grid-template-columns:1fr; gap:10px; margin-top:6px">
            <div class="field">
              <label>Descripción</label>
              <textarea id="pDesc" placeholder="Opcional">${escHtml(data.desc)}</textarea>
            </div>
            <div class="field">
              <label>Ingredientes (uno por línea)</label>
              <textarea id="pIngs" placeholder="Pan&#10;Carne 85g&#10;Queso blanco&#10;...">${escHtml((data.ingredients||[]).join('\n'))}</textarea>
              <div class="muted small">Solo informativo para el kiosko / ficha.</div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <div class="row" style="gap:8px">
            ${isEdit?'<button class="btn ghost danger" id="pDelete">Eliminar</button>':''}
          </div>
          <div class="row" style="gap:8px">
            <button class="btn ghost" id="pHold">${data.onHold?'Quitar de espera':'Dejar en espera'}</button>
            <button class="btn" id="pSave">Guardar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const q = sel => wrap.querySelector(sel);
    const close = ()=> wrap.remove();
    q('#pClose')?.addEventListener('click', close);
    wrap.addEventListener('keydown', (e)=>{ if (e.key==='Escape') close(); });

    function validate(){
      const ok = !!q('#pName')?.value.trim();
      q('#pNameErr').style.display = ok ? 'none' : '';
      return ok;
    }
    q('#pName')?.addEventListener('input', validate);

    wrap.addEventListener('change', (e)=>{
      if (e.target?.id==='pLimited'){ q('#pUntil').disabled = !(e.target.value==='si'); }
    });

    q('#pHold')?.addEventListener('click', async ()=>{
      try{
        const wantHold = !data.onHold;
        const payload = { ...(data.id?{id:data.id}:{}) , onHold: wantHold, active: wantHold?false:true };
        await upsertArticle(payload, { training: isTraining() });
        toast(wantHold?'Puesto en espera':'Quitado de espera');
        close();
      }catch(e){ console.error(e); toast('No se pudo cambiar a espera'); }
    });

    if (isEdit){
      q('#pDelete')?.addEventListener('click', async ()=>{
        if (!confirm(`¿Eliminar "${data.name||'producto'}"?`)) return;
        try{
          await deleteArticle(data.id, { training: isTraining() });
          toast('Producto eliminado' + (isTraining() ? ' (PRUEBA)' : ''));
          close();
        } catch(e){ console.error(e); toast('No se pudo eliminar'); }
      });
    }

    q('#pSave')?.addEventListener('click', async ()=>{
      if (!validate()){ beep(); return; }
      const state = q('#pState')?.value || 'active';
      const lim = (q('#pLimited')?.value === 'si');
      const untilRaw = q('#pUntil')?.value || '';
      const until = lim && untilRaw ? parseLocalDate(untilRaw)?.getTime() ?? null : null;

      const payload = {
        id: data.id || undefined,
        name: q('#pName').value.trim(),
        price: safeNum(q('#pPrice').value, 0),
        category: q('#pCat').value || 'burgers',
        desc: q('#pDesc').value.trim(),
        featured: (q('#pFeatured').value==='si'),
        limitedTime: lim,
        limitedUntil: until,
        sound: q('#pSound').value.trim(),
        themeTag: data.themeTag || '',
        ingredients: (q('#pIngs').value || '').split('\n').map(s=>s.trim()).filter(Boolean)
      };

      if (state==='hold'){ payload.onHold = true; payload.active = false; }
      else if (state==='active'){ payload.onHold = false; payload.active = true; }
      else { payload.onHold = false; payload.active = false; }

      try{
        await upsertArticle(payload, { training: isTraining() });
        toast('Producto guardado' + (isTraining() ? ' (PRUEBA)' : ''));
        close();
      }catch(e){ console.error(e); toast('No se pudo guardar'); }
    });
  }

  // Limpieza al salir del panel
  window.addEventListener('beforeunload', ()=>{
    try{ unsubArticles?.(); }catch{}
  });
})();

/* ========================= Arranque / Atajos ========================= */
runReports(); // primer reporte al abrir

// Ctrl/Cmd+K: foco a búsquedas (prioridad Productos si visible)
document.addEventListener('keydown',(e)=>{
  const k = String(e.key || '').toLowerCase();
  if ((e.ctrlKey||e.metaKey) && k==='k'){
    e.preventDefault();
    const prodVisible = document.getElementById('panel-prod')?.classList.contains('active');
    const el = prodVisible ? document.getElementById('prodSearch') : document.getElementById('histSearch') || document.getElementById('rcpSearch');
    el?.focus();
  }
});

// Limpieza de timers globales si quedara alguno
window.addEventListener('beforeunload', ()=>{
  try{ stopHistAutoRefresh(); }catch{}
  try{ if (HH_TIMER) clearInterval(HH_TIMER); }catch{}
});
