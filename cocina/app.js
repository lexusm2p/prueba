// cocina/app.js
import { ensureAuth, subscribeActiveOrders, setStatus } from "../lib/firebase.js";
import { chime } from "../lib/notify.js";

const $ = (sel)=>document.querySelector(sel);
const P = $("#pending"), G = $("#progress"), R = $("#ready");
const seenReady = new Set();

ensureAuth().then(()=>{
  subscribeActiveOrders(snap => {
    const list = snap.docs.map(d=>({id:d.id, ...d.data()}));
    render(list);
    list.filter(o => o.status==='READY').forEach(o => {
      if(!seenReady.has(o.id)){ seenReady.add(o.id); chime(); if(navigator.vibrate) navigator.vibrate(50); }
    });
  });
});

function render(list){
  P.innerHTML = list.filter(o=>o.status==='PENDING').map(renderCard).join('') || blank();
  G.innerHTML = list.filter(o=>o.status==='IN_PROGRESS').map(renderCard).join('') || blank();
  R.innerHTML = list.filter(o=>o.status==='READY').map(renderCard).join('') || blank();

  document.querySelectorAll('[data-a="take"]').forEach(b=> b.onclick = ()=> setStatus(b.dataset.id,'IN_PROGRESS'));
  document.querySelectorAll('[data-a="ready"]').forEach(b=> b.onclick = ()=> setStatus(b.dataset.id,'READY'));
  document.querySelectorAll('[data-a="deliver"]').forEach(b=> b.onclick = ()=> setStatus(b.dataset.id,'DELIVERED'));
}

function blank(){ return '<div class="card" style="opacity:.6">Sin pedidos</div>' }

function renderCard(o){
  const itemsHtml = (o.items||[]).map(it => {
    const base = (it.baseIngredients||[]).join(', ');
    const ads  = (it.aderezos||[]).join(', ') || '—';
    const ex   = (it.extras||[]).join(', ') || '—';
    const notes= it.notes || '—';
    return `<div style="margin:6px 0;padding:6px;border:1px dashed #244a63;border-radius:8px">
      <div><strong>${it.name}</strong> ×${it.qty||1}</div>
      <div style="opacity:.85">Base: ${base}</div>
      <div style="opacity:.85">Aderezos: ${ads}</div>
      <div style="opacity:.85">Extras: ${ex}</div>
      <div style="opacity:.85">Notas: ${notes}</div>
    </div>`;
  }).join('');

  return `<div class="card">
    <div><strong>Orden</strong> — <span class="badge">${o.customer||'-'}</span> · $${o.total||0}</div>
    ${itemsHtml}
    <div class="actions">
      ${o.status==='PENDING' ? `<button data-a="take" data-id="${o.id}">Preparar</button>` : ''}
      ${o.status==='IN_PROGRESS' ? `<button data-a="ready" data-id="${o.id}">Listo</button>` : ''}
      ${o.status==='READY' ? `<button data-a="deliver" data-id="${o.id}">Entregar</button>` : ''}
    </div>
  </div>`;
}
