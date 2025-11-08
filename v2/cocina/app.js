// cocina/app.js · Seven V2
// Lee pedidos desde shared/db.js (Firestore o SIM) y los pinta en columnas.

import { subscribeOrders, updateOrderStatus, BASE_PREFIX } from '../shared/db.js?v=20251108';
import { ensureAuth } from '../shared/firebase.js?v=20251106a';

console.info('[cocina] BASE_PREFIX =', BASE_PREFIX);

/* ======================= Columnas ======================= */

const colPending   = document.querySelector('[data-col="pending"]')   || document.querySelectorAll('.col')[0];
const colProgress  = document.querySelector('[data-col="progress"]')  || document.querySelectorAll('.col')[1];
const colReady     = document.querySelector('[data-col="ready"]')     || document.querySelectorAll('.col')[2];
const colToCharge  = document.querySelector('[data-col="tocash"]')    || document.querySelectorAll('.col')[3];
const colDelivered = document.querySelector('[data-col="delivered"]') || document.querySelectorAll('.col')[4];
const totalEl      = document.getElementById('totalAmount') || document.querySelector('[data-total]');

function money(n){ return '$' + Number(n||0).toFixed(0); }

/* ======================= Render ======================= */

function renderOrders(list){
  // limpia
  [colPending,colProgress,colReady,colToCharge,colDelivered].forEach(col=>{
    if (col) col.innerHTML = '';
  });

  let totalDay = 0;

  (list || []).forEach(order => {
    const col = pickColumn(order);
    if (!col) return;

    totalDay += Number(order.total || 0);

    const card = document.createElement('div');
    card.className = 'k-card';

    const itemsHtml = (order.items || [])
      .map(it => {
        const extras = it.extras && Object.keys(it.extras).length
          ? ' <span class="muted small">(mods)</span>' : '';
        return `<div class="small">${escapeHtml(it.name || it.id)} ×${it.qty || 1}${extras}</div>`;
      })
      .join('');

    card.innerHTML = `
      <div class="k-head">
        <div class="title">
          #${escapeHtml(order.id || '').slice(0, 8)}
          ${order.customerName ? ' · ' + escapeHtml(order.customerName) : ''}
        </div>
        <div class="small muted">
          ${order.phone ? escapeHtml(order.phone) + ' · ' : ''}
          ${order.source || 'kiosk-v2'}
        </div>
      </div>
      <div class="k-body">
        ${itemsHtml || '<div class="small muted">Sin detalle</div>'}
        <div class="price">${money(order.total)}</div>
      </div>
      <div class="k-actions">
        ${actionsFor(order)}
      </div>
    `;

    bindActions(card, order);
    col.appendChild(card);
  });

  if (totalEl) totalEl.textContent = money(totalDay);
}

function pickColumn(order){
  const st = (order.status || 'pending').toLowerCase();
  if (st === 'pending') return colPending;
  if (st === 'cooking' || st === 'in-progress' || st === 'progress') return colProgress;
  if (st === 'ready') return colReady;
  if (st === 'tocash' || st === 'to-charge' || st === 'porcobrar') return colToCharge;
  if (st === 'delivered' || st === 'done') return colDelivered;
  // fallback
  return colPending;
}

function actionsFor(order){
  const st = (order.status || 'pending').toLowerCase();
  if (st === 'pending'){
    return `
      <button class="btn tiny" data-a="to-progress">En progreso</button>
    `;
  }
  if (st === 'cooking' || st === 'in-progress' || st === 'progress'){
    return `
      <button class="btn tiny ok" data-a="to-ready">Listo</button>
    `;
  }
  if (st === 'ready'){
    return `
      <button class="btn tiny" data-a="to-tocash">Por cobrar</button>
      <button class="btn tiny ok" data-a="to-delivered">Entregado</button>
    `;
  }
  if (st === 'tocash' || st === 'to-charge' || st === 'porcobrar'){
    return `
      <button class="btn tiny ok" data-a="to-delivered">Cobrado / Entregado</button>
    `;
  }
  return '';
}

function bindActions(card, order){
  card.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-a]');
    if (!btn) return;
    const act = btn.dataset.a;
    try{
      if (act === 'to-progress'){
        await updateOrderStatus(order.id, 'cooking');
      }else if (act === 'to-ready'){
        await updateOrderStatus(order.id, 'ready');
      }else if (act === 'to-tocash'){
        await updateOrderStatus(order.id, 'tocash');
      }else if (act === 'to-delivered'){
        await updateOrderStatus(order.id, 'delivered');
      }
    }catch(err){
      console.error('[cocina] update status error', err);
      alert('No se pudo actualizar el pedido');
    }
  });
}

function escapeHtml(s=''){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/* ======================= Init ======================= */

async function init(){
  try{
    await ensureAuth();
  }catch(e){
    console.warn('[cocina] ensureAuth fallo (modo sim/local)', e);
  }

  subscribeOrders(list => {
    console.info('[cocina] orders:', list.length);
    renderOrders(list);
  });

  console.info('[cocina] listo');
}

init();
