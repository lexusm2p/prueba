
import { subscribeOrders, archiveDelivered } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';
function money(n){ return '$'+Number(n||0).toFixed(0); }
const colIP=document.getElementById('colIP'), colR=document.getElementById('colR'), colD=document.getElementById('colD');
let deliveredSession = [];

function itemsSummary(o){
  if(Array.isArray(o.items)){
    return o.items.map(it=>`${it.item?.name||'Producto'} x${it.qty||1}`).join(', ');
  }
  return `${o.item?.name||'Producto'} x${o.qty||1}`;
}

function card(o,deliver=false){
  const total = Array.isArray(o.items) ? o.orderTotal : o.subtotal;
  return `<div class="k-card" data-id="${o.id}">
    <h4>${itemsSummary(o)}</h4>
    <div class="muted small">Cliente: <b>${o.customer||'-'}</b></div>
    <div class="muted small">Total: <b>${money(total||0)}</b></div>
    ${o.notes?`<div class="muted small">Notas: ${o.notes}</div>`:''}
    <div class="k-actions">${deliver?'<button class="btn small secondary" data-a="deliver">Entregar</button>':''}</div>
  </div>`;
}

function render(list){
  const ip=list.filter(x=>x.status==='IN_PROGRESS'), r=list.filter(x=>x.status==='READY');
  colIP.innerHTML=ip.map(o=>card(o,false)).join('')||'<div class="muted">—</div>';
  colR.innerHTML=r.map(o=>card(o,true)).join('')||'<div class="muted">—</div>';
  colD.innerHTML=deliveredSession.map(o=>card(o,false)).join('')||'<div class="muted">—</div>';
}

subscribeOrders(render);
document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a="deliver"]'); if(!btn) return;
  const id=btn.closest('.k-card').dataset.id; deliveredSession.unshift({ id, at:Date.now() });
  await archiveDelivered(id); beep(); toast('Pedido entregado ✔️');
  render([]);
});
