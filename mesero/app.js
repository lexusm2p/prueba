<script type="module">
import { onOrdersSnapshot, archiveDelivered } from '../shared/db.js';
import { beep, toast } from '../shared/notify.js';

const colIP=document.getElementById('colIP'), colR=document.getElementById('colR');

function card(o,deliver=false){
  const extras = [
    ...(o.extras?.sauces||[]).map(x=>`<span class='k-badge'>Aderezo: ${x}</span>`),
    ...(o.extras?.ingredients||[]).map(x=>`<span class='k-badge'>Extra: ${x}</span>`)
  ].join('');
  return `<div class="k-card" data-id="${o.id}">
    <h4>${o.item?.name||'Producto'} · x${o.qty||1}</h4>
    <div class="muted small">Cliente: <b>${o.customer||'-'}</b></div>
    ${o.baseSauce?`<div class="muted small">Salsa base: <b>${o.baseSauce}</b></div>`:''}
    ${extras?`<div class="k-badges" style="margin-top:6px">${extras}</div>`:''}
    ${o.notes?`<div class="muted small">Notas: ${o.notes}</div>`:''}
    <div class="k-actions">${deliver?'<button class="btn small secondary" data-a="deliver">Entregar</button>':''}</div>
  </div>`;
}

function render(list){
  const ip=list.filter(x=>x.status==='IN_PROGRESS'), r=list.filter(x=>x.status==='READY');
  colIP.innerHTML=ip.map(o=>card(o,false)).join('')||'<div class="muted">—</div>';
  colR.innerHTML=r.map(o=>card(o,true)).join('')||'<div class="muted">—</div>';
}
onOrdersSnapshot(render);

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a="deliver"]'); if(!btn) return;
  const id=btn.closest('.k-card').dataset.id;
  await archiveDelivered(id); beep(); toast('Pedido entregado ✔️');
});
</script>
