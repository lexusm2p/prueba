// Cocina — tablero de preparación (anti-salto de scroll + ticker de timers)
// Suscribe pedidos (preferente: DB.subscribeKitchenOrders).
// Acciones optimistas: tomar, listo, entregar, cobrar, editar, cancelar.
// Modo PRUEBA: no escribe en Firestore.

import * as DB from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';
import { ensureAuth } from '../shared/firebase.js';

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
function subscribeKitchenShim(cb){
  if (typeof DB.subscribeKitchenOrders === 'function') return DB.subscribeKitchenOrders(cb);
  if (typeof DB.subscribeOrders === 'function')        return DB.subscribeOrders(cb);
  if (typeof DB.onOrdersSnapshot === 'function')       return DB.onOrdersSnapshot(cb);
  if (typeof DB.subscribeActiveOrders === 'function')  return DB.subscribeActiveOrders(cb);
  console.warn('[cocina] No hay método de suscripción a órdenes en DB'); return ()=>{};
}
async function setStatusShim(id, status, opts){
  if (typeof DB.setOrderStatus === 'function') return DB.setOrderStatus(id, status, {}, opts);
  if (typeof DB.setStatus === 'function')      return DB.setStatus(id, status, opts);
  throw new Error('No hay setOrderStatus/setStatus en DB');
}
async function updateOrderShim(id, patch, opts){
  if (typeof DB.updateOrder === 'function')  return DB.updateOrder(id, patch, opts);
  if (typeof DB.upsertOrder === 'function')  return DB.upsertOrder({ id, ...patch }, opts);
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
  DONE: 'DONE',
  PAID: 'PAID'
};

let CURRENT_LIST = [];
const LOCALLY_TAKEN = new Set();

/* ================== Time & utils ================== */
const now = ()=> new Date();
const toMs = (t)=> {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds != null) return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
  const d = new Date(t); const ms = d.getTime(); return Number.isFinite(ms) ? ms : 0;
};
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);
const getPhone = (o)=> (o?.phone ?? o?.meta?.phone ?? o?.customer?.phone ?? '').toString().trim();
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/* ================== Dedupe & merge ================== */
function updatedAtMs(o){
  return toMs(
    o.updatedAt
    || o.timestamps?.updatedAt
    || o.readyAt
    || o.timestamps?.readyAt
    || o.startedAt
    || o.timestamps?.startedAt
    || o.createdAt
    || o.timestamps?.createdAt
  );
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

/* ================== Render control (anti-salto scroll) ================== */
let RENDER_PENDING = false;
let USER_SCROLLING = false;
let SCROLL_RESTORE = 0;
const docEl = document.scrollingElement || document.documentElement;

function preserveScrollStart(){ SCROLL_RESTORE = docEl.scrollTop; }
function preserveScrollEnd(){ if (!USER_SCROLLING) docEl.scrollTo({ top: SCROLL_RESTORE, behavior:'auto' }); }

['touchstart','mousedown','wheel'].forEach(e=>{
  document.addEventListener(e, ()=>{ USER_SCROLLING = true; }, {passive:true});
});
['touchend','mouseup','mouseleave','blur'].forEach(e=>{
  document.addEventListener(e, ()=> setTimeout(()=>{ USER_SCROLLING=false; }, 250));
});

function scheduleRender(){
  if (USER_SCROLLING) return;
  if (RENDER_PENDING) return;
  RENDER_PENDING = true;
  requestAnimationFrame(()=>{
    RENDER_PENDING = false;
    preserveScrollStart();
    try { render(CURRENT_LIST); }
    finally { preserveScrollEnd(); }
  });
}

/* ================== Data stream (auth + subscribe) ================== */
let unsub = null;

async function initKitchen(){
  try { await ensureAuth(); } catch(e){ console.warn('[cocina] anon auth fail', e); }
  let tickerStarted = false;
  unsub = subscribeKitchenShim((orders = [])=>{
    CURRENT_LIST = mergeByNewest(orders);
    scheduleRender();
    if (!tickerStarted){ startTicker(); tickerStarted = true; }
  });
}

document.addEventListener('DOMContentLoaded', initKitchen);

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
    const s = (o?.status || Status.PENDING).toUpperCase();
    (acc[s] ||= []).push(o);
    return acc;
  },{});

  setCol('col-pending',  by.PENDING||[]);
  setCol('col-progress', by.IN_PROGRESS||[]);
  setCol('col-ready',    by.READY||[]);
  const bill = (by.DELIVERED||[]).filter(o => !o.paid);
  setCol('col-bill',     bill);
}

