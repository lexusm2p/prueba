// Cocina — tablero de preparación (anti-saltos)
// Render incremental + timers desacoplados + filtros anti-$0

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
const Status = { PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY', DELIVERED:'DELIVERED', CANCELLED:'CANCELLED', DONE:'DONE', PAID:'PAID' };
let CURRENT_LIST = [];
const LOCALLY_TAKEN = new Set();

/* ================== Utils ================== */
const now = ()=> new Date();
const toMs = (t)=>{
  if(!t) return 0;
  if(typeof t.toMillis==='function') return t.toMillis();
  if(t.seconds!=null) return (t.seconds*1000)+Math.floor((t.nanoseconds||0)/1e6);
  const d=new Date(t); const ms=d.getTime(); return Number.isFinite(ms)?ms:0;
};
const money = (n)=> '$'+Number(n??0).toFixed(0);
const getPhone = (o)=> (o?.phone ?? o?.meta?.phone ?? o?.customer?.phone ?? '').toString().trim();
const fmtMMSS = (ms)=>{ const s=Math.max(0,Math.floor(ms/1000)); const m=Math.floor(s/60); const ss=s%60; return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; };
const escapeHtml = (s='')=> String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/* ============== Filtro anti “ghost orders” ($0 vacíos) ============== */
function isGhostOrder(o = {}){
  const hasItems = Array.isArray(o.items) && o.items.length > 0;
  const hasSingle = !!o.item;
  const hasMoney = typeof o.subtotal === 'number' && o.subtotal > 0;
  const hasNotes = !!(o.notes && String(o.notes).trim());
  const hasCustomer = !!(o.customer && String(o.customer).trim());
  return !(hasItems || hasSingle || hasMoney || hasNotes || hasCustomer);
}

/* ============== Dedupe & merge ============== */
function updatedAtMs(o){
  return toMs(o.updatedAt || o.timestamps?.updatedAt || o.readyAt || o.timestamps?.readyAt ||
              o.startedAt || o.timestamps?.startedAt || o.createdAt || o.timestamps?.createdAt);
}
function mergeByNewest(list){
  const byId = new Map();
  for (const raw of (Array.isArray(list)?list:[])){
    if (!raw?.id) continue;
    const o = { ...raw };
    if (!o.createdAt) o.createdAt = o.timestamps?.createdAt || new Date();
    const prev = byId.get(o.id);
    if (!prev || updatedAtMs(o) >= updatedAtMs(prev)) byId.set(o.id, o);
  }
  return Array.from(byId.values());
}
function patchLocal(id, patch){
  let changed=false;
  CURRENT_LIST = CURRENT_LIST.map(o=>{
    if (o.id!==id) return o;
    changed=true;
    return { ...o, ...patch, timestamps:{ ...(o.timestamps||{}), ...extractTimestamps(patch) } };
  });
  if (!changed) CURRENT_LIST.push({ id, ...patch, timestamps: extractTimestamps(patch) });
}
function extractTimestamps(patch){
  const t={}; for (const k of Object.keys(patch||{})){ if(k.startsWith('timestamps.')){ const sub=k.split('.').slice(1).join('.'); t[sub]=patch[k]; } } return t;
}

/* ============== Data stream ============== */
let __streamLocked=false, unsub=null;
async function initKitchen(){
  try { await ensureAuth(); } catch(e){ console.warn('[cocina] anon auth fail', e); }
  unsub = subscribeKitchenShim((orders=[])=>{
    if (__streamLocked) return;
    __streamLocked = true;
    try { CURRENT_LIST = mergeByNewest(orders); render(CURRENT_LIST); }
    finally { queueMicrotask(()=>{ __streamLocked = false; }); }
  });
}
document.addEventListener('DOMContentLoaded', initKitchen);

/* ============== Totales ============== */
function calcSubtotal(o={}){ const items=Array.isArray(o.items)?o.items:[]; return items.reduce((s,it)=> s + (typeof it.lineTotal==='number'? Number(it.lineTotal||0) : (Number(it.unitPrice||0)*Number(it.qty||1))), 0); }
function calcTotal(o={}){ const sub=(typeof o.subtotal==='number')?Number(o.subtotal||0):calcSubtotal(o); return sub + Number(o.tip||0); }

/* ============== Render incremental ============== */
function htmlToElement(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function djb2(str){ let h=5381,i=str.length; while(i) h=(h*33)^str.charCodeAt(--i); return (h>>>0).toString(36); }
function isNearBottom(el, px=80){ return (el.scrollHeight - el.clientHeight - el.scrollTop) <= px; }
function attachScrollGuards(el){
  if(!el || el.__guards) return; el.__guards=true;
  let t; const onScrollStart=()=>{ el.dataset.userScrolling='1'; clearTimeout(t); t=setTimeout(()=>{ el.dataset.userScrolling='0'; }, 900); };
  ['wheel','touchstart','touchmove','pointerdown','scroll'].forEach(ev=> el.addEventListener(ev, onScrollStart, { passive:true }));
  el.style.overflowAnchor='none'; el.style.scrollBehavior='auto';
}
// 🔧 anclaje de scroll sin salto arriba
function keepScrollPosition(el, beforeHeight, wasNearBottom, beforeTop){
  const afterHeight = el.scrollHeight;
  if (wasNearBottom) {
    el.scrollTop = Math.max(0, afterHeight - el.clientHeight);
  } else if (beforeTop <= 1) {
    el.scrollTop = 0;
  } else {
    el.scrollTop = Math.max(0, beforeTop + (afterHeight - beforeHeight));
  }
}

// hash estable (NO incluye timers)
function stableCardHash(o){
  const core = JSON.stringify({
    id:o.id, status:o.status, paid:o.paid, payMethod:o.payMethod, notes:o.notes,
    orderType:o.orderType, table:o.table, customer:o.customer, phone:getPhone(o),
    tip:o.tip, subtotal:o.subtotal, hh:o.hh, rewards:o.rewards,
    items:(o.items||o.item?[...(o.items||[]), ...(o.item?[{id:o.item.id,name:o.item.name,qty:o.qty,price:o.item.price}]:[])]:[])
  });
  return djb2(core);
}

function patchCol(id, list){
  const el = document.getElementById(id); if(!el) return;
  attachScrollGuards(el);
  const beforeTop = el.scrollTop, beforeHeight = el.scrollHeight, wasNearBottom = isNearBottom(el);
  const current = Array.from(el.children).filter(n => n.matches?.('.k-card, .empty'));
  const byId = new Map(); current.forEach(node => { const nid=node.dataset?.id||null; if(nid) byId.set(nid, node); });

  if (!list.length){
    if (!(current.length===1 && current[0].classList.contains('empty'))){
      const empty=document.createElement('div'); empty.className='empty'; empty.textContent='—'; el.replaceChildren(empty);
    }
    return;
  }

  const desired=[];
  for (const o of list){
    const id = o.id;
    const html = renderCard(o);
    const hash = stableCardHash(o);
    const found = byId.get(id);
    if (found){
      if (found.dataset.hash !== hash){
        const fresh = htmlToElement(html); fresh.dataset.hash = hash; found.replaceWith(fresh); desired.push(fresh);
      } else { desired.push(found); }
      byId.delete(id);
    } else {
      const n = htmlToElement(html); n.dataset.hash = hash; desired.push(n);
    }
  }
  for (const node of byId.values()) node.remove();

  const currOrder = Array.from(el.children);
  const needReorder = desired.length !== currOrder.length || desired.some((n,i)=> n!==currOrder[i]);
  if (needReorder){
    const frag=document.createDocumentFragment(); desired.forEach(n=> frag.appendChild(n)); el.replaceChildren(frag);
  }

  keepScrollPosition(el, beforeHeight, wasNearBottom, beforeTop);
  queueMicrotask(tickTimers);
}

/* ============== Orden y render (con filtro anti-$0) ============== */
function sortByCreated(a,b){
  const ca = toMs(a.createdAt || a.timestamps?.createdAt);
  const cb = toMs(b.createdAt || b.timestamps?.createdAt);
  return (ca||0) - (cb||0);
}
function render(list){
  const sane = (list||[]).filter(o => !isGhostOrder(o)); // quita fantasma/$0
  const by = sane.reduce((acc,o)=>{
    const s=(o?.status||Status.PENDING).toUpperCase();
    (acc[s] ||= []).push(o);
    return acc;
  },{});
  if (by.PENDING)     by.PENDING.sort(sortByCreated);
  if (by.IN_PROGRESS) by.IN_PROGRESS.sort(sortByCreated);
  if (by.READY)       by.READY.sort(sortByCreated);
  if (by.DELIVERED)   by.DELIVERED.sort(sortByCreated);

  patchCol('col-pending',  by.PENDING||[]);
  patchCol('col-progress', by.IN_PROGRESS||[]);
  patchCol('col-ready',    by.READY||[]);
  const bill = (by.DELIVERED||[]).filter(o=>!o.paid);
  patchCol('col-bill', bill);
}

/* ============== Card ============== */
function renderCard(o = {}) {
  const items = Array.isArray(o.items) && o.items.length ? o.items
    : (o.item ? [{ id:o.item.id, name:o.item.name, qty:o.qty||1, unitPrice:o.item.price||0,
                   baseIngredients:o.baseIngredients||[], salsaDefault:o.salsaDefault||null,
                   salsaCambiada:o.salsaCambiada||null, extras:o.extras||{}, notes:o.notes||'',
                   lineTotal:(o.item?.price||0)*(o.qty||1)}] : []);

  let meta='—';
  if (o.orderType==='dinein') meta = `Mesa: <b>${escapeHtml(o.table || '?')}</b>`;
  else if (o.orderType==='pickup') meta = 'Pickup';
  else if (o.orderType) meta = escapeHtml(o.orderType);

  // Totales
  const sub = (typeof o.subtotal==='number') ? Number(o.subtotal||0)
            : items.reduce((s,it)=> s + (typeof it.lineTotal==='number' ? Number(it.lineTotal||0) : (Number(it.unitPrice||0)*Number(it.qty||1))), 0);
  const total = sub + Number(o.tip||0);
  const showMoney = total > 0;

  // Contacto
  const phone = getPhone(o);
  const phoneTxt = phone ? ` · Tel: <b>${escapeHtml(String(phone))}</b>` : '';

  // Tiempos (solo si hay createdAt válido)
  const tCreated = toMs(o.createdAt || o.timestamps?.createdAt) || 0;
  const tStarted = toMs(o.startedAt || o.timestamps?.startedAt) || 0;
  const tReady   = toMs(o.readyAt   || o.timestamps?.readyAt)   || 0;

  const moneyLine = showMoney
    ? `Total por cobrar: <b>${money(total)}</b>`
    : `<span class="muted">Total: —</span>`;

  const timerHtml = tCreated
    ? `<div class="muted small mono" style="margin-top:6px">
         ⏱️ Total: <b data-timer="total" data-created="${tCreated}" data-ready="${tReady}">00:00</b>
         ${tStarted ? ` · 👩‍🍳 En cocina: <b data-timer="kitchen" data-started="${tStarted}" data-ready="${tReady}">00:00</b>` : ''}
       </div>`
    : '';

  // Happy Hour / Recompensas
  const hh = o.hh || {};
  const hhSummary = (hh.enabled && Number(hh.totalDiscount || 0) > 0)
    ? `<span class="k-badge">HH -${Number(hh.discountPercent || 0)}% · ahorro ${money(hh.totalDiscount)}</span>` : '';

  const rw = o.rewards || {};
  const rwDiscount = (rw.type==='discount' && Number(rw.discount||0)>0) ? `<span class="k-badge">🎁 Combo minis: -${money(Number(rw.discount||0))}</span>` : '';
  const rwMiniDog  = (rw.type==='miniDog' && rw.miniDog) ? `<span class="k-badge">🌭 Mini Dog (cortesía)</span>` : '';
  const rewardsSummary = `${rwDiscount} ${rwMiniDog}`.trim();

  // Items
  const itemsHtml = items.map(it=>{
    const ingrBadges = (it.baseIngredients||[]).map(i=> `<div class="k-badge">${escapeHtml(i)}</div>`).join('');
    const extraAdds = (it.adds || it.extras?.adds || it.extras?.ingredients || []);
    const extraRems = (it.removes || it.extras?.removes || []);
    const surprise  = it.extras?.surpriseSauce ? [`Sorpresa 🎁: ${it.extras.surpriseSauce}`] : [];
    const extrasBadges = [
      ...surprise.map(s=> `<div class="k-badge">${escapeHtml(s)}</div>`),
      ...(it.extras?.sauces||[]).map(s=> `<div class="k-badge">Aderezo: ${escapeHtml(s)}</div>`),
      ...extraAdds.map(s=> `<div class="k-badge">Extra: ${escapeHtml(s)}</div>`),
      ...extraRems.map(s=> `<div class="k-badge warn">Sin: ${escapeHtml(s)}</div>`),
      (it.extras?.dlcCarne ? '<div class="k-badge">DLC carne 85g</div>' : '')
    ].join('');
    const salsaInfo = it.salsaCambiada ? `Salsa: <b>${escapeHtml(it.salsaCambiada)}</b> (cambio)` : (it.salsaDefault ? `Salsa: ${escapeHtml(it.salsaDefault)}` : '');
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
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS || (o.status === Status.DELIVERED && !o.paid)) ? `<button class="btn ghost" data-a="edit">Editar</button>` : '',
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS || (o.status === Status.DELIVERED && !o.paid)) ? `<button class="btn warn" data-a="cancel">Eliminar</button>` : ''
  ].join('');

  const paidBadge = o.paid ? '· <span class="k-badge ok">Pagado</span>' : '';
  const payMethodBadge = (o.paid && o.payMethod) ? ` · <span class="k-badge">${escapeHtml(String(o.payMethod))}</span>` : '';

  return `
<article class="k-card" data-id="${o.id}">
  <div class="muted small">
    Cliente: <b>${escapeHtml(o.customer || '-')}</b>${phoneTxt} · ${meta}
  </div>
  <div class="muted small mono" style="margin-top:4px">
    ${moneyLine} ${paidBadge}${payMethodBadge}
    ${hhSummary} ${rewardsSummary}
  </div>
  ${timerHtml}
  ${itemsHtml}
  ${o.notes ? `<div class="muted small"><b>Notas generales:</b> ${escapeHtml(o.notes)}</div>` : ''}
  <div class="k-actions" style="margin-top:8px">${actions}</div>
</article>`;
}

/* ============== Timers desacoplados ============== */
function tickTimers(){
  const nowMs = Date.now();
  document.querySelectorAll('[data-timer="total"]').forEach(el=>{
    const created = Number(el.getAttribute('data-created')||0);
    const ready   = Number(el.getAttribute('data-ready')||0);
    if (!created) { el.textContent='00:00'; return; }
    const end = ready || nowMs;
    el.textContent = fmtMMSS(end - created);
  });
  document.querySelectorAll('[data-timer="kitchen"]').forEach(el=>{
    const started = Number(el.getAttribute('data-started')||0);
    const ready   = Number(el.getAttribute('data-ready')||0);
    if (!started){ el.textContent='00:00'; return; }
    const end = ready || nowMs;
    el.textContent = fmtMMSS(end - started);
  });
}
setInterval(()=>{ if (!document.hidden) tickTimers(); }, 1000);

/* ============== Actions (optimistas) ============== */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const card = btn.closest('[data-id]'); const id = card?.dataset?.id; if(!id) return;
  const a = btn.dataset.a;
  const TRAIN = isTraining(); const OPTS = { training: TRAIN };

  btn.disabled = true;
  const reenable = ()=> { try{ btn.disabled = false; }catch{} };
  const fsId = setTimeout(reenable, 1200);

  try{
    if (a==='take'){
      LOCALLY_TAKEN.add(id); btn.textContent = 'Tomando…';
      const order = CURRENT_LIST.find(x=>x.id===id);
      if(!TRAIN && order){ await applyInventoryForOrderShim({ ...order, id }, OPTS); }
      patchLocal(id, { status: Status.IN_PROGRESS, startedAt: now(), 'timestamps.startedAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      render(CURRENT_LIST);
      if (!TRAIN){ await setStatusShim(id, Status.IN_PROGRESS, OPTS);
                   await updateOrderShim(id, { startedAt: now(), 'timestamps.startedAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS); }
      beep(); toast('En preparación' + (TRAIN ? ' (PRUEBA)' : '')); return;
    }
    if (a==='ready'){
      patchLocal(id, { status: Status.READY, readyAt: now(), 'timestamps.readyAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      render(CURRENT_LIST);
      if (!TRAIN){ await setStatusShim(id, Status.READY, OPTS);
                   await updateOrderShim(id, { readyAt: now(), 'timestamps.readyAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS); }
      beep(); toast('Listo 🛎️' + (TRAIN ? ' (PRUEBA)' : '')); return;
    }
    if (a==='deliver'){
      patchLocal(id, { status: Status.DELIVERED, deliveredAt: now(), 'timestamps.deliveredAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      render(CURRENT_LIST);
      if (!TRAIN){ await setStatusShim(id, Status.DELIVERED, OPTS);
                   await updateOrderShim(id, { deliveredAt: now(), 'timestamps.deliveredAt': now(), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS); }
      beep(); toast('Entregado ✔️ · por cobrar' + (TRAIN ? ' (PRUEBA)' : '')); return;
    }
    if (a==='charge'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const total = calcTotal(order);
      const method = prompt(`Cobrar ${money(total)}\nMétodo (efectivo / tarjeta / transferencia):`, 'efectivo');
      if (method === null) { btn.disabled=false; return; }
      const payMethod = String(method||'efectivo').toLowerCase();
      patchLocal(id, { paid:true, paidAt: now(), payMethod, totalCharged:Number(total), updatedAt: now(), 'timestamps.updatedAt': now() });
      render(CURRENT_LIST);
      if (!TRAIN){
        await updateOrderShim(id, { paid:true, paidAt: now(), payMethod, totalCharged:Number(total), updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
        await archiveDeliveredShim(id, Status.DONE, OPTS);
      }
      beep(); toast('Cobro registrado' + (TRAIN ? ' (PRUEBA)' : ''));
      card.remove(); return;
    }
    if (a==='edit'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const notes = prompt('Editar notas generales para cocina:', order.notes||'');
      if (notes!==null){
        patchLocal(id, { notes, updatedAt: now(), 'timestamps.updatedAt': now() }); render(CURRENT_LIST);
        if (!TRAIN) await updateOrderShim(id,{ notes, updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
        toast('Notas actualizadas' + (TRAIN ? ' (PRUEBA)' : ''));
      }
      return;
    }
    if (a==='cancel'){
      if (!confirm('¿Eliminar este pedido? Pasará a CANCELLED y se archivará.')) return;
      const reason = prompt('Motivo de cancelación (obligatorio):', ''); if (reason===null) return;
      const trimmed = String(reason).trim(); if (!trimmed) { alert('Por favor escribe un motivo.'); return; }
      patchLocal(id, { status: Status.CANCELLED, cancelReason: trimmed, cancelledAt: now(), updatedAt: now(), 'timestamps.updatedAt': now() });
      render(CURRENT_LIST);
      if (!TRAIN){
        await updateOrderShim(id, { status: Status.CANCELLED, cancelReason: trimmed, cancelledAt: now(), cancelledBy: 'kitchen', updatedAt: now(), 'timestamps.updatedAt': now() }, OPTS);
        await archiveDeliveredShim(id, Status.DONE, OPTS);
      }
      beep(); toast('Pedido eliminado' + (TRAIN ? ' (PRUEBA)' : ''));
      return;
    }
  }catch(err){
    console.error(err); toast('Error al actualizar'); if(a==='take'){ LOCALLY_TAKEN.delete(id); }
  }finally{ clearTimeout(fsId); reenable(); }
});

/* ============== Limpieza y scrollers ============== */
window.addEventListener('beforeunload', ()=>{ try{ unsub && unsub(); }catch{} });
document.addEventListener('DOMContentLoaded', ()=>{
  ['col-pending','col-progress','col-ready','col-bill'].forEach(id=>{
    const el = document.getElementById(id);
    if (el){ el.style.overflow='auto'; el.style.webkitOverflowScrolling='touch'; attachScrollGuards(el); }
  });
});
