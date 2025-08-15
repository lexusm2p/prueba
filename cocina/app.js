// /prueba/cocina/app.js
import { ensureAuth } from '../lib/firebase.js';
import { subscribeActiveOrders, setStatus, archiveDelivered, Status } from '../lib/db.js';
import { beep } from '../lib/notify.js';

const elPending  = document.querySelector('#list-pending');
const elProgress = document.querySelector('#list-progress');
const elReady    = document.querySelector('#list-ready');

function card(o){
  const items = (o.items||[]).map(i=>`<li>${i.qty||1}× ${i.name}${i.size?' '+i.size:''}</li>`).join('');
  const salsas = (o.salsas && o.salsas.length) ? `<div>Salsas: ${o.salsas.join(', ')}</div>`:'';
  const extras = (o.extras && o.extras.length) ? `<div>Extras: ${o.extras.join(', ')}</div>`:'';
  const notas  = o.notes ? `<div>Notas: ${o.notes}</div>`:'';
  let actions='';
  if (o.status===Status.PENDING)     actions = `<button data-a="take">Tomar</button>`;
  if (o.status===Status.IN_PROGRESS) actions = `<button data-a="ready">Listo</button>`;
  if (o.status===Status.READY)       actions = `<button data-a="deliver">Entregar</button>`;
  return `
  <div class="k-card" data-id="${o.id}">
    <div class="head">
      <b>${o.customerName || 'Cliente'}</b> · Mesa ${o.table||'-'}
      ${o.totals?.comboMinis?.applied?`<span class="chip">Combo Minis</span>`:''}
    </div>
    <ul style="margin:0 0 6px 18px">${items}</ul>
    ${salsas}${extras}${notas}
    <div class="foot">
      <span>Total: $${o.totals?.total ?? o.total ?? '-'}</span>
      ${actions}
    </div>
  </div>`;
}

function render(rows){
  const pend = rows.filter(r=>r.status===Status.PENDING);
  const prog = rows.filter(r=>r.status===Status.IN_PROGRESS);
  const rdy  = rows.filter(r=>r.status===Status.READY);
  elPending.innerHTML  = pend.map(card).join('') || '<div class="empty">Sin pendientes</div>';
  elProgress.innerHTML = prog.map(card).join('') || '<div class="empty">Sin preparación</div>';
  elReady.innerHTML    = rdy.map(card).join('')  || '<div class="empty">Sin listos</div>';
}

async function main(){
  await ensureAuth(); // imprescindible con reglas que piden auth
  subscribeActiveOrders(render);

  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-a]');
    if(!btn) return;
    const id = btn.closest('.k-card')?.dataset.id; if(!id) return;
    const a = btn.dataset.a;
    try{
      if(a==='take')    await setStatus(id, Status.IN_PROGRESS);
      if(a==='ready') { await setStatus(id, Status.READY); beep(); }
      if(a==='deliver') await archiveDelivered(id);
    }catch(err){ alert('Error: '+err.message); }
  });
}
main();