// Pintado por lotes
function setCol(id, arr){
  const el = document.getElementById(id);
  if (!el) return;
  const html = (arr||[]).map(renderCard).join('') || '<div class="empty">—</div>';
  requestAnimationFrame(()=> { el.innerHTML = html; });
}

/* ================== Card ================== */
function renderCard(o = {}) {
  const items = Array.isArray(o.items) && o.items.length
    ? o.items
    : (o.item ? [{
        id: o.item.id, name: o.item.name, qty: o.qty || 1, unitPrice: o.item.price || 0,
        baseIngredients: o.baseIngredients || [], salsaDefault: o.salsaDefault || null,
        salsaCambiada: o.salsaCambiada || null, extras: o.extras || {}, notes: o.notes || '',
        lineTotal: (o.item?.price || 0) * (o.qty || 1)
      }] : []);

  let meta = '—';
  if (o.orderType === 'dinein') meta = `Mesa: <b>${escapeHtml(o.table || '?')}</b>`;
  else if (o.orderType === 'pickup') meta = 'Pickup';
  else if (o.orderType) meta = escapeHtml(o.orderType);

  const sub = (typeof o.subtotal === 'number')
    ? Number(o.subtotal || 0)
    : items.reduce((s, it) => s + (typeof it.lineTotal === 'number'
        ? Number(it.lineTotal || 0)
        : (Number(it.unitPrice || 0) * Number(it.qty || 1))), 0);
  const total = sub + Number(o.tip || 0);

  const phone = getPhone(o);
  const phoneTxt = phone ? ` · Tel: <b>${escapeHtml(String(phone))}</b>` : '';

  // Tiempos con data-attrs para ticker
  const tCreated = toMs(o.createdAt || o.timestamps?.createdAt) || Date.now();
  const tStarted = toMs(o.startedAt || o.timestamps?.startedAt) || 0;
  const tReady   = toMs(o.readyAt   || o.timestamps?.readyAt)   || 0;

  const timerHtml = `
    <div class="muted small mono" style="margin-top:6px">
      ⏱️ Total: <b><span class="t-total" data-t0="${tCreated}" data-t1="${tReady||''}">00:00</span></b>
      ${tStarted ? ` · 👩‍🍳 En cocina: <b><span class="t-kitchen" data-t0="${tStarted}" data-t1="${tReady||''}">00:00</span></b>` : ''}
    </div>
  `;

  const hh = o.hh || {};
  const hhSummary = (hh.enabled && Number(hh.totalDiscount || 0) > 0)
    ? `<span class="k-badge">HH -${Number(hh.discountPercent || 0)}% · ahorro ${money(hh.totalDiscount)}</span>`
    : '';

  const rw = o.rewards || {};
  const rwDiscount = (rw.type === 'discount' && Number(rw.discount || 0) > 0)
    ? `<span class="k-badge">🎁 Combo minis: -${money(Number(rw.discount || 0))}</span>` : '';
  const rwMiniDog = (rw.type === 'miniDog' && rw.miniDog)
    ? `<span class="k-badge">🌭 Mini Dog (cortesía)</span>` : '';
  const rewardsSummary = `${rwDiscount} ${rwMiniDog}`.trim();

  const itemsHtml = items.map(it => {
    const ingrBadges = (it.baseIngredients || [])
      .map(i => `<div class="k-badge">${escapeHtml(i)}</div>`).join('');

    const extraAdds = (it.adds || it.extras?.adds || it.extras?.ingredients || []);
    const extraRems = (it.removes || it.extras?.removes || []);
    const surprise  = it.extras?.surpriseSauce ? [`Sorpresa 🎁: ${it.extras.surpriseSauce}`] : [];

    const extrasBadges = [
      ...surprise.map(s => `<div class="k-badge">${escapeHtml(s)}</div>`),
      ...(it.extras?.sauces || []).map(s => `<div class="k-badge">Aderezo: ${escapeHtml(s)}</div>`),
      ...extraAdds.map(s => `<div class="k-badge">Extra: ${escapeHtml(s)}</div>`),
      ...extraRems.map(s => `<div class="k-badge warn">Sin: ${escapeHtml(s)}</div>`),
      (it.extras?.dlcCarne ? '<div class="k-badge">DLC carne 85g</div>' : '')
    ].join('');

    const salsaInfo = it.salsaCambiada
      ? `Salsa: <b>${escapeHtml(it.salsaCambiada)}</b> (cambio)`
      : (it.salsaDefault ? `Salsa: ${escapeHtml(it.salsaDefault)}` : '');

    return `
      <div class="order-item">
        <h4>${escapeHtml(it.name || 'Producto')} · x${it.qty || 1}</h4>
        ${salsaInfo ? `<div class="muted small">${salsaInfo}</div>` : ''}
        ${it.notes ? `<div class="muted small">Notas: ${escapeHtml(it.notes)}</div>` : ''}
        <div class="k-badges" style="margin-top:6px">${ingrBadges}${extrasBadges}</div>
      </div>`;
  }).join('');

  const canShowTake = (o.status === Status.PENDING) && !LOCALLY_TAKEN.has(o.id);
  const actions = [
    canShowTake ? `<button class="btn" data-a="take">Tomar</button>` : '',
    (o.status === Status.IN_PROGRESS) ? `<button class="btn ok" data-a="ready">Listo</button>` : '',
    (o.status === Status.READY) ? `<button class="btn ok" data-a="deliver">Entregar</button>` : '',
    (o.status === Status.DELIVERED && !o.paid) ? `<button class="btn" data-a="charge">Cobrar</button>` : '',
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS || (o.status === Status.DELIVERED && !o.paid))
      ? `<button class="btn ghost" data-a="edit">Editar</button>` : '',
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS || (o.status === Status.DELIVERED && !o.paid))
      ? `<button class="btn warn" data-a="cancel">Eliminar</button>` : ''
  ].join('');

  const paidBadge = o.paid ? '· <span class="k-badge ok">Pagado</span>' : '';
  const payMethodBadge = (o.paid && o.payMethod)
    ? ` · <span class="k-badge">${escapeHtml(String(o.payMethod))}</span>`
    : '';

  return `
<article class="k-card" data-id="${o.id}">
  <div class="muted small">
    Cliente: <b>${escapeHtml(o.customer || '-')}</b>${phoneTxt} · ${meta}
  </div>
  <div class="muted small mono" style="margin-top:4px">
    Total por cobrar: <b>${money(total)}</b> ${paidBadge}${payMethodBadge}
    ${hhSummary} ${rewardsSummary}
  </div>
  ${timerHtml}
  ${itemsHtml}
  ${o.notes ? `<div class="muted small"><b>Notas generales:</b> ${escapeHtml(o.notes)}</div>` : ''}
  <div class="k-actions" style="margin-top:8px">${actions}</div>
</article>`;
}

