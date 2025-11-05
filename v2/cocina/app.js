// /cocina/app.js — V2.7 LEAN (stable render + filtros)
// Compatible con /shared/db.js V2.4

import * as DB from '../shared/db.js';

const Status = {
  PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY',
  DELIVERED:'DELIVERED', PAID:'PAID', CANCELLED:'CANCELLED'
};

const els = {
  lP: document.getElementById('lP'),
  lI: document.getElementById('lI'),
  lR: document.getElementById('lR'),
  lD: document.getElementById('lD'),
  cP: document.getElementById('cP'),
  cI: document.getElementById('cI'),
  cR: document.getElementById('cR'),
  cD: document.getElementById('cD'),
};

function money(n){ return '$' + Number(n||0).toFixed(0); }

/* ---------- Render estable ---------- */
let lastHash = '';
const hashRows = (rows)=>{
  const m = rows.map(o=>[o.id,o.status,Number(o.subtotal||0),(o.items?.length||0),(o.createdAt||0)]);
  try{ return JSON.stringify(m); }catch{ return String(Math.random()); }
};

function renderList(list, el, counterEl){
  el.innerHTML = '';
  for (const o of list){
    const div = document.createElement('div');
    div.className = 'card';
    const itemsTxt = (o.items||[]).map(it=>`${it.name} ×${it.qty||1}`).join(', ');
    const name = o.customer || 'Cliente';
    div.innerHTML = `
      <div class="row">
        <b>#${String(o.id||'').slice(-5)} · ${name}</b>
        ${o.orderType ? `<span class="badge">${o.orderType}</span>` : ``}
        <span class="price">${money(o.subtotal)}</span>
      </div>
      ${itemsTxt ? `<div class="muted">${itemsTxt}</div>` : ``}
      <div class="row" style="margin-top:8px; gap:6px">
        ${o.status===Status.PENDING     ? `<button class="btn" data-a="take">Tomar</button>` : ``}
        ${o.status===Status.IN_PROGRESS ? `<button class="btn" data-a="ready">Listo</button>` : ``}
        ${o.status===Status.READY       ? `<button class="btn" data-a="deliver">Entregar</button><button class="btn" data-a="paid">Cobrar</button>` : ``}
        ${o.status===Status.DELIVERED   ? `<button class="btn" data-a="paid">Cobrar</button>` : ``}
        ${o.status!==Status.CANCELLED   ? `<button class="btn danger" data-a="cancel">Cancelar</button>` : `<span class="badge">Cancelada</span>`}
      </div>`;
    div.dataset.id = o.id;
    el.appendChild(div);
  }
  if (counterEl) counterEl.textContent = String(list.length);
}

function renderAll(rows){
  const h = hashRows(rows);
  if (h === lastHash) return;
  lastHash = h;

  const g = { PENDING:[], IN_PROGRESS:[], READY:[], DELIVERED:[] };
  for (const o of rows){ if (g[o.status]) g[o.status].push(o); }

  renderList(g.PENDING, els.lP, els.cP);
  renderList(g.IN_PROGRESS, els.lI, els.cI);
  renderList(g.READY, els.lR, els.cR);
  renderList(g.DELIVERED, els.lD, els.cD);
}

/* ---------- Acciones ---------- */
function bindActions(){
  document.getElementById('cols').addEventListener('click', async (e)=>{
    const btn  = e.target.closest('button[data-a]'); if(!btn) return;
    const card = btn.closest('.card');               if(!card) return;
    const id   = card.dataset.id;
    const act  = btn.dataset.a;

    try{
      if (act==='take')     await DB.updateOrderStatus(id, Status.IN_PROGRESS);
      if (act==='ready')    await DB.updateOrderStatus(id, Status.READY);
      if (act==='deliver')  await DB.updateOrderStatus(id, Status.DELIVERED);
      if (act==='paid')     await DB.updateOrderStatus(id, Status.PAID);
      if (act==='cancel')   await DB.updateOrderStatus(id, Status.CANCELLED);
    }catch(err){
      console.warn('[cocina] updateOrderStatus error:', err);
      alert('No se pudo actualizar. Revisa consola.');
    }
  });
}

/* ---------- Inicio ---------- */
function start(){
  bindActions();

  const unsub = DB.subscribeKitchenOrders((rows)=>{
    // Ya viene filtrado desde /shared/db.js (hoy + estados visibles + >$0 + items)
    renderAll(rows || []);
  });

  window.addEventListener('beforeunload', ()=>{ try{ unsub?.(); }catch{} });

  // Atajo útil en PRUEBA: Ctrl+Alt+Backspace limpia órdenes de HOY
  window.addEventListener('keydown', (ev)=>{
    if (ev.ctrlKey && ev.altKey && ev.key === 'Backspace'){
      try{ DB.purgeSimToday(); alert('Órdenes de HOY (PRUEBA) limpiadas.'); location.reload(); }catch{}
    }
  });
}

start();
