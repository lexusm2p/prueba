// /cocina/app.js
// Cocina: Kanban + ingredientes listados en vertical para estandarización
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

  $p.innerHTML  = (by.PENDING||[]).map(renderCard).join('')  || '<div class="empty">Sin pendientes</div>';
  $ip.innerHTML = (by.IN_PROGRESS||[]).map(renderCard).join('')|| '<div class="empty">Sin preparación</div>';
  $r.innerHTML  = (by.READY||[]).map(renderCard).join('')     || '<div class="empty">Sin listos</div>';
}

function renderCard(o){
  const name   = o.customer || o.customerName || '—';
  const qty    = o.qty || 1;
  const itemNm = (o.item && o.item.name) || 'Producto';

  // Ingredientes base en vertical (arriba → abajo)
  const baseList = (o.baseIngredients||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
  // Aderezos extra
  const sauces   = (o.extras?.sauces||[]).map(x=>`<li>Aderezo: ${escapeHtml(x)}</li>`).join('');
  // Ingredientes extra
  const adds     = (o.extras?.ingredients||[]).map(x=>`<li>Extra: ${escapeHtml(x)}</li>`).join('');
  // DLC en minis
  const dlcTag   = (o.extras?.dlcCarneGrande) ? `<div class="k-badge" style="margin-top:6px">DLC carne grande</div>` : '';

  const notes = o.notes ? `<div class="notes">📝 ${escapeHtml(o.notes)}</div>` : '';

  return `
<article class="k-card" data-id="${o.id}">
  <header class="k-head">
    <div class="title">${escapeHtml(itemNm)} · x${qty}</div>
    <div class="sub">Cliente: <strong>${escapeHtml(name)}</strong></div>
  </header>

  <div class="k-body">
    ${o.suggested ? `<div class="muted small">Sugerido: ${escapeHtml(o.suggested)}</div>` : ''}

    <div class="row" style="align-items:flex-start; gap:18px; margin-top:8px">
      <div>
        <div class="k-title" style="margin:0 0 6px 0">Ingredientes base</div>
        <ul class="vlist">${baseList || '<li class="muted">—</li>'}</ul>
        ${dlcTag}
      </div>

      <div>
        <div class="k-title" style="margin:0 0 6px 0">Aderezos extra</div>
        <ul class="vlist">${sauces || '<li class="muted">—</li>'}</ul>
      </div>

      <div>
        <div class="k-title" style="margin:0 0 6px 0">Ingredientes extra</div>
        <ul class="vlist">${adds || '<li class="muted">—</li>'}</ul>
      </div>
    </div>

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

function escapeHtml(s=''){ 
  return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-a]'); if(!btn) return;
  const card=btn.closest('[data-id]'); const id=card?.dataset?.id; if(!id) return;
  const a=btn.dataset.a; btn.disabled=true;
  try{
    if(a==='take'){ await setStatus(id,Status.IN_PROGRESS); beep?.(); toast?.('Pedido en preparación'); return; }
    if(a==='ready'){ await setStatus(id,Status.READY);     beep?.(); toast?.('Pedido listo 🛎️');      return; }
    if(a==='deliver'){ await archiveDelivered(id);         beep?.(); toast?.('Entregado ✔️');         card.remove(); return; }
    if(a==='delete'){ await deleteOrder(id);               beep?.(); toast?.('Pedido eliminado');     card.remove(); return; }
    if(a==='edit'){ const order=CURRENT_LIST.find(x=>x.id===id); if(order) openEditModal(order); return; }
  }catch(err){ console.error(err); toast?.('Error al actualizar'); }
  finally{ btn.disabled=false; }
});

function openEditModal(order){
  const overlay=document.getElementById('loginOverlay') || createOverlay();
  const modal=document.getElementById('modal') || createModal(overlay);
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

function createOverlay(){
  const ov = document.createElement('div');
  ov.id='loginOverlay';
  ov.style.cssText='position:fixed;inset:0;display:none;place-items:center;background:rgba(0,0,0,.5);z-index:200;';
  document.body.appendChild(ov);
  return ov;
}
function createModal(ov){
  const m = document.createElement('div');
  m.id='modal';
  m.style.cssText='background:#0f2331;border:1px solid rgba(255,255,255,.1);border-radius:14px;max-width:620px;width:92vw;padding:16px;box-shadow:0 8px 24px rgba(0,0,0,.45)';
  ov.appendChild(m);
  return m;
}
