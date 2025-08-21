// /cocina/app.js
// Cocina (Kanban) — flujo: PENDING -> IN_PROGRESS -> READY -> (archive)
// Muestra ingredientes base y extras en listas verticales para estandarizar la preparación.

import { onOrdersSnapshot, setStatus, archiveDelivered, deleteOrder, updateOrder } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

const Status = { PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', READY: 'READY' };
let CURRENT_LIST = [];

// Suscripción en tiempo real a pedidos
onOrdersSnapshot((orders = []) => {
  CURRENT_LIST = orders;
  render(CURRENT_LIST);
});

// Render general por columnas
function render(list) {
  const by = list.reduce((acc, o) => {
    const s = o.status || Status.PENDING;
    (acc[s] ||= []).push(o);
    return acc;
  }, {});

  const $p  = document.getElementById('col-pending');
  const $ip = document.getElementById('col-progress');
  const $r  = document.getElementById('col-ready');

  $p.innerHTML  = (by[Status.PENDING]     || []).map(renderCard).join('') || empty('Sin pendientes');
  $ip.innerHTML = (by[Status.IN_PROGRESS] || []).map(renderCard).join('') || empty('Sin preparación');
  $r.innerHTML  = (by[Status.READY]       || []).map(renderCard).join('') || empty('Sin listos');
}

function empty(msg){ return `<div class="empty muted">${msg}</div>`; }

// Card de pedido con ingredientes en columnas
function renderCard(o) {
  const idShort = safe(o.id?.slice(-5)?.toUpperCase());
  const name    = safe(o.customer || o.customerName || '—');
  const qty     = Number(o.qty || o.items?.[0]?.qty || 1);
  const item    = o.item || o.items?.[0] || {};
  const title   = safe(item.name || 'Producto');

  // Ingredientes base en lista vertical
  const base = (o.baseIngredients || []).map(i => `<li>${safe(i)}</li>`).join('');
  // Extras (aderezos e ingredientes) en lista vertical
  const extraSauces = (o.extras?.sauces || []).map(s => `<li>Aderezo: ${safe(s)}</li>`).join('');
  const extraIngrs  = (o.extras?.ingredients || []).map(e => `<li>Extra: ${safe(e)}</li>`).join('');
  const surprise    = o.extras?.surprise ? `<div class="k-badge">🎲 Sorpresa</div>` : '';

  const suggested   = o.suggested ? `<div class="muted small">Sugerido: <b>${safe(o.suggested)}</b></div>` : '';
  const notes       = o.notes ? `<div class="notes">📝 ${safe(o.notes)}</div>` : '';

  // Botones según estado (flujo lineal)
  const isPending   = o.status === Status.PENDING || !o.status;
  const inProgress  = o.status === Status.IN_PROGRESS;
  const isReady     = o.status === Status.READY;

  const btnEdit   = (isPending || inProgress) ? `<button class="btn ghost small" data-a="edit">Editar</button>` : '';
  const btnTake   = (isPending)  ? `<button class="btn small" data-a="take">Tomar</button>` : '';
  const btnReady  = (inProgress) ? `<button class="btn small ok" data-a="ready">Listo</button>` : '';
  const btnDeliver= (isReady)    ? `<button class="btn small warn" data-a="deliver">Entregado</button>` : '';
  // (Opcional) Eliminar sólo antes de estar listo
  const btnDelete = (isPending || inProgress) ? `<button class="btn small danger" data-a="delete">Eliminar</button>` : '';

  return `
<article class="k-card" data-id="${safe(o.id)}">
  <header class="k-head">
    <div class="title">#${idShort} · ${title} ×${qty}</div>
    <div class="sub">Cliente: <strong>${name}</strong></div>
    ${suggested}
  </header>

  <div class="k-body">
    <div class="k-badges" style="margin-bottom:8px">${surprise}</div>

    <div class="columns" style="grid-template-columns: 1fr 1fr">
      <div>
        <div class="k-title">Base</div>
        <ul class="vlist">
          ${base || '<li class="muted">—</li>'}
        </ul>
      </div>
      <div>
        <div class="k-title">Extras</div>
        <ul class="vlist">
          ${(extraSauces + extraIngrs) || '<li class="muted">—</li>'}
        </ul>
      </div>
    </div>

    ${notes}
  </div>

  <footer class="k-actions">
    ${btnEdit}${btnTake}${btnReady}${btnDeliver}${btnDelete}
  </footer>
</article>`;
}

// Seguridad mínima para textos
function safe(s=''){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

// Acciones de la tarjeta
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;

  const card = btn.closest('[data-id]');
  const id   = card?.dataset?.id;
  if (!id) return;

  const a = btn.dataset.a;
  btn.disabled = true;

  try {
    if (a === 'take') {
      await setStatus(id, Status.IN_PROGRESS);
      beep(); toast('Pedido en preparación');
    }
    if (a === 'ready') {
      await setStatus(id, Status.READY);
      beep(); toast('Pedido listo 🛎️');
    }
    if (a === 'deliver') {
      await archiveDelivered(id);
      beep(); toast('Entregado ✔️');
      card.remove();
    }
    if (a === 'delete') {
      await deleteOrder(id);
      beep(); toast('Pedido eliminado');
      card.remove();
    }
    if (a === 'edit') {
      const order = CURRENT_LIST.find(x => x.id === id);
      if (order) openEditModal(order);
    }
  } catch (err) {
    console.error(err);
    toast('Error al actualizar');
  } finally {
    btn.disabled = false;
  }
});

// Modal de edición (sólo notas para cocina)
function openEditModal(order) {
  // Reutiliza overlay/modal si ya existen, o créalos al vuelo
  let overlay = document.getElementById('loginOverlay');
  let modal   = document.getElementById('modal');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loginOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;place-items:center;z-index:1000;';
    document.body.appendChild(overlay);
  }
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal';
    modal.style.cssText = 'background:#0f2331;border:1px solid rgba(255,255,255,.1);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.5);padding:16px;min-width:min(640px,92vw);max-width:92vw;';
    overlay.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="position:relative">
      <button class="closex" id="mdClose" style="position:absolute;right:8px;top:8px" aria-label="Cerrar">×</button>
      <h3 style="margin:0 0 8px 0">Editar pedido</h3>
      <label class="small muted">Notas para cocina</label>
      <textarea id="mdNotes" class="input" rows="4" style="width:100%">${safe(order.notes || '')}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:10px;gap:8px">
        <button class="btn ghost" id="mdCancel">Cancelar</button>
        <button class="btn ok" id="mdSave">Guardar</button>
      </div>
    </div>`;

  const close = () => { overlay.style.display = 'none'; };
  document.getElementById('mdClose').onclick  = close;
  document.getElementById('mdCancel').onclick = close;
  document.getElementById('mdSave').onclick   = async () => {
    const notes = document.getElementById('mdNotes').value.trim();
    try {
      await updateOrder(order.id, { notes });
      toast('Notas actualizadas');
    } catch (e) {
      console.error(e);
      toast('Error al guardar notas');
    } finally {
      close();
    }
  };

  overlay.style.display = 'flex';
}
