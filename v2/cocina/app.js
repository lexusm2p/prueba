// /v2/cocina/app.js — Seven de Burgers · Versión 2 (compatible DB v2)
// - Escucha pedidos en tiempo real usando los métodos disponibles en shared/db.js
// - Compatible con: subscribeKitchenOrders / subscribeActiveOrders / subscribeOrders / onOrdersSnapshot / listenOrders
// - Mapea estados viejos/nuevos (PENDING, IN_PROGRESS, READY, AR, READY_TO_CHARGE, TO_CHARGE, DELIVERED, COMPLETED, CANCELLED)
// - Solo frontend: no toca estructura HTML ni estilos de index.html

import { ensureAuth } from '../shared/firebase.js?v=20251106a';
import * as DB from '../shared/db.js?v=20251106a';

/* ===========================
   Estado
   =========================== */
const state = {
  orders: new Map(),   // id → order normalizado
  unsub: null,
  loading: true
};

/* ===========================
   Utils base
   =========================== */
const $ = (id) => document.getElementById(id) || null;

function money(n){
  const v = Number(n || 0);
  return '$' + v.toFixed(0);
}

function safe(v, def = ''){
  return (v === undefined || v === null) ? def : String(v);
}

/* ===========================
   Normalización de snapshot
   =========================== */

function normalizeSnapshot(snap){
  // 1) Array directo
  if (Array.isArray(snap)) return snap.filter(Boolean);

  // 2) { docs: [...] } tipo Firestore
  if (snap && Array.isArray(snap.docs)){
    return snap.docs
      .map(d => {
        const data = (typeof d.data === 'function') ? d.data() : d.data;
        if (!data) return null;
        return { id: d.id || data.id, ...data };
      })
      .filter(Boolean);
  }

  // 3) Objeto con .orders o similar
  if (snap && Array.isArray(snap.orders)) return snap.orders.filter(Boolean);

  // 4) Nada reconocible
  console.warn('[cocina] snapshot no reconocido', snap);
  return [];
}

/* ===========================
   Normalizar / mapear estados
   =========================== */

function mapStatus(raw){
  const s = String(raw || '').toUpperCase();

  if (!s) return 'PENDING';
  if (s === 'READY_TO_CHARGE' || s === 'TO_CHARGE' || s === 'AR') return 'AR';
  if (s === 'COMPLETED' || s === 'DONE' || s === 'DELIVERED_OK') return 'DELIVERED';

  // Estados soportados directamente:
  // PENDING, IN_PROGRESS, READY, DELIVERED, CANCELLED
  return s;
}

function isVisibleForKitchen(o){
  if (!o) return false;
  if (o.deleted) return false;

  const s = mapStatus(o.status);
  // Mostramos todos los relevantes para cocina:
  return [
    'PENDING',
    'IN_PROGRESS',
    'READY',
    'AR',
    'DELIVERED',
    'CANCELLED'
  ].includes(s);
}

function normalizeOrder(raw){
  if (!raw) return null;
  const id = raw.id || raw.orderId || raw._id;
  if (!id) return null;

  const status = mapStatus(raw.status || 'PENDING');

  // timestamp: usa createdAt || ts || firestore date
  let createdAt = raw.createdAt || raw.ts || raw.timestamp || null;
  if (createdAt && typeof createdAt === 'object' && 'toMillis' in createdAt){
    try { createdAt = createdAt.toMillis(); } catch { createdAt = Date.now(); }
  }
  if (createdAt && typeof createdAt === 'object' && 'seconds' in createdAt){
    createdAt = (raw.createdAt.seconds * 1000) || Date.now();
  }
  if (!createdAt) createdAt = Date.now();

  const items = Array.isArray(raw.items) ? raw.items : [];
  const subtotal = Number(raw.subtotal || raw.total || raw.amount || 0);

  return {
    id,
    status,
    createdAt,
    customer: safe(raw.customer || raw.name || raw.customerName || ''),
    table: safe(raw.table || ''),
    phone: safe(raw.phone || ''),
    payMethodPref: safe(raw.payMethodPref || raw.payMethod || ''),
    note: safe(raw.notes || raw.note || ''),
    items,
    subtotal,
    raw
  };
}

/* ===========================
   Render
   =========================== */

function clearLists(){
  ['lP','lI','lR','lA','lD'].forEach(id=>{
    const el = $(id);
    if (el) el.innerHTML = '';
  });
  ['cP','cI','cR','cA','cD'].forEach(id=>{
    const el = $(id);
    if (el) el.textContent = '0';
  });
}

