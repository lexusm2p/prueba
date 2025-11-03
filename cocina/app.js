// /cocina/app.js — Kitchen board (anti-salto + diff render + timers ligeros)

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
    Object.assign(b.style, { position:'fixed', left:'14px', bottom:'14px', zIndex:9999, borderRadius:'999px', opacity:.92 });
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
const Status = { PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY', DELIVERED:'DELIVERED', CANCELLED:'CANCELLED', DONE:'DONE', PAID:'PAID' };

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
const fmtMMSS = (ms)=>{
  const s = Math.max(0, Math.floor(ms/1000)); const m = Math.floor(s/60); const ss = s % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
};
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ================== Dedupe & merge ================== */
function updatedAtMs(o){
  return toMs(o.updatedAt || o.timestamps?.updatedAt || o.readyAt || o.timestamps?.readyAt || o.startedAt || o.timestamps?.startedAt || o.createdAt || o.timestamps?.createdAt);
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
  if (!changed) CURRENT_LIST.push({ id, ...patch, timestamps: extractTimestamps(patch) });
}
function extractTimestamps(patch){
  const t = {}; for (const k of Object.keys(patch||{})){ if (k.startsWith('timestamps.')) t[k.split('.').slice(1).join('.')] = patch[k]; } return t;
}

/* ================== Data stream (auth + subscribe) ================== */
let __streamLocked = false;
let unsub = null;

async function initKitchen(){
  try { await ensureAuth(); } catch(e){ console.warn('[cocina] anon auth fail', e); }
  unsub = subscribeKitchenShim((orders = [])=>{
    if (__streamLocked) return;
    __streamLocked = true;
    try {
      CURRENT_LIST = mergeByNewest(orders);
      render(CURRENT_LIST);
    } finally {
      queueMicrotask(()=>{ __streamLocked = false; });
    }
  });
}
document.addEventListener('DOMContentLoaded', initKitchen);

/* ================== Totales ================== */
function calcSubtotal(o={}){
  const items = Array.isArray(o.items) ? o.items : [];
  return items.reduce((s,it)=>{
    const line = (typeof it.lineTotal === 'number') ? Number(it.lineTotal||0) : (Number(it.unitPrice||0) * Number(it.qty||1));
    return s + line;
  },0);
}
function calcTotal(o={}){
  const sub = (typeof o.subtotal === 'number') ? Number(o.subtotal||0) : calcSubtotal(o);
  const tip = Number(o.tip||0);
  return sub + tip;
}

/* ================== Render sin saltos ================== */
const COL_IDS = { PENDING:'col-pending', IN_PROGRESS:'col-progress', READY:'col-ready', BILL:'col-bill' };
const RENDER_CACHE = { 'col-pending': new Map(), 'col-progress': new Map(), 'col-ready': new Map(), 'col-bill': new Map() };
const SCROLL_STATE = { }; // id -> {top, t}

function render(list){
  // Split por estado
  const by = (list||[]).reduce((acc,o)=>{
    const s = (o?.status || Status.PENDING).toUpperCase();
    (acc[s] ||= []).push(o);
    return acc;
  },{});
  const bill = (by.DELIVERED||[]).filter(o => !o.paid);

  patchCol(COL_IDS.PENDING,   by.PENDING||[]);
  patchCol(COL_IDS.IN_PROGRESS, by.IN_PROGRESS||[]);
  patchCol(COL_IDS.READY,     by.READY||[]);
  patchCol(COL_IDS.BILL,      bill);

  // tras parchear, solo actualizamos timers en vivo
  tickTimers();
}

/** Render “diff” por columna sin vaciar toda la lista. */
function patchCol(colId, arr){
  const el = document.getElementById(colId);
  if (!el) return;
  const cache = RENDER_CACHE[colId];
  const nowTs = Date.now();

  // Guardamos scroll y desactivamos anclado durante parcheo
  const prevTop = el.scrollTop;
  const prevBehavior = el.style.scrollBehavior;
  el.style.scrollBehavior = 'auto';
  el.style.overflowAnchor = 'none';

  // Índice actual en DOM
  const existing = new Map();
  Array.from(el.children).forEach(node=>{
    const id = node?.dataset?.id;
    if (id) existing.set(id, node);
  });

  // Clave: orden final
  const nextOrderIds = arr.map(o=>o.id);

  // 1) Remover los que ya no están
  existing.forEach((node, id)=>{
    if (!cache.has(id) || !nextOrderIds.includes(id)) {
      node.remove();
      cache.delete(id);
    }
  });

  // 2) Insertar/actualizar en orden
  let anchor = null;
  for (const o of arr){
    const id = o.id;
    let card = existing.get(id);
    const html = renderCard(o);

    if (!card){
      card = htmlToNode(html);
      // insertar en posición
      if (anchor) anchor.after(card); else el.prepend(card);
    }else{
      // Solo actualiza si cambió algo “importante”
      const prevSig = cache.get(id);
      const nextSig = signature(o);
      if (prevSig !== nextSig){
        // Reemplaza contenido interno pero conserva el mismo nodo (evita reset scroll)
        card.innerHTML = htmlToNode(html).innerHTML;
      }
      // Reordenar si es necesario
      if (anchor && anchor.nextSibling !== card){
        anchor.after(card);
      }
    }
    cache.set(id, signature(o));
    anchor = card;
  }

  // restaurar scroll
  if (Math.abs(el.scrollTop - prevTop) > 1) el.scrollTop = prevTop;
  el.style.scrollBehavior = prevBehavior || '';
  el.style.overflowAnchor = '';
  // Guardar estado para heurística anti-repintado mientras el usuario hace scroll
  SCROLL_STATE[colId] = { top: el.scrollTop, t: nowTs };
}

function htmlToNode(html){
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}
function signature(o){
  // firma estable sin campos de tiempo para no repintar por timers
  return JSON.stringify({
    id:o.id, status:o.status, paid:o.paid, payMethod:o.payMethod||null,
    subtotal:o.subtotal||calcSubtotal(o), tip:o.tip||0,
    items:(o.items||[]).map(i=>({n:i.name,q:i.qty, ld:i.lineTotal, up:i.unitPrice, ex:i.extras, sd:i.salsaDefault, sc:i.salsaCambiada, notes:i.notes})),
    notes:o.notes||'',
    orderType:o.orderType||'', table:o.table||'',
    hh:o.hh?.totalDiscount||0, hhP:o.hh?.discountPercent||0,
    rw:o.rewards?.type||'', rwD:o.rewards?.discount||0, rwM:o.rewards?.miniDog||false
  });
}

/* ================== Card ================== */
function renderCard(o = {}) {
  const items = Array.isArray(o.items) && o.items.length
    ? o.items
    : (o.item ? [{
        id:o.item.id, name:o.item.name, qty:o.qty||1, unitPrice:o.item.price||0,
        baseIngredients:o.baseIngredients||[], salsaDefault:o.salsaDefault||null,
        salsaCambiada:o.salsaCambiada||null, extras:o.extras||{}, notes:o.notes||'',
        lineTotal:(o.item?.price||0) * (o.qty||1)
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

  const tCreated = toMs(o.createdAt || o.timestamps?.createdAt);
  const tStarted = toMs(o.startedAt || o.timestamps?.startedAt);
  const tReady   = toMs(o.readyAt   || o.timestamps?.readyAt);

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
    const ingrBadges = (it.baseIngredients || []).map(i => `<div class="k-badge">${escapeHtml(i)}</div>`).join('');
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

  // data-* para timers sin repintar
  const timers = `data-created="${tCreated||0}" data-started="${tStarted||0}" data-ready="${tReady||0}"`;

  return `
<article class="k-card" data-id="${o.id}">
  <div class="muted small">
    Cliente: <b>${escapeHtml(o.customer || '-')}</b>${phoneTxt} · ${meta}
  </div>
  <div class="muted small mono" style="margin-top:4px">
    Total por cobrar: <b>${money(total)}</b>
    ${o.paid ? '· <span class="k-badge ok">Pagado</span>' : ''}${o.paid && o.payMethod ? ` · <span class="k-badge">${escapeHtml(String(o.payMethod))}</span>` : ''}
    ${hhSummary} ${rewardsSummary}
  </div>

  <div class="muted small mono js-timers" ${timers} style="margin-top:6px">
    ⏱️ Total: <b data-role="t-total">00:00</b>
    ${tStarted ? ` · 👩‍🍳 En cocina: <b data-role="t-kitchen">00:00</b>` : ''}
  </div>

  ${itemsHtml}
  ${o.notes ? `<div class="muted small"><b>Notas generales:</b> ${escapeHtml(o.notes)}</div>` : ''}

  <div class="k-actions" style="margin-top:8px">${actions}</div>
</article>`;
}

/* ================== Timers sin repintar ================== */
function tickTimers(){
  const nowTs = Date.now();
  document.querySelectorAll('.js-timers').forEach(node=>{
    const created = Number(node.getAttribute('data-created')||0);
    const started = Number(node.getAttribute('data-started')||0);
    const ready   = Number(node.getAttribute('data-ready')||0);

    const tTotal   = (ready || nowTs) - (created || nowTs);
    const tKitchen = started ? (ready || nowTs) - started : 0;

    const totalEl = node.querySelector('[data-role="t-total"]');
    const kitEl   = node.querySelector('[data-role="t-kitchen"]');
    if (totalEl) totalEl.textContent = fmtMMSS(tTotal);
    if (kitEl)   kitEl.textContent   = fmtMMSS(tKitchen);
  });
}
// 1s es suficiente para timers y NO repinta tarjetas
setInterval(()=>{ if (!document.hidden) tickTimers(); }, 1000);

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
      render(CURRENT_LIST);
      if (!TRAIN) {
        await setStatusShim(id, Status.IN_PROGRESS, OPTS);
        await updateOrderShim(id, { startedAt: now(), 'timestamps.startedAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
      }
      beep(); toast('En preparación' + (TRAIN ? ' (PRUEBA)' : ''));
      return;
    }

    if (a==='ready'){
      patchLocal(id, { status: Status.READY, readyAt: now(), 'timestamps.readyAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      render(CURRENT_LIST);
      if (!TRAIN) {
        await setStatusShim(id, Status.READY, OPTS);
        await updateOrderShim(id, { readyAt: now(), 'timestamps.readyAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
      }
      beep(); toast('Listo 🛎️' + (TRAIN ? ' (PRUEBA)' : ''));
      return;
    }

    if (a==='deliver'){
      patchLocal(id, { status: Status.DELIVERED, deliveredAt: now(), 'timestamps.deliveredAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      render(CURRENT_LIST);
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
      render(CURRENT_LIST);

      if (!TRAIN) {
        await updateOrderShim(id, { paid:true, paidAt: now(), payMethod, totalCharged:Number(total), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
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
        render(CURRENT_LIST);
        if (!TRAIN) await updateOrderShim(id,{ notes, updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
        toast('Notas actualizadas' + (TRAIN ? ' (PRUEBA)' : ''));
      }
      return;
    }

    if (a==='cancel'){
      if (!confirm('¿Eliminar este pedido? Pasará a CANCELLED y se archivará.')) return;
      const reason = prompt('Motivo de cancelación (obligatorio):', '');
      if (reason === null) return;
      const trimmed = String(reason).trim();
      if (!trimmed) { alert('Por favor escribe un motivo.'); return; }

      patchLocal(id, { status: Status.CANCELLED, cancelReason: trimmed, cancelledAt: now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      render(CURRENT_LIST);
      if (!TRAIN) {
        await updateOrderShim(id, { status: Status.CANCELLED, cancelReason: trimmed, cancelledAt: now(), cancelledBy:'kitchen', updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
        await archiveDeliveredShim(id, Status.DONE, OPTS);
      }
      beep(); toast('Pedido eliminado' + (TRAIN ? ' (PRUEBA)' : ''));
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

/* ========== Limpieza ========== */
window.addEventListener('beforeunload', ()=>{ try{ unsub && unsub(); }catch{} });