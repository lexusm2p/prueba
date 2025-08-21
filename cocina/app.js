// /cocina/app.js
import { subscribeOrders, setStatus, archiveDelivered, updateOrder } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

const Status={ PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY' };
let CURRENT_LIST=[];

subscribeOrders((orders)=>{
  CURRENT_LIST = orders || [];
  render(CURRENT_LIST);
});

function render(list){
  const by = list.reduce((acc,o)=>{ const s=o.status||Status.PENDING; (acc[s] ||= []).push(o); return acc; },{});
  setCol('col-pending',  by.PENDING||[]);
  setCol('col-progress', by.IN_PROGRESS||[]);
  setCol('col-ready',    by.READY||[]);
}

function setCol(id, arr){
  const el = document.getElementById(id);
  el.innerHTML = arr.map(renderCard).join('') || '<div class="empty">—</div>';
}

function renderCard(o){
  const ingr = (o.baseIngredients||[]).map(i=>`<div class="k-badge">${escapeHtml(i)}</div>`).join('');
  const xs   = [
    ...(o.extras?.sauces||[]).map(s=>`<div class="k-badge">Aderezo: ${escapeHtml(s)}</div>`),
    ...(o.extras?.ingredients||[]).map(s=>`<div class="k-badge">Extra: ${escapeHtml(s)}</div>`),
    (o.extras?.dlcCarne? `<div class="k-badge">DLC carne 85g</div>`: '')
  ].join('');
  const salsaInfo = o.salsaCambiada ? `Salsa: <b>${escapeHtml(o.salsaCambiada)}</b> (cambio)` :
                    (o.salsaDefault ? `Salsa: ${escapeHtml(o.salsaDefault)}` : '');

  const actions = [
    o.status!==Status.IN_PROGRESS ? `<button class="btn" data-a="take">Tomar</button>` : '',
    o.status!==Status.READY ? `<button class="btn ok" data-a="ready">Listo</button>` : '',
    `<button class="btn warn" data-a="deliver">Entregar</button>`,
    (o.status===Status.PENDING || o.status===Status.IN_PROGRESS) ? `<button class="btn ghost" data-a="edit">Editar</button>` : ''
  ].join('');

  return `
<article class="k-card" data-id="${o.id}">
  <h4>${escapeHtml(o.item?.name||'Producto')} · x${o.qty||1}</h4>
  <div class="muted small">Cliente: <b>${escapeHtml(o.customer||'-')}</b></div>
  ${salsaInfo? `<div class="muted small">${salsaInfo}</div>`:''}
  ${o.notes? `<div class="muted small">Notas: ${escapeHtml(o.notes)}</div>`:''}
  <div class="k-badges" style="margin-top:6px">${ingr}${xs}</div>
  <div class="k-actions" style="margin-top:8px">${actions}</div>
</article>`;
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a]'); if(!btn) return;
  const card=btn.closest('[data-id]'); const id=card?.dataset?.id; if(!id) return;
  const a=btn.dataset.a; btn.disabled=true;
  try{
    if(a==='take'){ await setStatus(id,Status.IN_PROGRESS); beep(); toast('En preparación'); return; }
    if(a==='ready'){ await setStatus(id,Status.READY); beep(); toast('Listo 🛎️'); return; }
    if(a==='deliver'){ await archiveDelivered(id); beep(); toast('Entregado ✔️'); card.remove(); return; }
    if(a==='edit'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const notes = prompt('Editar notas para cocina:', order.notes||'');
      if (notes!==null){ await updateOrder(id,{ notes }); toast('Notas actualizadas'); }
      return;
    }
  }catch(err){ console.error(err); toast('Error al actualizar'); }
  finally{ btn.disabled=false; }
});
