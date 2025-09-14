// /cocina/app.js
import * as DB from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

/* ================== Modo PRUEBA ================== */
function isTraining(){ return sessionStorage.getItem('training') === '1'; }
function setTraining(on){
  sessionStorage.setItem('training', on ? '1' : '0');
  paintTrainingBadge();
  document.title = (on ? '🧪 ' : '') + document.title.replace(/^🧪\s*/,'');
  toast(on ? 'Modo PRUEBA activo (no escribe en Firestore)' : 'Modo PRUEBA desactivado');
}
function paintTrainingBadge(){
  let b = document.getElementById('kitchenTrainingBadge');
  if (!b) {
    b = document.createElement('button');
    b.id = 'kitchenTrainingBadge';
    b.className = 'btn tiny';
    Object.assign(b.style, {
      position:'fixed', left:'14px', bottom:'14px', zIndex:9999,
      borderRadius:'999px', opacity:.92
    });
    b.addEventListener('click', ()=> setTraining(!isTraining()));
    document.body.appendChild(b);
  }
  const on = isTraining();
  b.textContent = on ? 'PRUEBA: ON' : 'PRUEBA: OFF';
  b.classList.toggle('danger', on);
  b.classList.toggle('ghost', !on);
}
document.addEventListener('DOMContentLoaded', paintTrainingBadge);

/* ================== Shims DB (compat) ================== */
function subscribeOrdersShim(cb){
  if (typeof DB.subscribeOrders === 'function') return DB.subscribeOrders(cb);
  if (typeof DB.onOrdersSnapshot === 'function') return DB.onOrdersSnapshot(cb);
  if (typeof DB.subscribeActiveOrders === 'function') return DB.subscribeActiveOrders(cb);
  console.warn('[cocina] No hay método de suscripción a órdenes en DB'); return ()=>{};
}
async function setStatusShim(id, status, opts){
  if (typeof DB.setOrderStatus === 'function') return DB.setOrderStatus(id, status, opts);
  if (typeof DB.setStatus === 'function') return DB.setStatus(id, status, opts);
  throw new Error('No hay setOrderStatus/setStatus en DB');
}
async function updateOrderShim(id, patch, opts){
  if (typeof DB.updateOrder === 'function') return DB.updateOrder(id, patch, opts);
  if (typeof DB.upsertOrder === 'function') return DB.upsertOrder({ id, ...patch }, opts);
  console.warn('[cocina] updateOrder no disponible; patch ignorado:', patch);
}
async function archiveDeliveredShim(id, finalStatus='DONE', opts){
  if (typeof DB.archiveDelivered === 'function') return DB.archiveDelivered(id, opts);
  await setStatusShim(id, finalStatus, opts);
}
async function applyInventoryForOrderShim(order, opts){
  if (typeof DB.applyInventoryForOrder === 'function') {
    try { await DB.applyInventoryForOrder(order, opts); } catch(e){ console.warn('applyInventoryForOrder error', e); }
  }
}

/* ================== Constantes ================== */
const Status = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  DONE: 'DONE'
};

let CURRENT_LIST = [];
const LOCALLY_TAKEN = new Set();

/* ================== Time helpers ================== */
const now = ()=> new Date();
const toMs = (t)=> {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds != null) return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
  const d = new Date(t); const ms = d.getTime(); return Number.isFinite(ms) ? ms : 0;
};
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);
const getPhone = (o)=> (o?.phone ?? o?.meta?.phone ?? o?.customer?.phone ?? '').toString().trim();
const fmtMMSS = (ms)=>{
  const s = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(s/60);
  const ss = s % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
};
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/* ================== Dedupe & merge helpers ================== */
function updatedAtMs(o){
  return toMs(o.updatedAt || o.timestamps?.updatedAt || o.readyAt || o.startedAt || o.createdAt || o.timestamps?.createdAt);
}
function mergeByNewest(list){
  const byId = new Map();
  for (const raw of (Array.isArray(list) ? list : [])) {
    if (!raw?.id) continue;
    const o = { ...raw };
    if (!o.createdAt) o.createdAt = o.timestamps?.createdAt || new Date();
    const prev = byId.get(o.id);
    if (!prev || updatedAtMs(o) >= updatedAtMs(prev)) byId.set(o.id, o);
  }
  return Array.from(byId.values());
}
function patchLocal(id, patch){
  let changed = false;
  CURRENT_LIST = CURRENT_LIST.map(o=>{
    if (o.id !== id) return o;
    changed = true;
    return { ...o, ...patch, timestamps: { ...(o.timestamps||{}), ...extractTimestamps(patch) } };
  });
  if (!changed) {
    // si no estaba (raro), al menos créalo para que no duplique
    CURRENT_LIST.push({ id, ...patch, timestamps: extractTimestamps(patch) });
  }
}
function extractTimestamps(patch){
  const t = {};
  for (const k of Object.keys(patch||{})){
    if (k.startsWith('timestamps.')){
      const sub = k.split('.').slice(1).join('.');
      t[sub] = patch[k];
    }
  }
  return t;
}

