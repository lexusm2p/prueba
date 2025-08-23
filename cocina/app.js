// /cocina/app.js
import {
  subscribeOrders, setStatus, archiveDelivered, updateOrder,
  applyInventoryForOrder
} from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

const Status = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  READY: 'READY',
  CANCELLED: 'CANCELLED'
};

let CURRENT_LIST = [];
// IDs de órdenes ya "tomadas" en esta sesión (para ocultar el botón sin esperar snapshot)
const LOCALLY_TAKEN = new Set();

subscribeOrders((orders = [])=>{
  CURRENT_LIST = Array.isArray(orders) ? orders : [];
  render(CURRENT_LIST);
});

function render(list){
  const by = (list||[]).reduce((acc,o)=>{
    const s = o?.status || Status.PENDING;
    (acc[s] ||= []).push(o);
    return acc;
  },{});
  setCol('col-pending',  by.PENDING||[]);
  setCol('col-progress', by.IN_PROGRESS||[]);
  setCol('col-ready',    by.READY||[]);
}

function setCol(id, arr){
  const el = document.getElementById(id);
  el.innerHTML = (arr||[]).map(renderCard).join('') || '<div class="empty">—</div>';
}

function renderCard(o={}){
  const items = Array.isArray(o.items) && o.items.length
    ? o.items
    : (o.item ? [{
        id:o.item.id, name:o.item.name, qty:o.qty||1, unitPrice:o.item.price||0,
        baseIngredients:o.baseIngredients||[], salsaDefault:o.salsaDefault||null,
        salsaCambiada:o.salsaCambiada||null, extras:o.extras||{}, notes:o.notes||''
      }] : []);

  // META visible: mesa o pickup con teléfono
  let meta = '—';
  if (o.orderType === 'dinein') {
    meta = `Mesa: <b>${escapeHtml(o.table||'?')}</b>`;
  } else if (o.orderType === 'pickup') {
    const phone = (o.phone || '').toString();
    meta = `Pickup${phone ? ` · Tel: <b>${escapeHtml(phone)}</b>` : ''}`;
  } else if (o.orderType) {
    meta = escapeHtml(o.orderType);
  }

  const itemsHtml = items.map(it=>{
    const ingr = (it.baseIngredients||[]).map(i=>`<div class="k-badge">${escapeHtml(i)}</div>`).join('');
    const extrasBadges = [
      ...(it.extras?.sauces||[]).map(s=>`<div class="k-badge">Aderezo: ${escapeHtml(s)}</div>`),
      ...(it.extras?.ingredients||[]).map(s=>`<div class="k-badge">Extra: ${escapeHtml(s)}</div>`),
      (it.extras?.dlcCarne ? '<div class="k-badge">DLC carne 85g</div>' : '')
    ].join('');
    const salsaInfo = it.salsaCambiada
      ? `Salsa: <b>${escapeHtml(it.salsaCambiada)}</b> (cambio)`
      : (it.salsaDefault ? `Salsa: ${escapeHtml(it.salsaDefault)}` : '');
    return `
      <div class="order-item">
        <h4>${escapeHtml(it.name||'Producto')} · x${it.qty||1}</h4>
        ${salsaInfo ? `<div class="muted small">${salsaInfo}</div>` : ''}
        ${it.notes ? `<div class="muted small">Notas: ${escapeHtml(it.notes)}</div>` : ''}
        <div class="k-badges" style="margin-top:6px">${ingr}${extrasBadges}</div>
      </div>`;
  }).join('');

  // Acciones por estado + protección si ya fue tomada localmente
  const canShowTake = (o.status === Status.PENDING) && !LOCALLY_TAKEN.has(o.id);
  const actions = [
    canShowTake ? `<button class="btn" data-a="take">Tomar</button>` : '',
    (o.status === Status.IN_PROGRESS) ? `<button class="btn ok" data-a="ready">Listo</button>` : '',
    `<button class="btn warn" data-a="deliver">Entregar</button>`,
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS)
      ? `<button class="btn ghost" data-a="edit">Editar</button>` : '',
    // Cancelar (marca CANCELLED y archiva)
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS)
      ? `<button class="btn warn" data-a="cancel">Eliminar</button>` : ''
  ].join('');

  return `
<article class="k-card" data-id="${o.id}">
  <div class="muted small">Cliente: <b>${escapeHtml(o.customer||'-')}</b> · ${meta}</div>
  ${itemsHtml}
  ${o.notes ? `<div class="muted small"><b>Notas generales:</b> ${escapeHtml(o.notes)}</div>` : ''}
  <div class="k-actions" style="margin-top:8px">${actions}</div>
</article>`;
}

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const card = btn.closest('[data-id]'); const id = card?.dataset?.id; if(!id) return;
  const a = btn.dataset.a;

  // Evita doble click
  btn.disabled = true;

  try{
    if (a==='take'){
      // Marca local para que no vuelva a renderizar "Tomar" aunque todavía no llegue el snapshot
      LOCALLY_TAKEN.add(id);
      btn.textContent = 'Tomando…';
      // Aplica inventario (vasitos por aderezos extra, etc.)
      const order = CURRENT_LIST.find(x=>x.id===id);
      if(order){
        await applyInventoryForOrder({ ...order, id }); // asegura incluir id
      }
      await setStatus(id, Status.IN_PROGRESS);
      beep(); toast('En preparación');
      render(CURRENT_LIST); // rerender rápido
      return;
    }

    if (a==='ready'){
      await setStatus(id, Status.READY);
      beep(); toast('Listo 🛎️');
      return;
    }

    if (a==='deliver'){
      await archiveDelivered(id);
      beep(); toast('Entregado ✔️');
      card.remove();
      return;
    }

    if (a==='edit'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const notes = prompt('Editar notas generales para cocina:', order.notes||'');
      if (notes!==null){
        await updateOrder(id,{ notes });
        toast('Notas actualizadas');
      }
      return;
    }

    // Cancelar: marca como CANCELLED y archiva (para mantener historial)
    if (a==='cancel'){
      const ok = confirm('¿Eliminar este pedido? Se archivará como CANCELLED.');
      if (!ok) return;
      await updateOrder(id, { status: Status.CANCELLED });
      await archiveDelivered(id); // mover a orders_archive
      beep(); toast('Pedido eliminado');
      card.remove();
      return;
    }

  }catch(err){
    console.error(err);
    toast('Error al actualizar');
    if(a==='take'){ LOCALLY_TAKEN.delete(id); }
  }finally{
    btn.disabled = false;
  }
});

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[m]));
}
