import { subscribeOrders, setStatus, archiveDelivered, deleteOrder } from '../shared/db.js';
import { money } from '../shared/util.js';
import { toast } from '../shared/toast.js';
import { beep } from '../shared/notify.js';

const $ = s=>document.querySelector(s);
let CURRENT=[];

function card(o){
  const items = (o.items||[]).map(it=>{
    const add = [...(it.extras||[]).map(e=>e.label), ...(it.sauces||[]).map(s=>s.label)].join(', ');
    return `<div class="small">• ${it.name}${add? ' — '+add : ''}</div>`;
  }).join('');

  const guide = (o.items||[])
    .map(i => `${i.name}: ${Array.isArray(i.ingredients) ? i.ingredients.join(', ') : '—'}`)
    .join(' | ');

  return `<div class="k-card" data-id="${o.id}">
    <h4>${o.name} ${o.table?`<span class="badge">Mesa ${o.table}</span>`:''}</h4>
    <div class="small">Pago: ${o.payMethod} · Total ${money(o.total||0)}</div>
    <div class="small" style="margin-top:6px"><b>Ingredientes guía:</b> ${guide||'—'}</div>
    <div style="margin-top:6px">${items}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn" data-a="take">En preparación</button>
      <button class="btn" data-a="ready">Listo</button>
      <button class="btn secondary" data-a="deliver">Entregado</button>
      <button class="btn secondary" data-a="delete">Eliminar</button>
    </div>
  </div>`;
}

function render(list){
  CURRENT = list || [];
  const p = CURRENT.filter(x=>x.status==='PENDING').map(card).join('');
  const ip= CURRENT.filter(x=>x.status==='IN_PROGRESS').map(card).join('');
  const r = CURRENT.filter(x=>x.status==='READY').map(card).join('');
  $('#listPending').innerHTML  = p || `<div class="small">Sin pendientes</div>`;
  $('#listProgress').innerHTML = ip|| `<div class="small">Sin preparación</div>`;
  $('#listReady').innerHTML    = r || `<div class="small">Sin listos</div>`;
}
subscribeOrders(render);

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a]'); if(!btn) return;
  const wrap=btn.closest('.k-card'); const id=wrap? wrap.dataset.id : null; if(!id) return;
  const a=btn.dataset.a;
  if(a==='take'){ await setStatus(id,'IN_PROGRESS'); beep(); toast('Pedido en preparación'); }
  if(a==='ready'){ await setStatus(id,'READY'); beep(); toast('Pedido listo 🛎️'); }
  if(a==='deliver'){ await archiveDelivered(id); beep(); toast('Entregado ✔️'); }
  if(a==='delete'){ await deleteOrder(id); beep(); toast('Pedido eliminado'); }
});
