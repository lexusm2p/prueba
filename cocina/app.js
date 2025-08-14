
import { subscribeOrders, setStatus, archiveDelivered } from '../shared/backend.js';
import { Status } from '../shared/status.js';
import { beep } from '../lib/notify.js';

const elP = document.querySelector('#listPending');
const elIP = document.querySelector('#listProgress');
const elR = document.querySelector('#listReady');

function card(o){
  const ing = (o.ingredients||[]).join(', ');
  const ade = (o.aderezos||[]).join(', ') || '—';
  const ex = (o.extras||[]).join(', ') || '—';
  return `<div class="k-card" data-id="${o.id}">
    <h4>${o.itemName} × ${o.qty} — <span class="meta">$${o.total}</span></h4>
    <div class="meta">Cliente: ${o.client||'—'} • Origen: ${o.server||'—'}</div>
    <div class="meta">Ingredientes: ${ing}</div>
    <div class="meta">Aderezos: ${ade}</div>
    <div class="meta">Extras: ${ex}</div>
    <div class="meta">Notas: ${o.notes||'—'}</div>
    <div class="btns">
      ${o.status===Status.PENDING? `<button class="btn take" data-a="take">Tomar</button>`:''}
      ${o.status===Status.IN_PROGRESS? `<button class="btn ready" data-a="ready">Listo</button>`:''}
      ${o.status===Status.READY? `<button class="btn deliver" data-a="deliver">Entregar</button>`:''}
    </div>
  </div>`;
}

function render(list){
  const p = list.filter(o=>o.status===Status.PENDING);
  const ip = list.filter(o=>o.status===Status.IN_PROGRESS);
  const r = list.filter(o=>o.status===Status.READY);
  elP.innerHTML = p.map(card).join('') || '<small>Sin pendientes</small>';
  elIP.innerHTML = ip.map(card).join('') || '<small>Sin preparación</small>';
  elR.innerHTML = r.map(card).join('') || '<small>Sin listos</small>';
}

subscribeOrders((arr)=>{
  render(arr);
}, {});

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const card = btn.closest('.k-card'); const id = card?.dataset.id; if(!id) return;
  const a = btn.dataset.a;
  if (a==='take') await setStatus(id, Status.IN_PROGRESS);
  if (a==='ready') { await setStatus(id, Status.READY); beep(); }
  if (a==='deliver') await archiveDelivered(id);
});
