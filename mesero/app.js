import { subscribeOrders, archiveDelivered } from '../shared/db.js';
import { beep, toast } from '../shared/notify.js';

const colIP=document.getElementById('colIP'), colR=document.getElementById('colR'), colD=document.getElementById('colD');

function card(o,deliver=false){
  const items=(o.items||[]).map(it=>`${it.name} ×${it.qty||1}`).join(' · ');
  return `<div class="k-card" data-id="${o.id}">
    <h4>${items||'Producto'} </h4>
    <div class="muted small">Cliente: <b>${o.customer||'-'}</b></div>
    ${o.notes?`<div class="muted small">Notas: ${o.notes}</div>`:''}
    <div class="k-actions">${deliver?'<button class="btn secondary small" data-a="deliver">Entregar</button>':''}</div>
  </div>`;
}

subscribeOrders((list)=>{
  const ip=list.filter(x=>x.status==='IN_PROGRESS');
  const r =list.filter(x=>x.status==='READY');
  colIP.innerHTML=ip.map(o=>card(o,false)).join('')||'<div class="muted">—</div>';
  colR.innerHTML =r.map(o=>card(o,true)).join('')||'<div class="muted">—</div>';
});

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a="deliver"]'); if(!btn) return;
  const id=btn.closest('.k-card').dataset.id;
  await archiveDelivered(id); beep(); toast('Pedido entregado ✔️');
  btn.closest('.k-card').remove();
});
