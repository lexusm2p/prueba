
import { subscribeOrders, setStatus, archiveDelivered, updateOrder, deleteOrder } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

function money(n){ return '$'+Number(n||0).toFixed(0); }
const colP=document.getElementById('colP'), colIP=document.getElementById('colIP'), colR=document.getElementById('colR');

function renderItemRow(it){
  const baseTags=(it.baseIngredients||[]).map(x=>`<span class='k-badge'>${x}</span>`).join('');
  const exTags=[
    ...(it.extras?.sauces||[]).map(x=>`<span class='k-badge'>Aderezo: ${x}</span>`),
    ...(it.extras?.ingredients||[]).map(x=>`<span class='k-badge'>Extra: ${x}</span>`),
    (it.extras?.patty?`<span class='k-badge'>Carne extra: ${it.extras.patty}</span>`:''),
    (it.extras?.surprise?`<span class='k-badge'>Sorpresa</span>`:'')
  ].join('');
  return `<div style="margin:8px 0;border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px">
    <div class="row"><b>${it.item?.name||'Producto'}</b><span class="badge">x${it.qty||1}</span></div>
    <div class="k-badges" style="margin-top:6px">${baseTags}${exTags}</div>
    ${it.notes?`<div class="muted small">Notas: ${it.notes}</div>`:''}
  </div>`;
}

function card(o){
  const isAgg = Array.isArray(o.items);
  const total = isAgg ? o.orderTotal : o.subtotal;
  const header = `<div class='row' style="align-items:end;justify-content:space-between">
    <h3 style='margin:0'>👤 ${o.customer?o.customer:'Cliente'}</h3>
    <span class='badge'>${isAgg?'Pedido múltiple':'1 producto'}</span>
  </div>`;
  const body = isAgg
    ? o.items.map(renderItemRow).join('')
    : renderItemRow({ item:o.item, qty:o.qty, baseIngredients:o.baseIngredients, extras:o.extras, notes:o.notes, suggested:o.suggested });
  return `<div class="k-card" data-id="${o.id}">
    ${header}
    ${o.suggested && !isAgg ? `<div class="muted small">Sugerido: ${o.suggested}</div>` : ''}
    ${o.notes && !isAgg ? `<div class="muted small">Notas: ${o.notes}</div>` : ''}
    ${body}
    <div class="row" style="margin-top:6px"><span class="badge">Total del pedido: <b>${money(total||0)}</b></span></div>
    <div class="k-actions">
      <button class="btn small" data-a="take">Tomar</button>
      <button class="btn small secondary" data-a="ready">Listo</button>
      <button class="btn small ghost" data-a="deliver">Entregado</button>
      <button class="btn small" data-a="edit">Editar</button>
      <button class="btn small danger" data-a="delete">Eliminar</button>
    </div>
  </div>`;
}

let CURRENT_LIST = [];
function render(list){
  CURRENT_LIST = list;
  const p=list.filter(x=>x.status==='PENDING'), ip=list.filter(x=>x.status==='IN_PROGRESS'), r=list.filter(x=>x.status==='READY');
  const toHtml = arr => arr.map(card).join('')||'<div class="muted">—</div>';
  colP.innerHTML=toHtml(p); colIP.innerHTML=toHtml(ip); colR.innerHTML=toHtml(r);
}

subscribeOrders(render);

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a]'); if(!btn) return;
  const card=btn.closest('.k-card'); const id=card.dataset.id; const a=btn.dataset.a;
  if(a==='take'){ await setStatus(id,'IN_PROGRESS'); beep(); toast('Pedido en preparación'); return; }
  if(a==='ready'){ await setStatus(id,'READY'); beep(); toast('Pedido listo 🛎️'); return; }
  if(a==='deliver'){ await archiveDelivered(id); beep(); toast('Entregado ✔️'); return; }
  if(a==='delete'){ await deleteOrder(id); beep(); toast('Pedido eliminado'); return; }
  if(a==='edit'){ const order=CURRENT_LIST.find(x=>x.id===id); if(order) openEditModal(order); }
});

