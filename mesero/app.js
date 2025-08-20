// mesero/app.js
// Vista del mesero. Muestra IN_PROGRESS y READY. Permite marcar como entregado.
import { onOrdersSnapshot, archiveDelivered } from '../shared/db.js';
import { beep, toast } from '../shared/notify.js';

const colIP = document.getElementById('colIP');
const colR  = document.getElementById('colR');

let lastReadyIds = new Set();

function card(o, deliver=false){
  return `
  <div class="k-card" data-id="${o.id}">
    <h4>${o.item?.name||'Producto'} · x${o.qty||1}</h4>
    <div class="muted small">Cliente: <b>${o.customer||'-'}</b></div>
    ${o.notes?`<div class="muted small">Notas: ${o.notes}</div>`:''}
    <div class="k-actions">${deliver?'<button class="btn small secondary" data-a="deliver">Entregar</button>':''}</div>
  </div>`;
}

function render(list){
  const ip = list.filter(x=>x.status==='IN_PROGRESS');
  const r  = list.filter(x=>x.status==='READY');

  // Detectar nuevos listos para el "beep"
  const currentReadyIds = new Set(r.map(x=>x.id));
  for(const id of currentReadyIds){
    if(!lastReadyIds.has(id)){
      beep();
      toast('Pedido listo 🛎️');
    }
  }
  lastReadyIds = currentReadyIds;

  colIP.innerHTML = ip.map(o=>card(o,false)).join('') || '<div class="muted">—</div>';
  colR.innerHTML  = r.map(o=>card(o,true)).join('')  || '<div class="muted">—</div>';
}

onOrdersSnapshot(render);

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a="deliver"]'); if(!btn) return;
  const id=btn.closest('.k-card').dataset.id;
  await archiveDelivered(id); beep(); toast('Pedido entregado ✔️');
});
