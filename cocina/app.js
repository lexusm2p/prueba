<script type="module">
import { onOrdersSnapshot, setStatus, archiveDelivered, deleteOrder, updateOrder } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

const Status={ PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY' };
let CURRENT_LIST=[];

onOrdersSnapshot((orders)=>{ CURRENT_LIST = orders||[]; render(CURRENT_LIST); });

function render(list){
  const by = list.reduce((acc,o)=>{ const s=o.status||Status.PENDING; (acc[s] ||= []).push(o); return acc; },{});
  const $p  = document.getElementById('col-pending');
  const $ip = document.getElementById('col-progress');
  const $r  = document.getElementById('col-ready');
  $p.innerHTML  = (by.PENDING||[]).map(renderCard).join('') || '<div class="muted">—</div>';
  $ip.innerHTML = (by.IN_PROGRESS||[]).map(renderCard).join('') || '<div class="muted">—</div>';
  $r.innerHTML  = (by.READY||[]).map(renderCard).join('') || '<div class="muted">—</div>';
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

function renderCard(o){
  const name = o.customer || o.customerName || '—';
  const items = o.item ? `${o.item.name} x${o.qty||1}` :
               (o.items||[]).map(it=>`${it.name} x${it.qty||1}`).join(' · ');
  const notes = o.notes ? `<div class="notes">📝 ${escapeHtml(o.notes)}</div>` : '';

  const baseList = (o.baseIngredients||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
  const baseSauce = o.baseSauce ? `<div class="muted small">Salsa base: <b>${escapeHtml(o.baseSauce)}</b></div>` : '';
  const extraSauces = (o.extras?.sauces||[]).map(x=>`<span class='k-badge'>Aderezo extra: ${escapeHtml(x)}</span>`).join('');
  const extraIngr = (o.extras?.ingredients||[]).map(x=>`<span class='k-badge'>Extra: ${escapeHtml(x)}</span>`).join('');
  const extrasBlock = (extraSauces || extraIngr) ? `<div class="k-badges" style="margin-top:8px">${extraSauces}${extraIngr}</div>` : '';

  // Acciones: no permitir editar/retomar después de READY; no mostrar "Tomar" cuando ya está IN_PROGRESS
  const canTake  = o.status!==Status.IN_PROGRESS && o.status!==Status.READY;
  const canReady = o.status!==Status.READY;
  const canEdit  = o.status!==Status.READY;

  return `
<article class="k-card" data-id="${o.id}">
  <header class="k-head">
    <div class="title">Pedido #${(o.id||'').slice(-5).toUpperCase()}</div>
    <div class="sub">Cliente: <strong>${escapeHtml(name)}</strong> — ${items||'—'}</div>
  </header>
  <div class="k-body">
    ${baseSauce}
    ${baseList ? `<div class="muted small" style="margin-top:6px">Ingredientes base:</div><ul class="muted small" style="margin:6px 0 0 16px">${baseList}</ul>` : ''}
    ${extrasBlock}
    ${notes}
  </div>
  <footer class="k-actions">
    ${canTake  ? `<button class="btn" data-a="take">Tomar</button>` : ''}
    ${canReady ? `<button class="btn ok" data-a="ready">Listo</button>` : ''}
    <button class="btn warn" data-a="deliver">Entregar</button>
    ${canEdit ? `<button class="btn ghost" data-a="edit">Editar</button>` : ''}
    <button class="btn danger" data-a="delete">Eliminar</button>
  </footer>
</article>`;
}

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a]'); if(!btn) return;
  const card=btn.closest('[data-id]'); const id=card?.dataset?.id; if(!id) return;
  const a=btn.dataset.a; btn.disabled=true;
  try{
    if(a==='take'){ await setStatus(id,Status.IN_PROGRESS); beep(); toast('Pedido en preparación'); return; }
    if(a==='ready'){ await setStatus(id,Status.READY); beep(); toast('Pedido listo 🛎️'); return; }
    if(a==='deliver'){ await archiveDelivered(id); beep(); toast('Entregado ✔️'); card.remove(); return; }
    if(a==='delete'){ await deleteOrder(id); beep(); toast('Pedido eliminado'); card.remove(); return; }
    if(a==='edit'){
      const order=CURRENT_LIST.find(x=>x.id===id);
      if(order && order.status!==Status.READY) openEditModal(order);
      return;
    }
  }catch(err){ console.error(err); toast('Error al actualizar'); }
  finally{ btn.disabled=false; }
});

function openEditModal(order){
  const overlay=document.getElementById('loginOverlay') || (()=>{ const o=document.createElement('div'); o.id='loginOverlay'; o.className='modal open'; document.body.appendChild(o); return o; })();
  const modal=document.getElementById('modal') || (()=>{ const m=document.createElement('div'); m.id='modal'; m.className='modal-card'; overlay.appendChild(m); return m; })();
  modal.innerHTML = `
    <div style="position:relative">
      <button class="btn ghost small" id="mdClose">Cerrar</button>
      <h3>Editar pedido</h3>
      <label class="small muted">Notas para cocina</label>
      <textarea id="mdNotes" class="input" rows="3">${(order.notes||'')}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:8px">
        <button class="btn ghost" id="mdCancel">Cancelar</button>
        <button class="btn ok" id="mdSave">Guardar</button>
      </div>
    </div>`;
  const close=()=>{ overlay.remove(); };
  modal.querySelector('#mdClose').onclick=close;
  modal.querySelector('#mdCancel').onclick=close;
  modal.querySelector('#mdSave').onclick=async ()=>{
    const notes = modal.querySelector('#mdNotes').value.trim();
    await updateOrder(order.id,{ notes });
    toast('Notas actualizadas');
    close();
  };
}
</script>
