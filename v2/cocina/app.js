// /cocina/app.js — V2.8 (estable: hash + rAF + columnas desconectadas)
// Requiere /shared/db.js V2.5

import * as DB from '../shared/db.js';

const Status = {
  PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY',
  DELIVERED:'DELIVERED', PAID:'PAID', CANCELLED:'CANCELLED'
};

const els = {
  cols: document.getElementById('cols'),
  lP: document.getElementById('lP'), cP: document.getElementById('cP'),
  lI: document.getElementById('lI'), cI: document.getElementById('cI'),
  lR: document.getElementById('lR'), cR: document.getElementById('cR'),
  lD: document.getElementById('lD'), cD: document.getElementById('cD'),
};

function money(n){ return '$' + Number(n||0).toFixed(0); }

/* ---------- Hash (insensible a updatedAt) ---------- */
let lastHash = '';
function hashRows(rows){
  const pack = rows.map(o=>[o.id, o.status, Number(o.subtotal||0), (o.items?.length||0), (o.createdAt||0)]);
  try{ return JSON.stringify(pack); }catch{ return String(Math.random()); }
}

/* ---------- Render minimal (rAF) ---------- */
let rafId = 0;
function renderList(list, el, counterEl){
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
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
    frag.appendChild(div);
  }
  el.appendChild(frag);
  if (counterEl) counterEl.textContent = String(list.length);
}

function renderAll(rows){
  const h = hashRows(rows);
  if (h === lastHash) return;
  lastHash = h;

  // Desconecta columnas del flujo y renderiza en un solo frame
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(()=>{
    const g = { PENDING:[], IN_PROGRESS:[], READY:[], DELIVERED:[] };
    for (const o of rows){ if (g[o.status]) g[o.status].push(o); }
    renderList(g.PENDING, els.lP, els.cP);
    renderList(g.IN_PROGRESS, els.lI, els.cI);
    renderList(g.READY, els.lR, els.cR);
    renderList(g.DELIVERED, els.lD, els.cD);
  });
}

/* ---------- Acciones ---------- */
function bindActions(){
  els.cols.addEventListener('click', async (e)=>{
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
    // Ya viene coalescido y deduplicado desde db.js
    renderAll(rows || []);
  });

  window.addEventListener('beforeunload', ()=>{ try{ unsub?.(); }catch{} });
  // Atajo PRUEBA: Ctrl+Alt+Backspace limpia órdenes HOY
  window.addEventListener('keydown', (ev)=>{
    if (ev.ctrlKey && ev.altKey && ev.key === 'Backspace'){
      try{ DB.purgeSimToday(); alert('Órdenes de HOY (PRUEBA) limpiadas.'); location.reload(); }catch{}
    }
  });
}

start();