// ---- Edit modal ----
const modal = document.getElementById('modalEdit');
const eBody  = document.getElementById('eBody');
const eTotal = document.getElementById('eTotal');
const eClose = document.getElementById('eClose');
const eSave  = document.getElementById('eSave');
const eDelete= document.getElementById('eDelete');
let EDIT_ID = null;
let EDIT_ITEMS = [];

function renderEditList(){
  eBody.innerHTML = EDIT_ITEMS.map((it, idx)=>`
    <div class="edit-item" style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;margin:10px 0">
      <div class="row"><b>${it.item?.name||'Producto'}</b>
        <span class="badge">x
          <input type="number" min="0" value="${it.qty||1}" data-ed-qty="${idx}" style="width:70px">
        </span>
      </div>
      <div class="muted small">Notas:</div>
      <textarea data-ed-notes="${idx}" placeholder="Notas del ítem">${it.notes||''}</textarea>
      <div class="row" style="margin-top:6px"><button class="btn ghost small" data-ed-rm="${idx}">Quitar ítem</button></div>
      <input type="hidden" data-ed-line="${idx}" value="${Number(it.lineTotal||0)}"/>
    </div>
  `).join('');

  eBody.querySelectorAll('input[data-ed-qty]').forEach(inp=>{
    inp.oninput = ()=> recalcEdit();
  });
  eBody.querySelectorAll('button[data-ed-rm]').forEach(btn=>{
    btn.onclick = ()=>{
      const i=+btn.dataset.edRm; EDIT_ITEMS.splice(i,1);
      renderEditList(); recalcEdit();
    };
  });

  recalcEdit();
}

function recalcEdit(){
  eBody.querySelectorAll('input[data-ed-qty]').forEach(inp=>{
    const i=+inp.dataset.edQty;
    const qty=Number(inp.value||0);
    const prevQty=Number(EDIT_ITEMS[i].qty||1);
    const pUnit= prevQty>0 ? Number(EDIT_ITEMS[i].lineTotal||0)/prevQty : Number(EDIT_ITEMS[i].lineTotal||0);
    EDIT_ITEMS[i].qty=qty;
    EDIT_ITEMS[i].lineTotal=Math.max(0, Math.round(pUnit*qty));
  });
  eBody.querySelectorAll('textarea[data-ed-notes]').forEach(t=>{
    const i=+t.dataset.edNotes; EDIT_ITEMS[i].notes=t.value.trim();
  });
  const sum = EDIT_ITEMS.reduce((a,it)=>a+Number(it.lineTotal||0),0);
  eTotal.textContent = money(sum);
}

function openEditModal(order){
  EDIT_ID = order.id;
  const items = Array.isArray(order.items) ? JSON.parse(JSON.stringify(order.items)) : [{
    item:order.item, qty:order.qty, lineTotal:order.subtotal||0,
    baseIngredients:order.baseIngredients, extras:order.extras, notes:order.notes
  }];
  EDIT_ITEMS = items;
  document.getElementById('eTitle').textContent = 'Editar: ' + (order.customer || 'Cliente');
  renderEditList();
  modal.classList.add('open');
  eClose.onclick = ()=> modal.classList.remove('open');
  eDelete.onclick = async ()=>{ await deleteOrder(EDIT_ID); beep(); toast('Pedido eliminado'); modal.classList.remove('open'); };
  eSave.onclick = saveEdits;
}

async function saveEdits(){
  if(!EDIT_ID) return;
  const items = EDIT_ITEMS.filter(it=>Number(it.qty||0)>0);
  if(!items.length){ await deleteOrder(EDIT_ID); beep(); toast('Pedido eliminado'); modal.classList.remove('open'); return; }
  const orderTotal = items.reduce((a,it)=>a+Number(it.lineTotal||0),0);
  await updateOrder(EDIT_ID, { items, orderTotal });
  beep(); toast('Pedido actualizado');
  modal.classList.remove('open');
}
