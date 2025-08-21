import { subscribeOrders, setStatus, archiveDelivered } from '../shared/db.js';
import { beep, toast } from '../shared/notify.js';

const colP = document.getElementById('colP'),
      colIP = document.getElementById('colIP'),
      colR = document.getElementById('colR');

function card(o){
  const baseTags = (o.baseIngredients||[]).map(x=>`<span class='k-badge'>${x}</span>`).join('');
  const exTags = [
    ...(o.extras?.sauces||[]).map(x=>`<span class='k-badge'>Aderezo: ${x}</span>`),
    ...(o.extras?.ingredients||[]).map(x=>`<span class='k-badge'>Extra: ${x}</span>`),
    (o.extras?.surprise?`<span class='k-badge'>Sorpresa</span>`:'')
  ].join('');

  return `
  <div class="k-card" data-id="${o.id}">
    <h4>${o.item?.name||'Producto'} · x${o.qty||1}</h4>
    <div class="muted small">Cliente: <b>${o.customer||'-'}</b></div>
    ${o.suggested?`<div class="muted small">Sugerido: ${o.suggested}</div>`:''}
    ${o.notes?`<div class="muted small">Notas: ${o.notes}</div>`:''}
    <div class="k-badges" style="margin-top:8px">${baseTags}${exTags}</div>
    <div class="k-actions">
      <button class="btn small" data-a="take">Tomar</button>
      <button class="btn small secondary" data-a="ready">Listo</button>
      <button class="btn small ghost" data-a="deliver">Entregado</button>
    </div>
  </div>`;
}

function render(list){
  const p  = list.filter(x=>x.status==='PENDING'),
        ip = list.filter(x=>x.status==='IN_PROGRESS'),
        r  = list.filter(x=>x.status==='READY');

  colP.innerHTML  = p.map(card).join('')  || '<div class="muted">—</div>';
  colIP.innerHTML = ip.map(card).join('') || '<div class="muted">—</div>';
  colR.innerHTML  = r.map(card).join('')  || '<div class="muted">—</div>';
}

subscribeOrders(render);

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]');
  if(!btn) return;

  const card = btn.closest('.k-card');
  const id   = card.dataset.id;
  const a    = btn.dataset.a;

  if(a==='take'){
    await setStatus(id,'IN_PROGRESS');
    beep(); toast('Pedido en preparación');
  }
  if(a==='ready'){
    await setStatus(id,'READY');
    beep(); toast('Pedido listo 🛎️');
  }
  if(a==='deliver'){
    await archiveDelivered(id);
    beep(); toast('Entregado ✔️');
  }
});