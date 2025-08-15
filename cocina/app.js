import { subscribeOrders, setStatus } from '../lib/firebase.js';
import { beep } from '../lib/notify.js';

const lp = document.getElementById('listPending');
const ip = document.getElementById('listProgress');
const lr = document.getElementById('listReady');

let lastReadyIds = new Set();

function card(o){
  const items = o.type==='combo3'
    ? o.comboItems.map(x=>`• ${x.name}`).join('<br>')
    : `• ${o.itemName} ×${o.qty}`;

  const ing = (o.ingredients||'').replaceAll(', ', ' · ');
  const ads = (o.aderezos||[]).length? ` | Ads: ${o.aderezos.join(', ')}`:'';
  const exs = (o.extras||[]).length? ` | Extras: ${o.extras.join(', ')}`:'';
  const sup = o.surprise? ' 🎲 sorpresa':'';
  const name = o.customer? `<span class="badge">Cliente: ${o.customer}</span>`:'';

  return `<div class="k-card" data-id="${o.id}">
    <div class="meta"><div><strong>${o.type==='combo3'?'Combo 3 Minis':o.itemName}</strong> ${name}</div><div><span class="badge">${o.status}</span></div></div>
    <div class="it">${items}</div>
    <div class="ing">${ing}${ads}${exs}${sup}</div>
    <div class="row" style="margin-top:8px">
      ${o.status==='PENDING'?'<button class="btn" data-a="take">Tomar</button>':''}
      ${o.status==='IN_PROGRESS'?'<button class="btn good" data-a="ready">Listo</button>':''}
      ${o.status==='READY'?'<button class="btn" data-a="deliver">Entregado</button>':''}
    </div>
  </div>`;
}

function render(rows){
  const pending = rows.filter(r=>r.status==='PENDING');
  const progress = rows.filter(r=>r.status==='IN_PROGRESS');
  const ready = rows.filter(r=>r.status==='READY');

  lp.innerHTML = pending.map(card).join('') || '<div class="muted small">Sin pendientes</div>';
  ip.innerHTML = progress.map(card).join('') || '<div class="muted small">Sin preparación</div>';
  lr.innerHTML = ready.map(card).join('') || '<div class="muted small">Sin listos</div>';

  // beep on new READY
  const currentReadyIds = new Set(ready.map(r=>r.id));
  for(const id of currentReadyIds){
    if(!lastReadyIds.has(id)) beep(1200,150);
  }
  lastReadyIds = currentReadyIds;
}

subscribeOrders(render);

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const card = btn.closest('.k-card'); if(!card) return;
  const id = card.dataset.id;
  const a = btn.dataset.a;
  if(a==='take') await setStatus(id,'IN_PROGRESS');
  if(a==='ready') await setStatus(id,'READY');
  if(a==='deliver') await setStatus(id,'DELIVERED'); // desaparece de vista automáticamente
});