/* ================== Data stream ================== */
// Guard contra múltiples suscripciones accidentales
let __streamLocked = false;
const unsub = subscribeOrdersShim((orders = [])=>{
  if (__streamLocked) return;           // evita carrera si el proveedor llama múltiple en el mismo tick
  __streamLocked = true;
  try {
    CURRENT_LIST = mergeByNewest(orders);
    render(CURRENT_LIST);
  } finally {
    queueMicrotask(()=>{ __streamLocked = false; });
  }
});

/* ================== Totales ================== */
function calcSubtotal(o={}){
  const items = Array.isArray(o.items) ? o.items : [];
  return items.reduce((s,it)=>{
    const line = (typeof it.lineTotal === 'number')
      ? Number(it.lineTotal||0)
      : (Number(it.unitPrice||0) * Number(it.qty||1));
    return s + line;
  },0);
}
function calcTotal(o={}){
  const sub = (typeof o.subtotal === 'number') ? Number(o.subtotal||0) : calcSubtotal(o);
  const tip = Number(o.tip||0);
  return sub + tip;
}

/* ================== Render ================== */
function render(list){
  const by = (list||[]).reduce((acc,o)=>{
    const s = o?.status || Status.PENDING;
    (acc[s] ||= []).push(o);
    return acc;
  },{});

  setCol('col-pending',  by.PENDING||[]);
  setCol('col-progress', by.IN_PROGRESS||[]);
  setCol('col-ready',    by.READY||[]);
  const bill = (by.DELIVERED||[]).filter(o => !o.paid);
  setCol('col-bill',     bill);
}
function setCol(id, arr){
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = (arr||[]).map(renderCard).join('') || '<div class="empty">—</div>';
}

