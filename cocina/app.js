
import { onOrdersSnapshot, setStatus, archiveDelivered, deleteOrder, updateOrder } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

const Status={ PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY' };
let CURRENT_LIST=[];

onOrdersSnapshot((orders)=>{
  CURRENT_LIST = orders || [];
  render(CURRENT_LIST);
});

function render(list){
  const by = list.reduce((acc,o)=>{ const s=o.status||Status.PENDING; (acc[s] ||= []).push(o); return acc; },{});

  const $p  = document.getElementById('col-pending');
  const $ip = document.getElementById('col-progress');
  const $r  = document.getElementById('col-ready');

  $p.innerHTML  = (by.PENDING||[]).map(renderCard).join('') || '<div class="empty">Sin pendientes</div>';
  $ip.innerHTML = (by.IN_PROGRESS||[]).map(renderCard).join('') || '<div class="empty">Sin preparación</div>';
  $r.innerHTML  = (by.READY||[]).map(renderCard).join('') || '<div class="empty">Sin listos</div>';
}

function renderCard(o){
  const name = o.customerName || '—';
  const itemsDetail = (o.items||[]).map((it)=>{
    const ingr = (it.ingredients||[]).length ? `<div class="small">Incluye: ${it.ingredients.join(', ')}</div>` : '';
    const ex   = (it.extras||[]).length ? `<div class="small">Extras: ${it.extras.map(e=>e.name).join(', ')}</div>` : '';
    return `<div class="small">• <strong>${it.name}</strong> × ${it.qty||1}${ingr}${ex}</div>`;
  }).join('');
  const notes = o.notes ? `<div class="notes">📝 ${escapeHtml(o.notes)}</div>` : '';

  return `
<article class="k-card" data-id="${o.id}">
  <header class="k-head">
    <div class="title">Pedido #${o.id.slice(-5).toUpperCase()}</div>
    <div class="sub">Cliente: <strong>${escapeHtml(name)}</strong></div>
  </header>
  <div class="k-body">
    ${itemsDetail}
    ${notes}
  </div>
  <footer class="k-actions">
    ${o.status!==Status.IN_PROGRESS ? `<button class="btn" data-a="take">Tomar</button>` : ''}
    ${o.status!==Status.READY ? `<button class="btn ok" data-a="ready">Listo</button>` : ''}
    <button class="btn warn" data-a="deliver">Entregar</button>
    <button class="btn ghost" data-a="edit">Editar</button>
    <button class="btn danger" data-a="delete">Eliminar</button>
  </footer>
</article>`;
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a]'); if(!btn) return;
  const card=btn.closest('[data-id]'); const id=card?.dataset?.id; if(!id) return;
  const a=btn.dataset.a; btn.disabled=true;
  try{
    if(a==='take'){ await setStatus(id,Status.IN_PROGRESS); beep?.(); toast?.('Pedido en preparación'); return; }
    if(a==='ready'){ await setStatus(id,Status.READY); beep?.(); toast?.('Pedido listo 🛎️'); return; }
    if(a==='deliver'){ await archiveDelivered(id); beep?.(); toast?.('Entregado ✔️'); card.remove(); return; }
    if(a==='delete'){ await deleteOrder(id); beep?.(); toast?.('Pedido eliminado'); card.remove(); return; }
    if(a==='edit'){ const order=CURRENT_LIST.find(x=>x.id===id); if(order) openEditModal(order); return; }
  }catch(err){ console.error(err); toast?.('Error al actualizar'); }
  finally{ btn.disabled=false; }
});

function openEditModal(order){
  const overlay=document.getElementById('loginOverlay');
  const modal=document.getElementById('modal');
  modal.innerHTML = `
    <div style="position:relative">
      <button class="closex" id="mdClose">×</button>
      <h3>Editar pedido</h3>
      <label class="small muted">Notas para cocina</label>
      <textarea id="mdNotes" class="input" rows="3">${escapeHtml(order.notes||'')}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:8px">
        <button class="btn ghost" id="mdCancel">Cancelar</button>
        <button class="btn ok" id="mdSave">Guardar</button>
      </div>
    </div>`;
  overlay.style.display='flex';

  const close=()=>{ overlay.style.display='none'; modal.innerHTML=''; }
  modal.querySelector('#mdClose').onclick=close;
  modal.querySelector('#mdCancel').onclick=close;
  modal.querySelector('#mdSave').onclick=async ()=>{
    const notes = modal.querySelector('#mdNotes').value.trim();
    await updateOrder(order.id,{ notes });
    toast('Notas actualizadas');
    close();
  };
}

