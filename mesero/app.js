// /mesero/app.js
import { subscribeOrders, archiveDelivered } from '../shared/db.js';
import { beep, toast } from '../shared/notify.js';

const colIP=document.getElementById('colIP'), colR=document.getElementById('colR');
let LAST_IDS_READY = new Set();

subscribeOrders((list)=>{
  const ip = list.filter(x=>x.status==='IN_PROGRESS');
  const r  = list.filter(x=>x.status==='READY');

  // Beep si aparece nuevo READY
  const nowReadyIds = new Set(r.map(x=>x.id));
  for (const id of nowReadyIds) if (!LAST_IDS_READY.has(id)) beep(160, 1100);
  LAST_IDS_READY = nowReadyIds;

  colIP.innerHTML = ip.map(card).join('') || '<div class="muted">—</div>';
  colR.innerHTML  = r.map(o=>card(o,true)).join('') || '<div class="muted">—</div>';
});

function card(o,deliver=false){
  return `<div class="k-card" data-id="${o.id}">
    <h4>${o.item?.name||'Producto'} · x${o.qty||1}</h4>
    <div class="muted small">Cliente: <b>${o.customer||'-'}</b></div>
    ${o.notes?`<div class="muted small">Notas: ${o.notes}</div>`:''}
    <div class="k-actions">${deliver?'<button class="btn small secondary" data-a="deliver">Entregar</button>':''}</div>
  </div>`;
}

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a="deliver"]'); if(!btn) return;
  const id=btn.closest('.k-card').dataset.id;
  await archiveDelivered(id);
  beep(); toast('Pedido entregado ✔️');
});
