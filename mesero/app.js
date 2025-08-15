import { subscribeActiveOrders } from '../lib/firebase.js';
import { beep } from '../lib/notify.js';
import { SAUCE_LOOKUP, EXTRA_LOOKUP } from '../lib/menu.js';

const wrap = document.querySelector('#orders');
let prev = new Set();

const human = (ids,map)=> (ids&&ids.length? ids.map(id=>map[id]||id).join(', ') : '—');

function card(o){
  const items = (o.items||[]).map(it=>`
    <div class="card">
      <h4>${it.name} <span class="badge">x${it.qty||1}</span></h4>
      <div class="small dim">Salsas: ${human(it.sauces, SAUCE_LOOKUP)} | Extras: ${human(it.extras, EXTRA_LOOKUP)}</div>
      ${o.notes?`<div class="small"><strong>Notas:</strong> ${o.notes}</div>`:''}
    </div>
  `).join('');
  return `<article class="card">
    <div class="row small"><span class="badge">Cliente: ${o.customer||'-'}</span><span class="badge">Estado: ${o.status}</span></div>
    ${items}
  </article>`;
}

subscribeActiveOrders((snap)=>{
  const docs = snap.docs.map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=> (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
  wrap.innerHTML = docs.length? docs.map(card).join(''):'<div class="empty">Sin pedidos activos</div>';
  const now = new Set(docs.filter(d=>d.status==='READY').map(d=>d.id));
  let newR=false; now.forEach(id=>{ if(!prev.has(id)) newR=true; });
  if(newR) beep(1400,140);
  prev = now;
});
