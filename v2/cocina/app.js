// /cocina/app.js — V2.6 LEAN (estable + compat db v2.3+)
// - Render con diff por columna (sin parpadeos)
// - Botones protegidos contra doble click
// - Filtrado mínimo local ($0 / sin items)
// - Usa SOLO subscribeKitchenOrders del db (ya viene depurado)

import * as DB from '../shared/db.js';

const Status = {
  PENDING:     'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  READY:       'READY',
  DELIVERED:   'DELIVERED',
  PAID:        'PAID',
  CANCELLED:   'CANCELLED'
};

// ----- DOM -----
const els = {
  board: document.getElementById('cols'),
  listP: document.getElementById('lP'),
  listI: document.getElementById('lI'),
  listR: document.getElementById('lR'),
  listD: document.getElementById('lD'),
  cntP:  document.getElementById('cP'),
  cntI:  document.getElementById('cI'),
  cntR:  document.getElementById('cR'),
  cntD:  document.getElementById('cD'),
};

// ----- Utils -----
const money = (n) => '$' + Number(n || 0).toFixed(0);
const safeLen = (a) => Array.isArray(a) ? a.length : 0;
const validOrder = (o) => Number(o?.subtotal || 0) > 0 && safeLen(o?.items) > 0;
const sortByCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

// firma corta para render-diff
const sigRow = (o) =>
  `${o.id}|${o.status}|${Number(o.updatedAt || o.createdAt || 0)}|${Number(o.subtotal || 0)}`;

const lastSig = new Map(); // columnEl -> signature string

function setCount(el, n) {
  if (!el) return;
  el.textContent = String(n);
}

function itemsText(o) {
  try {
    return (o.items || [])
      .map(it => {
        const nm = (it.name || it.title || it.id || 'x').toString();
        const q  = Number(it.qty || it.quantity || it.q || 1);
        return `${nm} ×${q}`;
      })
      .join(', ');
  } catch {
    return '';
  }
}

// ----- Render -----
function cardHTML(o) {
  const name = (o.customer || o.clientName || o.name || 'Cliente');
  const items = itemsText(o);
  const orderType = o.orderType ? `<span class="badge">${o.orderType}</span>` : '';
  const price = `<span class="price">${money(o.subtotal)}</span>`;

  // botones por estado
  let actions = '';
  if (o.status === Status.PENDING) {
    actions = `<button class="btn" data-a="take">Tomar</button>`;
  } else if (o.status === Status.IN_PROGRESS) {
    actions = `<button class="btn" data-a="ready">Listo</button>`;
  } else if (o.status === Status.READY) {
    actions = `<button class="btn" data-a="deliver">Entregar</button>
               <button class="btn" data-a="paid">Cobrar</button>`;
  } else if (o.status === Status.DELIVERED) {
    actions = `<button class="btn" data-a="paid">Cobrar</button>`;
  }

  const canCancel = o.status !== Status.CANCELLED;
  const cancel = canCancel
    ? `<button class="btn danger" data-a="cancel">Cancelar</button>`
    : `<span class="badge">Cancelada</span>`;

  return `
    <div class="row">
      <b>#${String(o.id || '').slice(-5)} · ${name}</b>
      ${orderType}
      ${price}
    </div>
    ${items ? `<div class="muted">${items}</div>` : ``}
    <div class="row" style="margin-top:8px; gap:6px">
      ${actions}
      ${cancel}
    </div>
  `;
}

function renderColumn(list, colEl, cntEl) {
  // firma de la columna (ids+estado+updatedAt+subtotal ordenados)
  const signature = (list || []).map(sigRow).join('§');
  if (lastSig.get(colEl) === signature) {
    // nada cambió; evita repintar
    setCount(cntEl, list.length);
    return;
  }
  lastSig.set(colEl, signature);

  const frag = document.createDocumentFragment();
  for (const o of list) {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.id = o.id;
    div.innerHTML = cardHTML(o);
    frag.appendChild(div);
  }
  colEl.replaceChildren(frag);
  setCount(cntEl, list.length);
}

function groupAndRender(rows) {
  // seguridad local (el backend ya viene filtrado)
  const clean = (rows || []).filter(validOrder).sort(sortByCreated);

  const g = {
    [Status.PENDING]:     [],
    [Status.IN_PROGRESS]: [],
    [Status.READY]:       [],
    [Status.DELIVERED]:   [],
  };
  for (const o of clean) {
    if (g[o.status]) g[o.status].push(o);
  }

  renderColumn(g[Status.PENDING],     els.listP, els.cntP);
  renderColumn(g[Status.IN_PROGRESS], els.listI, els.cntI);
  renderColumn(g[Status.READY],       els.listR, els.cntR);
  renderColumn(g[Status.DELIVERED],   els.listD, els.cntD);
}

// ----- Actions -----
let busy = new Set(); // ids en actualización para bloquear clicks repetidos

async function doUpdate(id, next) {
  if (!id || busy.has(id)) return;
  busy.add(id);
  try {
    await DB.updateOrderStatus(id, next);
  } catch (err) {
    console.warn('[cocina] updateOrderStatus error:', err);
    alert('No se pudo actualizar. Revisa conexión y vuelve a intentar.');
  } finally {
    busy.delete(id);
  }
}

function bindActions() {
  els.board.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-a]');
    if (!btn) return;
    const card = btn.closest('.card');
    const id = card?.dataset?.id;
    const act = btn.dataset.a;

    if (act === 'take')    return void doUpdate(id, Status.IN_PROGRESS);
    if (act === 'ready')   return void doUpdate(id, Status.READY);
    if (act === 'deliver') return void doUpdate(id, Status.DELIVERED);
    if (act === 'paid')    return void doUpdate(id, Status.PAID);
    if (act === 'cancel')  return void doUpdate(id, Status.CANCELLED);
  });
}

// ----- Boot -----
let unsubscribe = null;
function start() {
  bindActions();

  if (unsubscribe) { try { unsubscribe(); } catch {} }
  unsubscribe = DB.subscribeKitchenOrders((rows) => {
    // throttle mínimo: un frame
    requestAnimationFrame(() => groupAndRender(rows || []));
  });

  window.addEventListener('beforeunload', () => {
    try { unsubscribe && unsubscribe(); } catch {}
    unsubscribe = null;
  });
}

start();
