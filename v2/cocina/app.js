// Cocina — Seven de Burgers V2
// Panel de cocina para pedidos del kiosko v2

import { beep, toast } from '../shared/notify.js?v=20251106a';
import * as DB from '../shared/db.js?v=20251106a';
import { ensureAuth } from '../shared/firebase.js?v=20251106a';
import { initThemeFromSettings } from '../shared/theme.js?v=20251106a';

/* ======================= Estado ======================= */

const state = {
  orders: [],
  unsub: null,
  attached: false
};

/* ======================= DOM ======================= */

const colPend       = document.getElementById('colPend');
const colProg       = document.getElementById('colProg');
const colListos     = document.getElementById('colListos');
const colCobrar     = document.getElementById('colCobrar');
const colEntregados = document.getElementById('colEntregados');

const totalCobrarEl =
  document.getElementById('totalCobrar') ||
  document.querySelector('[data-total-cobrar]') ||
  document.getElementById('totalGlobal');

function showInlineError(msg) {
  let box = document.getElementById('__kitchenError');
  if (!box) {
    box = document.createElement('div');
    box.id = '__kitchenError';
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;right:8px;z-index:99;background:#2b1113;color:#ffd7d7;border:1px solid #ff6b6b;padding:6px 10px;border-radius:8px;font-size:11px;font-family:system-ui;';
    document.body.appendChild(box);
  }
  box.textContent = msg;
}

/* ======================= Helpers ======================= */

function money(n) {
  const x = Number(n);
  return '$' + (Number.isFinite(x) ? x.toFixed(0) : '0');
}

function s(x) {
  return (x == null ? '' : String(x)).trim();
}

function getTotal(order = {}) {
  if (Number.isFinite(order.total)) return Number(order.total);
  if (order.totals && Number.isFinite(order.totals.total))
    return Number(order.totals.total);
  if (Number.isFinite(order.amount)) return Number(order.amount);
  if (Number.isFinite(order.totalCents)) return Number(order.totalCents) / 100;
  return 0;
}

function isPaid(order = {}) {
  if (order.paid === true) return true;
  if (order.paidAt) return true;
  const p = order.payment || {};
  const st = String(p.status || p.state || '').toLowerCase();
  return st === 'paid' || st === 'approved' || st === 'success';
}

/**
 * Normaliza el status de cualquier versión → bucket de columna
 *
 * 0 / pending / pendiente / new         → PEND
 * 1 / in_progress / preparando / ...    → PROG
 * 2 / ready / listo                     → LISTOS
 * 3 / delivered / entregado             → DELIVERED (luego se separa por pago)
 * por_cobrar / to_charge                → COBRAR
 */
function bucketFor(order = {}) {
  const raw = order.status;

  // numérico
  if (typeof raw === 'number') {
    if (raw === 0) return 'pend';
    if (raw === 1) return 'prog';
    if (raw === 2) return 'listos';
    if (raw === 3) return isPaid(order) ? 'entregados' : 'cobrar';
  }

  // texto
  const t = String(raw || '').toLowerCase();

  if (!t || t === 'new' || t === 'created' || t === 'pending' || t === 'pendiente')
    return 'pend';

  if (
    t === 'in_progress' || t === 'progress' ||
    t === 'preparando' || t === 'en_progreso' || t === 'en progreso'
  ) return 'prog';

  if (
    t === 'ready' || t === 'listo' || t === 'listos' ||
    t === 'done' || t === 'terminado'
  ) return 'listos';

  if (t === 'por_cobrar' || t === 'por cobrar' || t === 'to_charge')
    return isPaid(order) ? 'entregados' : 'cobrar';

  if (t === 'delivered' || t === 'entregado' || t === 'entregada')
    return isPaid(order) ? 'entregados' : 'cobrar';

  if (t === 'cancelled' || t === 'canceled' || t === 'anulado')
    return null;

  // Desconocido: no lo mostramos para no ensuciar
  return null;
}

function shortId(id = '') {
  const sId = String(id);
  if (!sId) return '';
  return sId.length <= 6 ? sId : sId.slice(-6).toUpperCase();
}

function itemsSummary(order = {}) {
  const src = Array.isArray(order.items) ? order.items
            : Array.isArray(order.cart) ? order.cart
            : [];
  const out = [];
  for (const l of src) {
    if (!l) continue;
    const qty = l.qty || 1;
    const nm = s(l.name || l.id || 'Item');
    out.push(`${qty}× ${nm}`);
  }
  return out.join(' · ');
}

/* ======================= Render ======================= */

function clearColumns() {
  [colPend, colProg, colListos, colCobrar, colEntregados].forEach(c => {
    if (c) c.innerHTML = '';
  });
}

function bucketLabel(bucket, order) {
  switch (bucket) {
    case 'pend':       return 'Pendiente';
    case 'prog':       return 'En progreso';
    case 'listos':     return 'Listo para entregar';
    case 'cobrar':     return 'Entregado · Por cobrar';
    case 'entregados': return isPaid(order) ? 'Entregado · Pagado' : 'Entregado';
    default:           return s(order.status || '');
  }
}

function addAction(btnWrap, label, ghost, handler) {
  const b = document.createElement('button');
  b.className = 'btn small' + (ghost ? ' ghost' : '');
  b.textContent = label;
  b.onclick = async (ev) => {
    ev.stopPropagation();
    try {
      await handler();
      beep();
    } catch (e) {
      console.error('[cocina] action error', e);
      toast('No pude actualizar el pedido');
    }
  };
  btnWrap.appendChild(b);
}

