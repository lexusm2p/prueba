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
  DELIVERED: 'DELIVERED',   // entregado, pendiente de cobro
  CANCELLED: 'CANCELLED'
};

let CURRENT_LIST = [];
// IDs de órdenes ya "tomadas" en esta sesión (para ocultar el botón sin esperar snapshot)
const LOCALLY_TAKEN = new Set();

/* ================== Data stream ================== */
subscribeOrders((orders = [])=>{
  // Deduplicar por id por si el snapshot trae duplicados
  const uniq = new Map();
  for (const o of (Array.isArray(orders) ? orders : [])) {
    if (!o?.id) continue;
    uniq.set(o.id, o); // la última gana
  }
  CURRENT_LIST = Array.from(uniq.values());
  render(CURRENT_LIST);
});

/* ================== Helpers ================== */
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);

/* ================== Render ================== */
function render(list){
  // Agrupar por estado
  const by = (list||[]).reduce((acc,o)=>{
    const s = o?.status || Status.PENDING;
    (acc[s] ||= []).push(o);
    return acc;
  },{});

  setCol('col-pending',  by.PENDING||[]);
  setCol('col-progress', by.IN_PROGRESS||[]);
  setCol('col-ready',    by.READY||[]);
  // Por cobrar: entregados y no pagados
  const bill = (by.DELIVERED||[]).filter(o => !o.paid);
  setCol('col-bill',     bill);
}

function setCol(id, arr){
  const el = document.getElementById(id);
  if (!el) return; // defensa por si el contenedor aún no existe
  el.innerHTML = (arr||[]).map(renderCard).join('') || '<div class="empty">—</div>';
}

/* ================== Totales ================== */
// Usa lineTotal si viene de kiosko (incluye extras/HH). Si no, cae a unitPrice*qty.
function calcSubtotal(o={}){
  const items = Array.isArray(o.items) ? o.items : [];
  return items.reduce((s,it)=>{
    const line = (typeof it.lineTotal === 'number')
      ? Number(it.lineTotal||0)
      : (Number(it.unitPrice||0) * Number(it.qty||1));
    return s + line;
  },0);
}
function calcTotal(o={}){
  const sub = (typeof o.subtotal === 'number') ? Number(o.subtotal||0) : calcSubtotal(o);
  const tip = Number(o.tip||0);
  return sub + tip; // comisión no se cobra al cliente
}

/* ================== Card ================== */
function renderCard(o={}){
  const items = Array.isArray(o.items) && o.items.length
    ? o.items
    : (o.item ? [{
        id:o.item.id, name:o.item.name, qty:o.qty||1, unitPrice:o.item.price||0,
        baseIngredients:o.baseIngredients||[], salsaDefault:o.salsaDefault||null,
        salsaCambiada:o.salsaCambiada||null, extras:o.extras||{}, notes:o.notes||'',
        lineTotal: (o.item?.price||0) * (o.qty||1)
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

  const total = calcTotal(o);
  const phoneTxt = o.phone ? ` · Tel: <b>${escapeHtml(String(o.phone))}</b>` : '';

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

  // Resumen HH (si viene en el pedido)
  const hh = o.hh || {};
  const hhSummary = (hh.enabled && Number(hh.totalDiscount||0)>0)
    ? `<span class="k-badge">HH -${Number(hh.discountPercent||0)}% · ahorro ${money(hh.totalDiscount)}</span>`
    : '';

  // Acciones por estado + protección si ya fue tomada localmente
  const canShowTake = (o.status === Status.PENDING) && !LOCALLY_TAKEN.has(o.id);
  const actions = [
    canShowTake ? `<button class="btn" data-a="take">Tomar</button>` : '',
    (o.status === Status.IN_PROGRESS) ? `<button class="btn ok" data-a="ready">Listo</button>` : '',
    // Entregar: pasa a DELIVERED (no archiva)
    (o.status === Status.READY) ? `<button class="btn ok" data-a="deliver">Entregar</button>` : '',
    // Cobrar: sólo si está entregada y no pagada
    (o.status === Status.DELIVERED && !o.paid) ? `<button class="btn" data-a="charge">Cobrar</button>` : '',
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS || (o.status===Status.DELIVERED && !o.paid))
      ? `<button class="btn ghost" data-a="edit">Editar</button>` : '',
    (o.status === Status.PENDING || o.status === Status.IN_PROGRESS || (o.status===Status.DELIVERED && !o.paid))
      ? `<button class="btn warn" data-a="cancel">Eliminar</button>` : ''
  ].join('');

  return `
<article class="k-card" data-id="${o.id}">
  <div class="muted small">
    Cliente: <b>${escapeHtml(o.customer||'-')}</b>${phoneTxt} · ${meta}
  </div>
  <div class="muted small mono" style="margin-top:4px">
    Total por cobrar: <b>${money(total)}</b> ${o.paid ? '· <span class="k-badge ok">Pagado</span>' : ''} ${hhSummary}
  </div>
  ${itemsHtml}
  ${o.notes ? `<div class="muted small"><b>Notas generales:</b> ${escapeHtml(o.notes)}</div>` : ''}
  <div class="k-actions" style="margin-top:8px">${actions}</div>
</article>`;
}

/* ================== Actions ================== */
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

    // "Entregar" NO archiva. Pasa a DELIVERED (Por cobrar)
    if (a==='deliver'){
      await setStatus(id, Status.DELIVERED);
      beep(); toast('Entregado ✔️ · por cobrar');
      return;
    }

    // COBRAR: marca pagado y archiva
    if (a==='charge'){
      const order = CURRENT_LIST.find(x=>x.id===id); if(!order) return;
      const total = calcTotal(order);
      const method = prompt(`Cobrar ${money(total)}\nMétodo (efectivo / tarjeta / transferencia):`, 'efectivo');
      if (method === null) { btn.disabled=false; return; }
      const payMethod = String(method||'efectivo').toLowerCase();
      await updateOrder(id, {
        paid: true,
        paidAt: new Date(),
        payMethod,
        totalCharged: Number(total)
      });
      await archiveDelivered(id); // mueve a archivo
      beep(); toast('Cobro registrado y pedido archivado');
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

    // Cancelar: pide motivo (obligatorio), marca CANCELLED, guarda motivo y archiva
    if (a==='cancel'){
      const confirmDelete = confirm('¿Eliminar este pedido? Pasará a CANCELLED y se archivará.');
      if (!confirmDelete) return;

      const reason = prompt('Motivo de cancelación (obligatorio):', '');
      if (reason === null) return; // usuario canceló
      const trimmed = String(reason).trim();
      if (!trimmed) { alert('Por favor escribe un motivo.'); return; }

      await updateOrder(id, {
        status: Status.CANCELLED,
        cancelReason: trimmed,
        cancelledAt: new Date(),
        cancelledBy: 'kitchen'
      });
      await archiveDelivered(id); // mover a orders_archive conservando los campos
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

/* ================== Utils ================== */
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}