/* ================== Card ================== */
function renderCard(o={}){
  const items = Array.isArray(o.items) && o.items.length
    ? o.items
    : (o.item ? [{
        id:o.item.id, name:o.item.name, qty:o.qty||1, unitPrice:o.item.price||0,
        baseIngredients:o.baseIngredients||[], salsaDefault:o.salsaDefault||null,
        salsaCambiada:o.salsaCambiada||null, extras:o.extras||{}, notes:o.notes||'',
        lineTotal: (o.item?.price||0) * (o.qty||1)
      }] : []);

  let meta = '—';
  if (o.orderType === 'dinein') meta = `Mesa: <b>${escapeHtml(o.table||'?')}</b>`;
  else if (o.orderType === 'pickup') meta = 'Pickup';
  else if (o.orderType) meta = escapeHtml(o.orderType);

  const total = calcTotal(o);
  const phone = getPhone(o);
  const phoneTxt = phone ? ` · Tel: <b>${escapeHtml(String(phone))}</b>` : '';

  const tCreated = toMs(o.createdAt || o.timestamps?.createdAt);
  const tStarted = toMs(o.startedAt || o.timestamps?.startedAt);
  const tReady   = toMs(o.readyAt   || o.timestamps?.readyAt);
  const tNow     = Date.now();
  const totalRunMs   = (tReady || tNow) - (tCreated || tNow);
  const inKitchenMs  = (tReady || tNow) - (tStarted || tNow);

  const timerHtml = `
    <div class="muted small mono" style="margin-top:6px">
      ⏱️ Total: <b>${fmtMMSS(totalRunMs)}</b>
      ${tStarted ? ` · 👩‍🍳 En cocina: <b>${fmtMMSS(inKitchenMs)}</b>` : ''}
    </div>
  `;

  const itemsHtml = items.map(it=>{
    const ingr = (it.baseIngredients||[]).map(i=>`<div class="k-badge">${escapeHtml(i)}</div>`).join('');
    const extrasBadges = [
      ...(it.extras?.sauces||[]).map(s=>`<div class="k-badge">Aderezo: ${escapeHtml(s)}</div>`),
      ...(it.extras?.ingredients||[]).map(s=>`<div class="k-badge">Extra: ${escapeHtml(s)}</div>`),
      (it.extras?.dlcCarne ? '<div class="k-badge">DLC carne 85g</div>' : '')
    ].join('');
    const salsaInfo = it.salsaCambiada
      ? `Salsa: <b>${escapeHtml(it.salsaCambiada)}</b> (cambio)`
      : (it.salsaDefault ? `Salsa: ${escapeHtml(it.salsaDefault)}` : '');
    return `
      <div class="order-item">
        <h4>${escapeHtml(it.name||'Producto')} · x${it.qty||1}</h4>
        ${salsaInfo ? `<div class="muted small">${salsaInfo}</div>` : ''}
        ${it.notes ? `<div class="muted small">Notas: ${escapeHtml(it.notes)}</div>` : ''}
        <div class="k-badges" style="margin-top:6px">${ingr}${extrasBadges}</div>
      </div>`;
  }).join('');

  const hh = o.hh || {};
  const hhSummary = (hh.enabled && Number(hh.totalDiscount||0)>0)
    ? `<span class="k-badge">HH -${Number(hh.discountPercent||0)}% · ahorro ${money(hh.totalDiscount)}</span>`
    : '';

  const canShowTake = (o.status === Status.PENDING) && !LOCALLY_TAKEN.has(o.id);
  const actions = [
    canShowTake ? `<button class="btn" data-a="take">Tomar</button>` : '',
    (o.status === Status.IN_PROGRESS) ? `<button class="btn ok" data-a="ready">Listo</button>` : '',
    (o.status === Status.READY) ? `<button class="btn ok" data-a="deliver">Entregar</button>` : '',
    (o.status === Status.DELIVERED && !o.paid) ? `<button class="btn" data-a="charge">Cobrar</button>` : '',
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS || (o.status===Status.DELIVERED && !o.paid))
      ? `<button class="btn ghost" data-a="edit">Editar</button>` : '',
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS || (o.status===Status.DELIVERED && !o.paid))
      ? `<button class="btn warn" data-a="cancel">Eliminar</button>` : ''
  ].join('');

  return `
<article class="k-card" data-id="${o.id}">
  <div class="muted small">
    Cliente: <b>${escapeHtml(o.customer||'-')}</b>${phoneTxt} · ${meta}
  </div>
  <div class="muted small mono" style="margin-top:4px">
    Total por cobrar: <b>${money(total)}</b> ${o.paid ? '· <span class="k-badge ok">Pagado</span>' : ''} ${hhSummary}
  </div>
  ${timerHtml}
  ${itemsHtml}
  ${o.notes ? `<div class="muted small"><b>Notas generales:</b> ${escapeHtml(o.notes)}</div>` : ''}
  <div class="k-actions" style="margin-top:8px">${actions}</div>
</article>`;
}