function buildCard(order) {
  const bucket = bucketFor(order);
  const total  = getTotal(order);

  const card = document.createElement('div');
  card.className = 'k-card';

  // Head
  const head = document.createElement('div');
  head.className = 'k-head';

  const name =
    s(order.customerName || order.name || order.clientName) || 'Sin nombre';
  const code =
    s(order.shortCode || order.pickupCode || order.trackCode);

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = code ? `${name} · #${code}` : name;

  const meta = document.createElement('div');
  meta.className = 'muted small';
  meta.textContent = `ID ${shortId(order.id)}`;

  head.appendChild(title);
  head.appendChild(meta);
  card.appendChild(head);

  // Items
  const sum = itemsSummary(order);
  if (sum) {
    const it = document.createElement('div');
    it.className = 'small';
    it.textContent = sum;
    card.appendChild(it);
  }

  // Total
  const p = document.createElement('div');
  p.className = 'price';
  p.textContent = money(total);
  card.appendChild(p);

  // Badges
  const badges = document.createElement('div');
  badges.className = 'k-badges';

  const bStatus = document.createElement('div');
  bStatus.className = 'k-badge';
  bStatus.textContent = bucketLabel(bucket, order);
  badges.appendChild(bStatus);

  if (isPaid(order)) {
    const bPaid = document.createElement('div');
    bPaid.className = 'k-badge ok';
    bPaid.textContent = 'Pagado';
    badges.appendChild(bPaid);
  }

  card.appendChild(badges);

  // Actions
  const act = document.createElement('div');
  act.className = 'k-actions';

  const id = order.id;

  if (id) {
    if (bucket === 'pend') {
      addAction(act, 'Iniciar', false, () => setStatus(id, 'IN_PROGRESS'));
    }
    if (bucket === 'prog') {
      addAction(act, 'Listo', false, () => setStatus(id, 'READY'));
    }
    if (bucket === 'listos') {
      addAction(act, 'Entregar', false, () => setStatus(id, 'DELIVERED'));
      addAction(act, 'Cancelar', true, () => setStatus(id, 'CANCELLED'));
    }
    if (bucket === 'cobrar' && !isPaid(order)) {
      addAction(act, 'Marcar pagado', false, () => markPaid(id));
    }
    if (bucket === 'entregados') {
      addAction(act, 'Archivar', true, () => archiveOrder(id));
    }
  }

  if (act.children.length) card.appendChild(act);

  return card;
}

function renderAll() {
  clearColumns();

  let totalCobrar = 0;

  for (const o of state.orders) {
    const bucket = bucketFor(o);
    if (!bucket) continue;

    const card = buildCard(o);

    if (bucket === 'pend' && colPend) colPend.appendChild(card);
    else if (bucket === 'prog' && colProg) colProg.appendChild(card);
    else if (bucket === 'listos' && colListos) colListos.appendChild(card);
    else if (bucket === 'cobrar' && colCobrar) {
      colCobrar.appendChild(card);
      totalCobrar += getTotal(o);
    } else if (bucket === 'entregados' && colEntregados) {
      colEntregados.appendChild(card);
    }
  }

  if (totalCobrarEl) totalCobrarEl.textContent = money(totalCobrar);
}

/* ======================= Acciones DB ======================= */

async function setStatus(id, status) {
  if (!id || !status || !DB.updateOrder) return;
  await DB.updateOrder(id, { status });
}

async function markPaid(id) {
  if (!id || !DB.updateOrder) return;
  await DB.updateOrder(id, {
    paid: true,
    paidAt: new Date().toISOString()
  });
}

async function archiveOrder(id) {
  if (!id || !DB.updateOrder) return;
  await DB.updateOrder(id, {
    archived: true,
    active: false
  });
}

/* ======================= Suscripción ======================= */

function attachSubscription() {
  if (state.attached) return;
  state.attached = true;

  const handler = (list) => {
    state.orders = Array.isArray(list) ? list.slice() : [];
    // ordena por fecha si hay
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
  };

  try {
    if (typeof DB.subscribeKitchenOrdersV2 === 'function') {
      state.unsub = DB.subscribeKitchenOrdersV2(handler);
      return;
    }
    if (typeof DB.subscribeKitchenOrders === 'function') {
      state.unsub = DB.subscribeKitchenOrders(handler);
      return;
    }
    if (typeof DB.subscribeOrdersV2 === 'function') {
      state.unsub = DB.subscribeOrdersV2(handler, { kitchen: true });
      return;
    }
    if (typeof DB.subscribeOrders === 'function') {
      state.unsub = DB.subscribeOrders(handler, { kitchen: true });
      return;
    }

    showInlineError('No encuentro función de suscripción en db.js (subscribeKitchenOrders/subscribeOrders). Revisa shared/db.js cuando puedas.');
  } catch (e) {
    console.error('[cocina] error attachSubscription', e);
    showInlineError('Error conectando con pedidos. Revisa shared/db.js o la versión de app.js cuando tengas inspector.');
  }
}

/* ======================= Init ======================= */

async function init() {
  try {
    await ensureAuth();
  } catch (e) {
    console.warn('[cocina] auth anónima falló, seguimos de todos modos', e);
  }

  try {
    initThemeFromSettings?.({ defaultName: 'Base' });
  } catch (e) {
    console.warn('[cocina] theme init error', e);
  }

  attachSubscription();
}

init();

window.addEventListener('beforeunload', () => {
  try { state.unsub && state.unsub(); } catch {}
});
