// Cocina — Seven de Burgers
// Kiosko V2 · app.js (2025-11) — Drop-in replacement
// - Escucha pedidos en tiempo real desde shared/db.js
// - Agrupa por estado: Pendientes / En progreso / Listos / Por cobrar / Entregados
// - Total en "Por cobrar"
// - Sin dependencias rotas: detecta funciones disponibles en DB de forma segura

/* ======================= Imports ======================= */
import { ensureAuth } from '../shared/firebase.js?v=20251106a';
import * as DB from '../shared/db.js?v=20251106a';
import { beep, toast } from '../shared/notify.js?v=20251106a';
import { initThemeFromSettings } from '../shared/theme.js?v=20251106a';

/* ======================= Estado ======================= */
const state = {
  orders: new Map(),   // id -> order normalizado
  unsub: null,
  totalToCharge: 0
};

/* ======================= Helpers genéricos ======================= */
const money = (n) => '$' + Number(n || 0).toFixed(0);

function toDate(v){
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  // Firestore Timestamp
  if (typeof v === 'object' && v.seconds != null){
    return new Date(v.seconds * 1000 + (v.nanoseconds||0)/1e6);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtTime(v){
  const d = toDate(v);
  if (!d) return '';
  const hh = d.getHours().toString().padStart(2,'0');
  const mm = d.getMinutes().toString().padStart(2,'0');
  return `${hh}:${mm}`;
}

function safeText(v){
  if (v == null) return '';
  return String(v)
    .replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'}[c]));
}

/* ======================= DOM referencias ======================= */

const col = {
  pending:    document.querySelector('[data-col="pending"]')    || document.getElementById('colPending'),
  cooking:    document.querySelector('[data-col="cooking"]')    || document.getElementById('colCooking'),
  ready:      document.querySelector('[data-col="ready"]')      || document.getElementById('colReady'),
  toCharge:   document.querySelector('[data-col="toCharge"]')   || document.getElementById('colToCharge'),
  delivered:  document.querySelector('[data-col="delivered"]')  || document.getElementById('colDelivered'),
};
const totalEl = document.getElementById('totalAmount') || document.querySelector('[data-total]');

// Si el HTML original solo tiene paneles vacíos, asegúranos de que haya contenedores internos
for (const key of Object.keys(col)){
  const c = col[key];
  if (!c) continue;
  if (!c.querySelector('.k-list')){
    const wrap = document.createElement('div');
    wrap.className = 'k-list';
    c.appendChild(wrap);
  }
}

/* ======================= Normalización de estados ======================= */

function mapStatus(rawStatus){
  const s = String(rawStatus || '').toUpperCase();

  if (s === 'PENDING' || s === '' || s === 'NEW') return 'pending';
  if (s === 'COOKING' || s === 'IN_PROGRESS' || s === 'PREPARING') return 'cooking';
  if (s === 'READY') return 'ready';
  if (s === 'TO_CHARGE' || s === 'PENDING_PAY' || s === 'UNPAID') return 'toCharge';
  if (s === 'DONE' || s === 'DELIVERED' || s === 'FINISHED') return 'delivered';

  // fallback conservador
  return 'pending';
}

/* ======================= Suscripción a pedidos ======================= */

function startOrdersListener(){
  if (state.unsub) { try{ state.unsub(); }catch{} state.unsub = null; }

  // Handler flexible: acepta QuerySnapshot o {added, modified, removed}
  const handle = (payload) => {
    try{
      if (!payload) return;

      // Forma Firestore QuerySnapshot
      if (payload.docChanges && typeof payload.docChanges === 'function'){
        payload.docChanges().forEach(change => {
          const doc = change.doc;
          const data = doc.data ? doc.data() : doc;
          applyChange(change.type, doc.id, data);
        });
      }
      // Forma { added, modified, removed }
      else if (payload.added || payload.modified || payload.removed){
        (payload.added || []).forEach(doc => applyChange('added',  doc.id || doc.orderId || doc.uid, doc));
        (payload.modified || []).forEach(doc => applyChange('modified', doc.id || doc.orderId || doc.uid, doc));
        (payload.removed || []).forEach(doc => applyChange('removed', doc.id || doc.orderId || doc.uid, doc));
      }
      else if (Array.isArray(payload)){
        // Snapshot completo: reseteamos y cargamos todo
        state.orders.clear();
        payload.forEach(doc => {
          const id = doc.id || doc.orderId || doc.uid;
          if (!id) return;
          applyChange('added', id, doc);
        });
      }

      renderAll();
    }catch(e){
      console.error('[cocina] handle snapshot error', e);
      toast('Error actualizando tablero de cocina');
    }
  };

  // Intentamos varios nombres para máxima compatibilidad
  try{
    if (typeof DB.subscribeKitchenOrders === 'function'){
      state.unsub = DB.subscribeKitchenOrders(handle);
      console.info('[cocina] usando DB.subscribeKitchenOrders');
      return;
    }
    if (typeof DB.subscribeOrders === 'function'){
      state.unsub = DB.subscribeOrders(handle);
      console.info('[cocina] usando DB.subscribeOrders');
      return;
    }
    if (typeof DB.listenOrders === 'function'){
      state.unsub = DB.listenOrders(handle);
      console.info('[cocina] usando DB.listenOrders');
      return;
    }
    if (typeof DB.onOrdersSnapshot === 'function'){
      state.unsub = DB.onOrdersSnapshot(handle);
      console.info('[cocina] usando DB.onOrdersSnapshot');
      return;
    }

    console.error('[cocina] No encontré función de suscripción en DB');
    toast('⚠️ Cocina sin conexión a pedidos (revisar shared/db.js)');
  }catch(e){
    console.error('[cocina] Error iniciando listener', e);
    toast('⚠️ No se pudo conectar a pedidos');
  }
}

function applyChange(type, id, raw){
  if (!id) return;
  if (type === 'removed'){
    state.orders.delete(id);
    return;
  }
  if (!raw) return;

  // Algunos wrappers pasan { id, data }
  const data = raw.data && typeof raw.data === 'function' ? raw.data() : raw;

  const statusKey = mapStatus(data.status);
  const createdAt = data.createdAt || data.ts || data.created || null;
  const total = Number(
    data.total ??
    data.totalCents/100 ??
    data.amount ??
    0
  );

  const shortId =
    data.shortId ||
    data.code ||
    (id.length > 6 ? '...' + id.slice(-4) : id);

  const name =
    data.customerName ||
    data.name ||
    data.orderMeta?.name ||
    data.orderMeta?.customerName ||
    '';

  const table =
    data.table ||
    data.orderMeta?.table ||
    data.orderMeta?.spot ||
    '';

  const payMethod =
    data.payMethod ||
    data.orderMeta?.payMethod ||
    data.orderMeta?.payMethodPref ||
    '';

  const channel =
    data.channel ||
    data.source ||
    'kiosk';

  const items = Array.isArray(data.items) ? data.items : (data.lines || []);

  const norm = {
    id,
    shortId,
    status: statusKey,
    rawStatus: data.status || '',
    createdAt,
    total,
    name,
    table,
    payMethod,
    channel,
    items
  };

  state.orders.set(id, norm);
}

/* ======================= Render ======================= */

function clearCols(){
  for (const key of Object.keys(col)){
    const c = col[key];
    if (!c) continue;
    const list = c.querySelector('.k-list') || c;
    list.innerHTML = '';
  }
}

function renderAll(){
  clearCols();

  const all = Array.from(state.orders.values());

  // orden: más viejos primero
  all.sort((a,b)=>{
    const da = toDate(a.createdAt)?.getTime() ?? 0;
    const db = toDate(b.createdAt)?.getTime() ?? 0;
    return da - db;
  });

  let sumToCharge = 0;

  for (const o of all){
    const colName = o.status || 'pending';
    const target =
      (colName === 'pending'   && col.pending)
      || (colName === 'cooking'   && col.cooking)
      || (colName === 'ready'     && col.ready)
      || (colName === 'toCharge'  && col.toCharge)
      || (colName === 'delivered' && col.delivered)
      || col.pending;

    if (!target) continue;

    const list = target.querySelector('.k-list') || target;

    const el = document.createElement('div');
    el.className = 'k-card';
    el.dataset.id = o.id;

    const itemsText = buildItemsText(o.items);

    el.innerHTML = `
      <div class="k-head">
        <div class="title">
          #${safeText(o.shortId)} 
          ${o.table ? `· ${safeText(o.table)}` : ''}
        </div>
        <div class="muted small">
          ${fmtTime(o.createdAt)} 
          ${o.channel ? `· ${safeText(o.channel)}` : ''}
        </div>
      </div>
      <div class="k-body small">
        ${itemsText || '<span class="muted">Sin detalle</span>'}
      </div>
      <div class="k-badges">
        ${o.name ? `<span class="k-badge">${safeText(o.name)}</span>` : ''}
        ${o.payMethod ? `<span class="k-badge">${safeText(o.payMethod)}</span>` : ''}
        ${o.rawStatus && o.rawStatus !== o.status
          ? `<span class="k-badge warn">${safeText(o.rawStatus)}</span>` : ''}
        ${o.total ? `<span class="k-badge ok">${money(o.total)}</span>` : ''}
      </div>
      <div class="k-actions">
        ${actionsFor(o)}
      </div>
    `;

    list.appendChild(el);

    if (colName === 'toCharge') sumToCharge += o.total || 0;
  }

  state.totalToCharge = sumToCharge;
  if (totalEl){
    totalEl.textContent = money(sumToCharge);
  }

  wireActions();
}

function buildItemsText(items){
  if (!Array.isArray(items) || !items.length) return '';
  const parts = items.map(it=>{
    if (!it) return '';
    const name = it.name || it.title || it.id || '';
    const qty = it.qty || it.quantity || 1;
    return `${qty>1?qty+'× ':''}${name}`;
  }).filter(Boolean);
  return safeText(parts.join(' · '));
}

function actionsFor(o){
  const idAttr = `data-id="${o.id}"`;
  switch(o.status){
    case 'pending':
      return `
        <button class="btn small" data-a="toCooking" ${idAttr}>Tomar</button>
        <button class="btn small ghost" data-a="cancel" ${idAttr}>Cancelar</button>
      `;
    case 'cooking':
      return `
        <button class="btn small" data-a="toReady" ${idAttr}>Listo</button>
        <button class="btn small ghost" data-a="backPending" ${idAttr}>Regresar</button>
      `;
    case 'ready':
      return `
        <button class="btn small" data-a="toCharge" ${idAttr}>Por cobrar</button>
        <button class="btn small ghost" data-a="toDelivered" ${idAttr}>Entregado</button>
      `;
    case 'toCharge':
      return `
        <button class="btn small" data-a="toDelivered" ${idAttr}>Cobrado / Entregado</button>
      `;
    case 'delivered':
    default:
      return '';
  }
}

/* ======================= Acciones (update en DB) ======================= */

async function updateOrderStatus(id, status){
  const patch = { status };

  try{
    if (typeof DB.updateOrderStatus === 'function'){
      await DB.updateOrderStatus(id, status, patch);
    } else if (typeof DB.setOrderStatus === 'function'){
      await DB.setOrderStatus(id, status, patch);
    } else if (typeof DB.updateOrder === 'function'){
      await DB.updateOrder(id, patch);
    } else if (typeof DB.patchOrder === 'function'){
      await DB.patchOrder(id, patch);
    } else {
      console.warn('[cocina] No hay función clara para actualizar status, haciendo fallback');
      if (typeof DB.saveOrder === 'function'){
        await DB.saveOrder(id, patch);
      } else {
        toast('No se pudo actualizar (falta método en DB)');
        return;
      }
    }
    beep();
  }catch(e){
    console.error('[cocina] updateOrderStatus fail', e);
    toast('Error actualizando pedido');
  }
}

async function cancelOrder(id){
  if (!confirm('¿Cancelar este pedido?')) return;
  await updateOrderStatus(id, 'CANCELLED');
}

function wireActions(){
  const root = document.body;
  root.onclick = async (ev)=>{
    const btn = ev.target.closest('button[data-a]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-a');
    if (!id || !action) return;

    if (action === 'toCooking')      await updateOrderStatus(id, 'COOKING');
    else if (action === 'backPending') await updateOrderStatus(id, 'PENDING');
    else if (action === 'toReady')   await updateOrderStatus(id, 'READY');
    else if (action === 'toCharge')  await updateOrderStatus(id, 'TO_CHARGE');
    else if (action === 'toDelivered') await updateOrderStatus(id, 'DELIVERED');
    else if (action === 'cancel')    await cancelOrder(id);
  };
}

/* ======================= Init ======================= */

init().catch(e=>console.error(e));

async function init(){
  console.info('[cocina] init…');

  try{
    await ensureAuth();
  }catch(e){
    console.warn('[cocina] auth anónima falló (continuando)', e);
  }

  initThemeFromSettings?.({ defaultName:'Base' });

  // Mensaje visual si alguien dejó el kiosko en modo entrenamiento
  try{
    const training = sessionStorage.getItem('training');
    if (training === '1'){
      toast('🧪 Modo entrenamiento: pedidos ficticios (cocina no verá reales)');
    }
  }catch{}

  startOrdersListener();

  // Fallback: si después de un rato no hay pedidos ni errores, avisar
  setTimeout(()=>{
    if (!state.orders.size){
      console.info('[cocina] sin pedidos aún. Si kiosko está vendiendo y aquí no salen, revisar rutas y DB.');
    }
  }, 8000);
}

/* ======================= Limpieza ======================= */

window.addEventListener('beforeunload', ()=>{
  try{ state.unsub?.(); }catch{}
});
