import { subscribeActiveOrders, setStatus, archiveDelivered } from '../lib/firebase.js';
import { beep } from '../lib/notify.js';
import { recipeFor } from '../lib/menu.js';

const elPending = document.querySelector('#list-pending');
const elProgress = document.querySelector('#list-progress');
const elReady   = document.querySelector('#list-ready');

let lastSnapshotIds = new Set();

function card(o){
  const size = o.size || (o.name?.includes('Mini') ? 'mini':'grande');
  const rec = recipeFor(o.menuKey || (o.key||'').replace('_mini','') || inferKey(o.name), size==='mini'?'mini':'grande');
  const extras = (o.extras||[]).join(', ') || '—';
  const sauces = (o.sauces||[]).join(', ') || '—';
  const notes  = o.notes || '—';

  const recHtml = rec.map(r=>`<li>${label(r.item)} <span class="dim">${r.qty}</span> ${r.note?`<em class="dim"> ${r.note}</em>`:''}</li>`).join('');
  return `
  <article class="order card k-card" data-id="${o.id}">
    <div>
      <h4>${o.name} ${o.size?'· '+o.size:''} <span class="badge">x${o.qty||1}</span></h4>
      <div class="row small">
        <span class="badge">Mesa: ${o.table||'-'}</span>
        ${o.waiter?`<span class="badge">Mesero: ${o.waiter}</span>`:''}
        <span class="badge">Estado: ${o.status}</span>
      </div>
      <hr/>
      <div class="grid" style="grid-template-columns: 1fr 1fr;">
        <div>
          <strong>Receta estandar:</strong>
          <ul>${recHtml}</ul>
        </div>
        <div>
          <strong>Extras & Salsas:</strong>
          <ul>
            <li>Extras: ${extras}</li>
            <li>Salsas: ${sauces}</li>
          </ul>
          <strong>Notas de cliente:</strong>
          <div class="small">${notes}</div>
        </div>
      </div>
    </div>
    <div class="actions">
      ${o.status==='PENDING'?'<button data-a="take">Tomar</button>':''}
      ${o.status==='IN_PROGRESS'?'<button data-a="ready">Listo</button>':''}
      ${o.status==='READY'?'<button data-a="deliver">Entregar</button>':''}
    </div>
  </article>`;
}

function label(k){
  return ({
    pan:'Pan', carne:'Carne', quesoAmarillo:'Queso amarillo', quesoBlanco:'Queso blanco',
    lechuga:'Lechuga', jitomate:'Jitomate', cebolla:'Cebolla', piña:'Piña',
    tocino:'Tocino', jamon:'Jamón', salchicha:'Salchicha', salsas:'Salsas'
  })[k] || k;
}
function inferKey(n=''){
  const s=n.toLowerCase();
  if(s.includes('starter')) return 'starter';
  if(s.includes('koopa')) return 'koopa';
  if(s.includes('fatality')) return 'fatality';
  if(s.includes('mega')) return 'mega';
  if(s.includes('hadouken')) return 'hadouken';
  if(s.includes('nintendo')) return 'nintendo';
  if(s.includes('final')) return 'finalboss';
  return 'starter';
}

function render(snapshot){
  const docs = snapshot.docs.map(d=>({id:d.id, ...d.data()}));
  const pending = docs.filter(d=>d.status==='PENDING');
  const progress = docs.filter(d=>d.status==='IN_PROGRESS');
  const ready = docs.filter(d=>d.status==='READY');

  elPending.innerHTML = pending.length? pending.map(card).join('') : '<div class="empty">Sin pendientes</div>';
  elProgress.innerHTML = progress.length? progress.map(card).join('') : '<div class="empty">Sin preparación</div>';
  elReady.innerHTML = ready.length? ready.map(card).join('') : '<div class="empty">Sin listos</div>';

  // Beep on new READY cards
  const nowIds = new Set(docs.map(d=>d.id+'-'+d.status));
  const hadReadyBefore = Array.from(nowIds).some(id => !lastSnapshotIds.has(id) && id.endsWith('READY'));
  if(hadReadyBefore) beep(1200,120);
  lastSnapshotIds = nowIds;
}

subscribeActiveOrders(render);

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const id = btn.closest('.k-card')?.dataset.id; if(!id) return;
  const a = btn.dataset.a;
  if(a==='take') await setStatus(id,'IN_PROGRESS');
  if(a==='ready'){ await setStatus(id,'READY'); beep(1200,120); }
  if(a==='deliver'){ await setStatus(id,'DELIVERED'); await archiveDelivered(id); }
});