/* ================== Actions (optimistas + no escribe en PRUEBA) ================== */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const card = btn.closest('[data-id]'); const id = card?.dataset?.id; if(!id) return;
  const a = btn.dataset.a;
  const TRAIN = isTraining();
  const OPTS = { training: TRAIN };

  btn.disabled = true;
  const reenable = ()=> { try{ btn.disabled = false; }catch{} };
  const fsId = setTimeout(reenable, 1200);

  try{
    if (a==='take'){
      LOCALLY_TAKEN.add(id);
      btn.textContent = 'Tomando…';

      const order = CURRENT_LIST.find(x=>x.id===id);
      if(!TRAIN && order){ await applyInventoryForOrderShim({ ...order, id }, OPTS); }

      patchLocal(id, { status: Status.IN_PROGRESS, startedAt: now(), 'timestamps.startedAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      scheduleRender();

      if (!TRAIN) {
        await setStatusShim(id, Status.IN_PROGRESS, OPTS);
        await updateOrderShim(id, { startedAt: now(), 'timestamps.startedAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
      }
      beep(); toast('En preparación' + (TRAIN ? ' (PRUEBA)' : ''));
      return;
    }

    if (a==='ready'){
      patchLocal(id, { status: Status.READY, readyAt: now(), 'timestamps.readyAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      scheduleRender();
      if (!TRAIN) {
        await setStatusShim(id, Status.READY, OPTS);
        await updateOrderShim(id, { readyAt: now(), 'timestamps.readyAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
      }
      beep(); toast('Listo 🛎️' + (TRAIN ? ' (PRUEBA)' : ''));
      return;
    }

    if (a==='deliver'){
      patchLocal(id, { status: Status.DELIVERED, deliveredAt: now(), 'timestamps.deliveredAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      scheduleRender();
      if (!TRAIN) {
        await setStatusShim(id, Status.DELIVERED, OPTS);
        await updateOrderShim(id, { deliveredAt: now(), 'timestamps.deliveredAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
      }
      beep(); toast('Entregado ✔️ · por cobrar' + (TRAIN ? ' (PRUEBA)' : ''));
      return;
    }

    if (a==='charge'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const total = calcTotal(order);
      const method = prompt(`Cobrar ${money(total)}\nMétodo (efectivo / tarjeta / transferencia):`, 'efectivo');
      if (method === null) { btn.disabled=false; return; }
      const payMethod = String(method||'efectivo').toLowerCase();

      patchLocal(id, { paid: true, paidAt: now(), payMethod, totalCharged: Number(total), updatedAt: now(), 'timestamps.updatedAt': now() });
      scheduleRender();

      if (!TRAIN) {
        await updateOrderShim(id, {
          paid: true,
          paidAt: now(),
          payMethod,
          totalCharged: Number(total),
          updatedAt: now(), 'timestamps.updatedAt': now()
        }, OPTS);

        await archiveDeliveredShim(id, Status.DONE, OPTS);
      }
      beep(); toast('Cobro registrado' + (TRAIN ? ' (PRUEBA)' : ''));
      card.remove();
      return;
    }

    if (a==='edit'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const notes = prompt('Editar notas generales para cocina:', order.notes||'');
      if (notes!==null){
        patchLocal(id, { notes, updatedAt: now(), 'timestamps.updatedAt': now() });
        scheduleRender();
        if (!TRAIN) {
          await updateOrderShim(id,{ notes, updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
        }
        toast('Notas actualizadas' + (TRAIN ? ' (PRUEBA)' : ''));
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

      patchLocal(id, { status: Status.CANCELLED, cancelReason: trimmed, cancelledAt: now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      scheduleRender();

      if (!TRAIN) {
        await updateOrderShim(id, {
          status: Status.CANCELLED,
          cancelReason: trimmed,
          cancelledAt: now(),
          cancelledBy: 'kitchen',
          updatedAt: now(), 'timestamps.updatedAt': now()
        }, OPTS);

        await archiveDeliveredShim(id, Status.DONE, OPTS);
      }
      beep(); toast('Pedido eliminado' + (TRAIN ? ' (PRUEBA)' : ''));
      card.remove();
      return;
    }

  }catch(err){
    console.error(err);
    toast('Error al actualizar');
    if(a==='take'){ LOCALLY_TAKEN.delete(id); }
  }finally{
    clearTimeout(fsId);
    reenable();
  }
});

/* ================== Ticker ligero (actualiza ⏱️ sin re-render) ================== */
let __T = null;
function startTicker(){
  if (__T) return;
  const fmt = (ms)=>{
    const s = Math.max(0, Math.floor(ms/1000));
    const m = Math.floor(s/60), ss = s%60;
    return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };
  const tick = ()=>{
    const now = Date.now();

    document.querySelectorAll('.t-total[data-t0]').forEach(el=>{
      const t0 = Number(el.dataset.t0||0);
      const t1 = Number(el.dataset.t1||0);
      el.textContent = fmt((t1 && t1>t0) ? (t1 - t0) : (now - t0));
    });

    document.querySelectorAll('.t-kitchen[data-t0]').forEach(el=>{
      const t0 = Number(el.dataset.t0||0);
      const t1 = Number(el.dataset.t1||0);
      el.textContent = fmt((t1 && t1>t0) ? (t1 - t0) : (now - t0));
    });
  };
  tick();
  __T = setInterval(tick, 1000);
}

/* ========== Limpieza ========== */
window.addEventListener('beforeunload', ()=>{ try{ unsub && unsub(); }catch{} });