function render(){
  clearLists();

  const byStatus = {
    PENDING: [],
    IN_PROGRESS: [],
    READY: [],
    AR: [],
    DELIVERED: [],
    CANCELLED: []
  };

  for (const order of state.orders.values()){
    if (!isVisibleForKitchen(order)) continue;
    byStatus[order.status] = byStatus[order.status] || [];
    byStatus[order.status].push(order);
  }

  // Ordenar por createdAt
  Object.values(byStatus).forEach(list=>{
    list.sort((a,b)=> (a.createdAt||0) - (b.createdAt||0));
  });

  const map = {
    PENDING: { list:'lP', count:'cP' },
    IN_PROGRESS: { list:'lI', count:'cI' },
    READY: { list:'lR', count:'cR' },
    AR: { list:'lA', count:'cA' },
    DELIVERED: { list:'lD', count:'cD' },
    CANCELLED: null
  };

  // PENDIENTES
  fillColumn('PENDING', map, byStatus, (o)=> orderCard(o, [
    { label:'Tomar',    action:'IN_PROGRESS', variant:'primary' },
    { label:'Listo',    action:'READY' },
    { label:'Cancelar', action:'CANCELLED', variant:'danger' }
  ]));

  // EN PROGRESO
  fillColumn('IN_PROGRESS', map, byStatus, (o)=> orderCard(o, [
    { label:'Listo',    action:'READY', variant:'primary' },
    { label:'Cancelar', action:'CANCELLED', variant:'danger' }
  ]));

  // LISTOS
  fillColumn('READY', map, byStatus, (o)=> orderCard(o, [
    { label:'Cobrar',   action:'AR', variant:'primary' },
    { label:'Entregar', action:'DELIVERED' }
  ]));

  // POR COBRAR (AR)
  fillColumn('AR', map, byStatus, (o)=> orderCard(o, [
    { label:'Entregar', action:'DELIVERED', variant:'primary' }
  ]));

  // ENTREGADOS
  fillColumn('DELIVERED', map, byStatus, (o)=> orderCard(o, [
    { label:'↺ Pendiente', action:'PENDING' }
  ]));

  // Contadores
  Object.entries(map).forEach(([status, ids])=>{
    if (!ids) return;
    const cEl = $(ids.count);
    if (cEl){
      cEl.textContent = String(byStatus[status]?.length || 0);
    }
  });

  // Mensaje vacío general si no hay nada
  const totalActivos =
    (byStatus.PENDING.length +
     byStatus.IN_PROGRESS.length +
     byStatus.READY.length +
     byStatus.AR.length);

  if (!totalActivos && state.loading === false){
    const lp = $('lP');
    if (lp && !lp.children.length){
      lp.innerHTML = `<div class="muted">Sin pedidos activos.</div>`;
    }
  }
}

function fillColumn(status, map, byStatus, makeCard){
  const conf = map[status];
  if (!conf) return;
  const listEl = $(conf.list);
  if (!listEl) return;

  const list = byStatus[status] || [];
  if (!list.length){
    if (status === 'PENDING'){
      listEl.innerHTML = `<div class="muted">Esperando pedidos…</div>`;
    }
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach(o => {
    const card = makeCard(o);
    if (card) frag.appendChild(card);
  });
  listEl.innerHTML = '';
  listEl.appendChild(frag);
}

function orderCard(order, actions){
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = order.id;

  const time = formatTime(order.createdAt);
  const title = order.customer || (order.table ? `Mesa ${order.table}` : `Orden ${order.id.slice(-4)}`);
  const pm = order.payMethodPref ? ` · ${order.payMethodPref}` : '';
  const table = order.table ? `Mesa ${order.table}` : '';
  const badge = table || (order.phone ? `📱 ${order.phone}` : '');

  const itemsHtml = (order.items || []).map(it=>{
    const qty = it.qty || 1;
    const name = safe(it.name || it.id, 'Producto');
    return `<div class="it">
      <span>${qty}× ${escapeHtml(name)}</span>
    </div>`;
  }).join('');

  const noteHtml = order.note
    ? `<div class="muted">📝 ${escapeHtml(order.note)}</div>`
    : '';

  const actionsHtml = (actions || []).map(a=>{
    const cls = ['btn','small'];
    if (a.variant === 'danger') cls.push('danger');
    if (a.variant === 'primary') cls.push('primary');
    return `<button class="${cls.join(' ')}" data-act="${a.action}">${escapeHtml(a.label)}</button>`;
  }).join('');

  el.innerHTML = `
    <div class="h">
      <div><b>${escapeHtml(title)}</b></div>
      <div class="muted">${time}${pm}</div>
    </div>
    ${badge ? `<div class="muted">${escapeHtml(badge)}</div>`:''}
    <div class="items">
      ${itemsHtml || '<div class="muted">Sin items</div>'}
    </div>
    ${noteHtml}
    <div class="row" style="margin-top:6px; gap:6px; align-items:center">
      <div class="total">${money(order.subtotal)}</div>
      <div class="spacer" style="flex:1"></div>
      ${actionsHtml}
    </div>
  `;

  // Delegamos clicks de botones
  el.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    handleAction(order.id, act);
  });

  return el;
}