/* ================== Actions (optimistas) ================== */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const card = btn.closest('[data-id]'); const id = card?.dataset?.id; if(!id) return;
  const a = btn.dataset.a;
  const OPTS = { training: isTraining() };

  btn.disabled = true;
  try{
    if (a==='take'){
      LOCALLY_TAKEN.add(id);
      btn.textContent = 'Tomando…';
      const order = CURRENT_LIST.find(x=>x.id===id);
      if(order){ await applyInventoryForOrderShim({ ...order, id }, OPTS); }
      // ⬇️ Optimista: mover a IN_PROGRESS en el cliente para evitar duplicado
      patchLocal(id, { status: Status.IN_PROGRESS, startedAt: now(), 'timestamps.startedAt': now() });
      render(CURRENT_LIST);
      await setStatusShim(id, Status.IN_PROGRESS, OPTS);
      await updateOrderShim(id, { startedAt: now(), 'timestamps.startedAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
      beep(); toast('En preparación');
      return;
    }

    if (a==='ready'){
      patchLocal(id, { status: Status.READY, readyAt: now(), 'timestamps.readyAt': now() });
      render(CURRENT_LIST);
      await setStatusShim(id, Status.READY, OPTS);
      await updateOrderShim(id, { readyAt: now(), 'timestamps.readyAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
      beep(); toast('Listo 🛎️');
      return;
    }

    if (a==='deliver'){
      patchLocal(id, { status: Status.DELIVERED, deliveredAt: now(), 'timestamps.deliveredAt': now() });
      render(CURRENT_LIST);
      await setStatusShim(id, Status.DELIVERED, OPTS);
      await updateOrderShim(id, { deliveredAt: now(), 'timestamps.deliveredAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
      beep(); toast('Entregado ✔️ · por cobrar');
      return;
    }

    if (a==='charge'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const total = calcTotal(order);
      const method = prompt(`Cobrar ${money(total)}\nMétodo (efectivo / tarjeta / transferencia):`, 'efectivo');
      if (method === null) { btn.disabled=false; return; }
      const payMethod = String(method||'efectivo').toLowerCase();

      patchLocal(id, { paid: true, paidAt: now(), payMethod, totalCharged: Number(total) });
      render(CURRENT_LIST);

      await updateOrderShim(id, {
        paid: true,
        paidAt: now(),
        payMethod,
        totalCharged: Number(total),
        updatedAt: now(), 'timestamps.updatedAt': now()
      }, OPTS);

      await archiveDeliveredShim(id, Status.DONE, OPTS);
      beep(); toast('Cobro registrado' + (isTraining() ? ' (PRUEBA)' : ''));
      card.remove();
      return;
    }

    if (a==='edit'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const notes = prompt('Editar notas generales para cocina:', order.notes||'');
      if (notes!==null){
        patchLocal(id, { notes, updatedAt: now(), 'timestamps.updatedAt': now() });
        render(CURRENT_LIST);
        await updateOrderShim(id,{ notes, updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
        toast('Notas actualizadas' + (isTraining() ? ' (PRUEBA)' : ''));
      }
      return;
    }

    if (a==='cancel'){
      const confirmDelete = confirm('¿Eliminar este pedido? Pasará a CANCELLED y se archivará.');
      if (!confirmDelete) return;

      const reason = prompt('Motivo de cancelación (obligatorio):', '');
      if (reason === null) return;
      const trimmed = String(reason).trim();
      if (!trimmed) { alert('Por favor escribe un motivo.'); return; }

      patchLocal(id, { status: Status.CANCELLED, cancelReason: trimmed, cancelledAt: now() });
      render(CURRENT_LIST);

      await updateOrderShim(id, {
        status: Status.CANCELLED,
        cancelReason: trimmed,
        cancelledAt: now(),
        cancelledBy: 'kitchen',
        updatedAt: now(), 'timestamps.updatedAt': now()
      }, OPTS);

      await archiveDeliveredShim(id, Status.DONE, OPTS);
      beep(); toast('Pedido eliminado' + (isTraining() ? ' (PRUEBA)' : ''));
      card.remove();
      return;
    }

  }catch(err){
    console.error(err);
    toast('Error al actualizar');
    if(a==='take'){ LOCALLY_TAKEN.delete(id); }
  }finally{
    btn.disabled = false;
  }
});

/* ========== Refresco ligero de timers ========== */
setInterval(()=>{
  if (!CURRENT_LIST.length) return;
  render(CURRENT_LIST);
}, 15000);

/* ========== Limpieza ========== */
window.addEventListener('beforeunload', ()=>{ try{ unsub && unsub(); }catch{} });