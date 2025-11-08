// Cocina — Seven de Burgers V2
// Vista de cocina para pedidos del kiosko v2
// Compatible con shared/db.js (subscribeKitchenOrders / updateOrder)

/* ======================= Imports ======================= */
import { beep, toast } from '../shared/notify.js?v=20251106a';
import * as DB from '../shared/db.js?v=20251106a';
import { ensureAuth } from '../shared/firebase.js?v=20251106a';
import { initThemeFromSettings } from '../shared/theme.js?v=20251106a';

/* ======================= Estado ======================= */
const state = {
  orders: [],
  unsub: null,
  lastErrorAt: 0
};

/* ======================= DOM refs ======================= */
const colPend       = document.getElementById('colPend');
const colProg       = document.getElementById('colProg');
const colListos     = document.getElementById('colListos');
const colCobrar     = document.getElementById('colCobrar');
const colEntregados = document.getElementById('colEntregados');

const totalCobrarEl =
  document.getElementById('totalCobrar') ||
  document.querySelector('[data-total-cobrar]') ||
  document.getElementById('totalGlobal');

/* ======================= Helpers ======================= */

function money(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return '$' + v.toFixed(0);
}

function safeStr(x) {
  return (x == null ? '' : String(x)).trim();
}

function getTotalFromOrder(o = {}) {
  if (Number.isFinite(o.total)) return Number(o.total);
  if (o.totals && Number.isFinite(o.totals.total))
    return Number(o.totals.total);
  if (Number.isFinite(o.amount)) return Number(o.amount);
  if (Number.isFinite(o.totalCents)) return Number(o.totalCents) / 100;
  return 0;
}

function isPaid(o = {}) {
  if (o.paid === true) return true;
  if (o.paidAt) return true;
  if (o.payment && typeof o.payment === 'object') {
    const ps = String(o.payment.status || '').toLowerCase();
    if (ps === 'paid' || ps === 'approved' || ps === 'success') return true;
  }
  return false;
}

/**
 * Bucket visual según status + pago:
 *
 * - PENDING       → Pendientes
 * - IN_PROGRESS   → En progreso
 * - READY         → Listos
 * - DELIVERED
 *      - !paid    → Por cobrar
 *      - paid     → Entregados
 */
function bucketFor(order) {
  const st = String(order.status || '').toUpperCase();

  if (st === 'PENDING') return 'pend';
  if (st === 'IN_PROGRESS') return 'prog';
  if (st === 'READY') return 'listos';

  if (st === 'DELIVERED') {
    return isPaid(order) ? 'entregados' : 'cobrar';
  }

  // Otros estados quedan ocultos en la vista de cocina
  return null;
}

/* ======================= Render ======================= */

function clearColumns() {
  [colPend, colProg, colListos, colCobrar, colEntregados].forEach(col => {
    if (col) col.innerHTML = '';
  });
}

function buildItemsSummary(order) {
  const lines = [];
  const cart = Array.isArray(order.items || order.cart)
    ? (order.items || order.cart)
    : [];

  for (const l of cart) {
    if (!l) continue;
    const qty = l.qty || 1;
    const name = safeStr(l.name || l.id || 'Item');
    lines.push(`${qty}× ${name}`);
  }

  return lines.join(' · ');
}

function shortId(id = '') {
  const s = String(id);
  if (s.length <= 6) return s;
  return s.slice(-6).toUpperCase();
}

function buildCard(order) {
  const card = document.createElement('div');
  card.className = 'k-card';

  const bucket = bucketFor(order);
  const total = getTotalFromOrder(order);

  const name =
    safeStr(order.customerName || order.name || order.clientName) || 'Sin nombre';
  const code =
    safeStr(order.shortCode || order.pickupCode || order.trackCode || '');

  const itemsSummary = buildItemsSummary(order);

  const created =
    order.createdAt || order.created || order.ts || order.time || null;
  const createdTxt = created
    ? new Date(created.seconds ? created.seconds * 1000 : created).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : '';

  // Header
  const head = document.createElement('div');
  head.className = 'k-head';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = `${name}${code ? ' · #' + code : ''}`;

  const meta = document.createElement('div');
  meta.className = 'muted small';
  meta.textContent = `ID ${shortId(order.id)}${createdTxt ? ' · ' + createdTxt : ''}`;

  head.appendChild(title);
  head.appendChild(meta);
  card.appendChild(head);

  // Items
  if (itemsSummary) {
    const itemsEl = document.createElement('div');
    itemsEl.className = 'small';
    itemsEl.textContent = itemsSummary;
    card.appendChild(itemsEl);
  }

  // Total
  const totalEl = document.createElement('div');
  totalEl.className = 'price';
  totalEl.textContent = money(total);
  card.appendChild(totalEl);

  // Badges
  const badges = document.createElement('div');
  badges.className = 'k-badges';

  const stBadge = document.createElement('div');
  stBadge.className = 'k-badge';
  stBadge.textContent = bucketLabel(bucket, order);
  badges.appendChild(stBadge);

  if (isPaid(order)) {
    const p = document.createElement('div');
    p.className = 'k-badge ok';
    p.textContent = 'Pagado';
    badges.appendChild(p);
  }

  card.appendChild(badges);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'k-actions';

  injectActionsForBucket(actions, bucket, order);

  if (actions.children.length) {
    card.appendChild(actions);
  }

  return card;
}