function escapeHtml(str=''){
  return String(str).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c)
  );
}

function formatTime(ts){
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${hh}:${mm}`;
}

/* ===========================
   Acciones (update status)
   =========================== */

async function handleAction(id, nextStatus){
  const o = state.orders.get(id);
  if (!o) return;

  const target = mapStatus(nextStatus);

  try{
    // Prioridad: API dedicada si existe
    if (typeof DB.updateOrderStatus === 'function'){
      await DB.updateOrderStatus(id, target);
    }
    else if (typeof DB.updateOrder === 'function'){
      await DB.updateOrder(id, { status: target });
    }
    else if (typeof DB.setOrderStatus === 'function'){
      await DB.setOrderStatus(id, target);
    } else {
      console.warn('[cocina] No hay método de actualización de estado en DB.js');
      return;
    }
  } catch (e){
    console.error('[cocina] Error al cambiar estado', e);
    alert('No se pudo actualizar el estado. Revisa la consola de administración.');
  }
}

/* ===========================
   Suscripción a pedidos
   =========================== */

function attachOrdersSubscription(){
  if (state.unsub){
    try{ state.unsub(); }catch{}
    state.unsub = null;
  }

  const handler = (snap)=>{
    const list = normalizeSnapshot(snap)
      .map(normalizeOrder)
      .filter(Boolean);

    state.orders.clear();
    for (const o of list){
      if (!isVisibleForKitchen(o)) continue;
      state.orders.set(o.id, o);
    }
    state.loading = false;
    render();
  };

  let unsub = null;

  // 1) Método dedicado de cocina (nueva versión)
  if (!unsub && typeof DB.subscribeKitchenOrders === 'function'){
    try{
      unsub = DB.subscribeKitchenOrders(handler, { includeDelivered:true });
      console.info('[cocina] usando DB.subscribeKitchenOrders');
    }catch(e){ console.warn('[cocina] fallo subscribeKitchenOrders', e); }
  }

  // 2) Active orders
  if (!unsub && typeof DB.subscribeActiveOrders === 'function'){
    try{
      unsub = DB.subscribeActiveOrders(handler);
      console.info('[cocina] usando DB.subscribeActiveOrders');
    }catch(e){ console.warn('[cocina] fallo subscribeActiveOrders', e); }
  }

  // 3) Genérico
  if (!unsub && typeof DB.subscribeOrders === 'function'){
    try{
      unsub = DB.subscribeOrders(handler);
      console.info('[cocina] usando DB.subscribeOrders');
    }catch(e){ console.warn('[cocina] fallo subscribeOrders', e); }
  }

  // 4) Compat viejo
  if (!unsub && typeof DB.onOrdersSnapshot === 'function'){
    try{
      unsub = DB.onOrdersSnapshot(handler);
      console.info('[cocina] usando DB.onOrdersSnapshot (compat)');
    }catch(e){ console.warn('[cocina] fallo onOrdersSnapshot', e); }
  }
  if (!unsub && typeof DB.listenOrders === 'function'){
    try{
      unsub = DB.listenOrders(handler);
      console.info('[cocina] usando DB.listenOrders (compat)');
    }catch(e){ console.warn('[cocina] fallo listenOrders', e); }
  }

  if (!unsub){
    console.error('[cocina] Ningún método de suscripción disponible en DB.js — no se verán pedidos.');
    state.loading = false;
    render();
    return;
  }

  state.unsub = unsub;
}

/* ===========================
   Init
   =========================== */

async function init(){
  try{
    await ensureAuth();
  }catch(e){
    console.warn('[cocina] auth anónima falló (seguimos intentando)', e);
  }

  attachOrdersSubscription();
  render();
}

init();

/* ===========================
   Limpieza al salir
   =========================== */
window.addEventListener('beforeunload', ()=>{
  try{ state.unsub && state.unsub(); }catch{}
});
