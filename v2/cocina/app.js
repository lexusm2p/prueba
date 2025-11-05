// /cocina/app.js — V2.6 LEAN (render incremental, sin repaints masivos)
import * as DB from '../shared/db.js';

const Status = {
  PENDING:'PENDING',
  IN_PROGRESS:'IN_PROGRESS',
  READY:'READY',
  DELIVERED:'DELIVERED',
  PAID:'PAID',
  CANCELLED:'CANCELLED'
};

const els = {
  PENDING:    document.getElementById('lP'),
  IN_PROGRESS:document.getElementById('lI'),
  READY:      document.getElementById('lR'),
  DELIVERED:  document.getElementById('lD'),
  cP:         document.getElementById('cP'),
  cI:         document.getElementById('cI'),
  cR:         document.getElementById('cR'),
  cD:         document.getElementById('cD'),
  colsWrap:   document.getElementById('cols'),
};

const money = (n)=> '$' + Number(n||0).toFixed(0);

// Estado local para diff
const cache = new Map();   // id -> {hash, status}
const nodes = new Map();   // id -> HTMLElement
let pageVisible = true;
document.addEventListener('visibilitychange', ()=>{
  pageVisible = (document.visibilityState === 'visible');
});

// Hash muy barato: cambia si cambian campos que afectan UI
function hashRow(o){
  const itemsSig = (o.items||[]).map(it=> `${it.name}|${it.qty||1}`).join(',');
  return [
    o.id, o.status, o.subtotal||0, o.orderType||'',
    o.customer||'',
    o.createdAt||0,
    o.updatedAt||0,
    itemsSig
  ].join('~');
}

function createCard(o){
  const name   = o.customer || 'Cliente';
  const items  = (o.items||[]).map(it => `${it.name} ×${it.qty||1}`).join(', ');
  const div = document.createElement('div');
  div.className = 'card';
  div.dataset.id = o.id;
  div.innerHTML = `
    <div class="row">
      <b>#${String(o.id||'').slice(-5)} · ${name}</b>
      ${o.orderType ? `<span class="badge">${o.orderType}</span>` : ''}
      <span class="price">${money(o.subtotal)}</span>
    </div>
    ${items ? `<div class="muted">${items}</div>` : ''}
    <div class="row" style="margin-top:8px; gap:6px">
      ${o.status===Status.PENDING
        ? `<button class="btn" data-a="take">Tomar</button>`
        : ``}
      ${o.status===Status.IN_PROGRESS
        ? `<button class="btn" data-a="ready">Listo</button>`
        : ``}
      ${o.status===Status.READY
        ? `<button class="btn" data-a="deliver">Entregar</button>
           <button class="btn" data-a="paid">Cobrar</button>`
        : ``}
      ${o.status===Status.DELIVERED
        ? `<button class="btn" data-a="paid">Cobrar</button>`
        : ``}
      ${o.status!==Status.CANCELLED
        ? `<button class="btn danger" data-a="cancel">Cancelar</button>`
        : `<span class="badge">Cancelada</span>`}
    </div>
  `;
  return div;
}

function ensureInColumn(el, status){
  const col = els[status];
  if (!col) return;
  if (el.parentElement !== col) col.appendChild(el);
}

function upsertCard(o){
  const id = o.id;
  const h  = hashRow(o);
  const prev = cache.get(id);

  if (prev && prev.hash === h){
    // Nada cambia; asegúrate solo de que esté en la columna correcta
    ensureInColumn(nodes.get(id), o.status);
    return;
  }

  const existed = !!prev;
  cache.set(id, { hash: h, status:o.status });

  if (!existed){
    // Crear
    const card = createCard(o);
    nodes.set(id, card);
    ensureInColumn(card, o.status);
    return;
  }

  // Existía pero cambió algo: rehacer contenido y mover si es necesario
  const card = nodes.get(id);
  if (!card){
    const c = createCard(o);
    nodes.set(id, c);
    ensureInColumn(c, o.status);
    return;
  }
  // Re-render interno (reemplazar innerHTML es barato aquí; el contenedor se conserva)
  const wasParent = card.parentElement;
  const scTop = wasParent ? wasParent.scrollTop : 0;
  const newCard = createCard(o);
  card.innerHTML = newCard.innerHTML; // conserva el nodo (evita perder scroll de la lista)
  ensureInColumn(card, o.status);
  if (wasParent) wasParent.scrollTop = scTop;
}

function removeMissing(currentIds){
  // Elimina cartas que ya no están en la suscripción
  for (const id of Array.from(cache.keys())){
    if (!currentIds.has(id)){
      cache.delete(id);
      const n = nodes.get(id);
      if (n && n.parentElement) n.parentElement.removeChild(n);
      nodes.delete(id);
    }
  }
}

function updateCounters(){
  els.cP.textContent = String(els.PENDING.children.length);
  els.cI.textContent = String(els.IN_PROGRESS.children.length);
  els.cR.textContent = String(els.READY.children.length);
  els.cD.textContent = String(els.DELIVERED.children.length);
}

let rafToken = 0;
function scheduleRender(rows){
  // Coalesce en rAF y no renderices si la página no es visible
  if (!pageVisible) return;
  if (rafToken) cancelAnimationFrame(rafToken);
  rafToken = requestAnimationFrame(()=>{
    rafToken = 0;
    const ids = new Set();
    rows.forEach(o=>{
      ids.add(o.id);
      upsertCard(o);
    });
    removeMissing(ids);
    updateCounters();
  });
}

function bindActions(){
  els.colsWrap.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-a]');
    if (!btn) return;
    const card = btn.closest('.card'); if (!card) return;
    const id = card.dataset.id;
    const act = btn.dataset.a;

    // Deshabilitar botones de esa tarjeta hasta que termine
    const btns = Array.from(card.querySelectorAll('button'));
    btns.forEach(b=> b.disabled = true);

    try{
      if (act==='take')     await DB.updateOrderStatus(id, Status.IN_PROGRESS);
      if (act==='ready')    await DB.updateOrderStatus(id, Status.READY);
      if (act==='deliver')  await DB.updateOrderStatus(id, Status.DELIVERED);
      if (act==='paid')     await DB.updateOrderStatus(id, Status.PAID);
      if (act==='cancel')   await DB.updateOrderStatus(id, Status.CANCELLED);
    }catch(err){
      console.warn('[cocina] updateOrderStatus error:', err);
      alert('No se pudo actualizar. Revisa conexión.');
    }finally{
      btns.forEach(b=> b.disabled = false);
    }
  });
}

function start(){
  bindActions();
  const unsub = DB.subscribeKitchenOrders((rows)=>{
    // rows ya viene filtrado + throttled desde db.js
    scheduleRender(rows || []);
  });
  window.addEventListener('beforeunload', ()=>{ try{ unsub?.(); }catch{} });
}

start();