function bucketLabel(bucket, order) {
  switch (bucket) {
    case 'pend': return 'Pendiente';
    case 'prog': return 'En progreso';
    case 'listos': return 'Listo para entregar';
    case 'cobrar': return 'Entregado · Por cobrar';
    case 'entregados':
      return isPaid(order) ? 'Entregado · Pagado' : 'Entregado';
    default: return safeStr(order.status || '');
  }
}

function injectActionsForBucket(container, bucket, order) {
  const addBtn = (label, variant, handler) => {
    const b = document.createElement('button');
    b.className = 'btn small' + (variant === 'ghost' ? ' ghost' : '');
    b.textContent = label;
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      handler().catch(err => {
        console.error('[cocina] action error', err);
        toast('No pude actualizar el pedido');
      });
    });
    container.appendChild(b);
  };

  const id = order.id;

  if (!id) return;

  if (bucket === 'pend') {
    addBtn('Iniciar', null, () => setStatus(id, 'IN_PROGRESS'));
  }

  if (bucket === 'prog') {
    addBtn('Listo', null, () => setStatus(id, 'READY'));
  }

  if (bucket === 'listos') {
    addBtn('Entregar', null, () => setStatus(id, 'DELIVERED'));
    addBtn('Cancelar', 'ghost', () => setStatus(id, 'CANCELLED'));
  }

  if (bucket === 'cobrar') {
    addBtn('Marcar pagado', null, () => markPaid(id));
  }

  if (bucket === 'entregados') {
    addBtn('Archivar', 'ghost', () => archiveOrder(id));
  }
}

/* ======================= Acciones DB ======================= */

async function setStatus(orderId, status) {
  if (!orderId || !status) return;
  await DB.updateOrder(orderId, { status });
  beep();
}

async function markPaid(orderId) {
  if (!orderId) return;
  await DB.updateOrder(orderId, {
    paid: true,
    paidAt: new Date().toISOString()
  });
  beep();
}

async function archiveOrder(orderId) {
  if (!orderId) return;
  await DB.updateOrder(orderId, {
    active: false,
    archived: true
  });
  beep();
}

/* ======================= Handlers de suscripción ======================= */

function onOrders(list) {
  state.orders = Array.isArray(list) ? list.slice() : [];

  // Ordenar por createdAt asc (o por id como fallback)
  state.orders.sort((a, b) => {
    const ta = (a.createdAt && (a.createdAt.seconds || a.createdAt._seconds))
      ? (a.createdAt.seconds || a.createdAt._seconds)
      : (a.created || 0);
    const tb = (b.createdAt && (b.createdAt.seconds || b.createdAt._seconds))
      ? (b.createdAt.seconds || b.createdAt._seconds)
      : (b.created || 0);
    if (ta && tb && ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  renderAll();
}

function renderAll() {
  clearColumns();

  let totalCobrar = 0;

  for (const o of state.orders) {
    const bucket = bucketFor(o);
    if (!bucket) continue;

    const card = buildCard(o);

    switch (bucket) {
      case 'pend':
        colPend && colPend.appendChild(card);
        break;
      case 'prog':
        colProg && colProg.appendChild(card);
        break;
      case 'listos':
        colListos && colListos.appendChild(card);
        break;
      case 'cobrar':
        colCobrar && colCobrar.appendChild(card);
        totalCobrar += getTotalFromOrder(o);
        break;
      case 'entregados':
        colEntregados && colEntregados.appendChild(card);
        break;
    }
  }

  if (totalCobrarEl) {
    totalCobrarEl.textContent = money(totalCobrar);
  }
}

/* ======================= Init ======================= */

async function init() {
  console.info('[cocina] init…');

  try {
    await ensureAuth();
  } catch (e) {
    console.warn('[cocina] auth anon falló (seguimos igual)', e);
  }

  try {
    initThemeFromSettings?.({ defaultName: 'Base' });
  } catch (e) {
    console.warn('[cocina] theme init error', e);
  }

  try {
    if (typeof DB.subscribeKitchenOrders === 'function') {
      state.unsub = DB.subscribeKitchenOrders(onOrders, { limitN: 300 });
      console.info('[cocina] usando DB.subscribeKitchenOrders');
    } else if (typeof DB.subscribeOrders === 'function') {
      state.unsub = DB.subscribeOrders(onOrders, { limitN: 300 });
      console.info('[cocina] usando DB.subscribeOrders');
    } else {
      throw new Error('No hay subscribeKitchenOrders ni subscribeOrders en db.js');
    }
  } catch (e) {
    console.error('[cocina] error al suscribirse a pedidos', e);
    toast('No se pudo conectar con pedidos');
  }
}

init();

window.addEventListener('beforeunload', () => {
  try { state.unsub && state.unsub(); } catch {}
});
