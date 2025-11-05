// /cocina/app.js — V2 LEAN compatible con /shared/db.js V2.2
// Render básico por columnas + acciones: Tomar, Listo, Entregado, Cobrar, Cancelar

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

function renderList(list, el){
  el.innerHTML = '';
  list.forEach(o=>{
    const div = document.createElement('div');
    div.className = 'card';
    const itemsTxt = (o.items||[]).map(it => `${it.name} ×${it.qty||1}`).join(', ');
    const name = o.customer || 'Cliente';
    div.innerHTML = `
      <div class="row">
        <b>#${o.id.slice(-5)} · ${name}</b>
        <span class="badge">${o.orderType || ''}</span>
        <span class="price">${money(o.subtotal)}</span>
      </div>
      ${itemsTxt ? `<div class="muted">${itemsTxt}</div>`:''}
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
    div.dataset.id = o.id;
    el.appendChild(div);
  });
  el.parentElement.querySelector('.badge').textContent = String(list.length);
}

function groupByStatus(rows){
  const g = { PENDING:[], IN_PROGRESS:[], READY:[], DELIVERED:[] };
  rows.forEach(o=>{
    if (g[o.status]) g[o.status].push(o);
  });
  renderList(g.PENDING, els.lP);
  renderList(g.IN_PROGRESS, els.lI);
  renderList(g.READY, els.lR);
  renderList(g.DELIVERED, els.lD);
}

function bindActions(){
  document.getElementById('cols').addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-a]'); if(!btn) return;
    const card = btn.closest('.card'); if(!card) return;
    const id = card.dataset.id;

    const act = btn.dataset.a;
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

function start(){
  bindActions();

  // Suscripción en vivo (usa onSnapshot si hay Firestore, si no hace polling)
  const unsub = DB.subscribeKitchenOrders((rows)=>{
    groupByStatus(rows || []);
  });

  // Guarda para limpiar si se recarga
  window.addEventListener('beforeunload', ()=>{ try{ unsub?.(); }catch{} });
}

start();
