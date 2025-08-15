import { subscribeActiveOrders, setStatus, archiveDelivered } from '../lib/firebase.js';
import { beep } from '../lib/notify.js';
import { recipeForById, SAUCE_LOOKUP, EXTRA_LOOKUP } from '../lib/menu.js';

const elP = document.querySelector('#list-pending');
const elI = document.querySelector('#list-progress');
const elR = document.querySelector('#list-ready');

let prev = new Set();
const human = (ids,map)=> (ids&&ids.length? ids.map(id=>map[id]||id).join(', ') : '—');

function itemCard(it){
  const size = it.id.startsWith('m_') ? 'mini' : 'grande';
  const recipe = recipeForById(it.id.replace(/^m_/,'') , size);
  const recHTML = recipe.map(r=>`<li>${r.item.replace('quesoAmarillo','Queso amarillo').replace('quesoBlanco','Queso blanco').replace(/^./,c=>c.toUpperCase())} <span class="dim">${r.qty}</span> ${r.note?`<em class="dim">${r.note}</em>`:''}</li>`).join('');
  return `<div class="card">
    <h4>${it.name} <span class="badge">x${it.qty||1}</span></h4>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:.75rem">
      <div><strong>Receta estándar</strong><ul>${recHTML}</ul></div>
      <div>
        <strong>Extras/Salsas</strong>
        <ul>
          <li>Extras: ${human(it.extras, EXTRA_LOOKUP)}</li>
          <li>Salsas: ${human(it.sauces, SAUCE_LOOKUP)}</li>
        </ul>
      </div>
    </div>
  </div>`;
}

function card(o){
  const items = (o.items||[]).map(itemCard).join('');
  return `<article class="order" data-id="${o.id}">
    <div>
      <h4>Pedido de ${o.customer||'Cliente'} <span class="badge">Estado: ${o.status}</span></h4>
      ${items}
      ${o.notes?`<div class="small"><strong>Notas:</strong> ${o.notes}</div>`:''}
    </div>
    <div class="actions">
      ${o.status==='PENDING'?'<button data-a="take">Tomar</button>':''}
      ${o.status==='IN_PROGRESS'?'<button data-a="ready">Listo</button>':''}
      ${o.status==='READY'?'<button data-a="deliver">Entregar</button>':''}
    </div>
  </article>`;
}

function render(snap){
  const rows = snap.docs.map(d=>({id:d.id, ...d.data()}));
  const pending = rows.filter(r=>r.status==='PENDING');
  const progress = rows.filter(r=>r.status==='IN_PROGRESS');
  const ready = rows.filter(r=>r.status==='READY');

  elP.innerHTML = pending.length? pending.map(card).join('') : '<div class="empty">Sin pendientes</div>';
  elI.innerHTML = progress.length? progress.map(card).join('') : '<div class="empty">Sin preparación</div>';
  elR.innerHTML = ready.length? ready.map(card).join('') : '<div class="empty">Sin listos</div>';

  const now = new Set(rows.filter(r=>r.status==='READY').map(r=>r.id));
  let newR=false; now.forEach(id=>{ if(!prev.has(id)) newR=true; });
  if(newR) beep(1200,120);
  prev = now;
}

subscribeActiveOrders(render);

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const id = btn.closest('article')?.dataset.id; if(!id) return;
  const a = btn.dataset.a;
  if(a==='take') await setStatus(id,'IN_PROGRESS');
  if(a==='ready'){ await setStatus(id,'READY'); beep(1200,120); }
  if(a==='deliver'){ await setStatus(id,'DELIVERED'); await archiveDelivered(id); }
});
