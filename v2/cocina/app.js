// cocina/app.js · Seven V2
// Tablero de cocina unificado para Kiosko V2.
// Lee pedidos desde shared/db.js (Firestore o SIM) y pinta columnas:
// Pendientes → En progreso → Listos → Por cobrar → Entregados (archivados).

import { subscribeOrders, updateOrderStatus, BASE_PREFIX } from '../shared/db.js?v=20251108';
import { ensureAuth } from '../shared/firebase.js?v=20251106a';
import { initThemeFromSettings } from '../shared/theme.js?v=20251106a';
import { beep, toast } from '../shared/notify.js?v=20251106a';

console.info('[cocina] BASE_PREFIX =', BASE_PREFIX);

/* ======================= DOM refs (flexibles) ======================= */

function colSel(name, fallbackIndex) {
  return (
    document.querySelector(`[data-col="${name}"]`) ||
    document.getElementById(`col-${name}`) ||
    document.querySelectorAll('.col')[fallbackIndex] ||
    null
  );
}

const cols = {
  pending:  colSel('pending',   0),
  progress: colSel('progress',  1),
  ready:    colSel('ready',     2),
  charge:   colSel('tocash',    3), // Por cobrar
  done:     colSel('delivered', 4)  // Entregados / historial
};

const counts = {
  pending:  document.getElementById('count-pending'),
  progress: document.getElementById('count-progress'),
  ready:    document.getElementById('count-ready'),
  charge:   document.getElementById('count-charge'),
  done:     document.getElementById('count-done')
};

const totalPendEl = document.getElementById('totalPend') || document.querySelector('[data-total-pend]');
const countPendEl = document.getElementById('countPend') || document.querySelector('[data-total-pend-count]');
const modeBadge   = document.getElementById('modeBadge') || document.querySelector('[data-mode-badge]');

function money(n){ return '$' + Number(n || 0).toFixed(0); }

/* ======================= Config limpieza Entregados ======================= */

const MAX_DONE_AGE_MS = 2 * 60 * 60 * 1000; // 2 horas visibles
const MAX_DONE_COUNT  = 30;                 // máximo 30 tarjetas en columna Entregados

/* ======================= Estado ======================= */

const state = {
  orders: [],
  unsub: null
};

/* ======================= Normalización & mapeo ======================= */

function normalizeOrder(raw) {
  const created = raw.createdAt || raw.timestamp || Date.now();
  const updated = raw.updatedAt || created;

  return {
    ...raw,
    id: raw.id || raw.orderId || '',
    customerName: (raw.customerName || raw.name || '').toString(),
    phone: (raw.phone || '').toString(),
    status: (raw.status || 'pending').toLowerCase(),
    total: Number(raw.total || raw.lineTotal || 0),
    items: Array.isArray(raw.items) ? raw.items : [],
    source: raw.source || 'kiosk-v2',
    createdAt: created,
    updatedAt: updated
  };
}

// Estado → columna visual
function pickColumnKey(ord) {
  const s = (ord.status || 'pending').toLowerCase();

  // Nuevos nombres
  if (s === 'pending')                         return 'pending';
  if (s === 'preparing' || s === 'in-progress')return 'progress';
  if (s === 'ready')                           return 'ready';
  if (s === 'delivered')                       return 'charge'; // entregado al cliente, falta cobro
  if (s === 'paid' || s === 'completed')       return 'done';

  // Compatibilidad con estados viejos
  if (s === 'cooking' || s === 'progress')     return 'progress';
  if (s === 'tocash' || s === 'to-charge' ||
      s === 'porcobrar')                       return 'charge';
  if (s === 'done')                            return 'done';

  return 'pending';
}

/* ======================= Render principal ======================= */

function render() {
  // Limpia solo tarjetas .order, conserva encabezados y mensajes .empty
  Object.values(cols).forEach(col => {
    if (!col) return;
    col.querySelectorAll('.order,.k-card').forEach(n => n.remove());
    const empty = col.querySelector('.empty');
    if (empty) empty.style.display = 'block';
  });

  const now = Date.now();
  const counters = { pending:0, progress:0, ready:0, charge:0, done:0 };
  let totalPend = 0;
  let doneOrders = [];

  state.orders.forEach(ord => {
    const key = pickColumnKey(ord);
    const col = cols[key];
    if (!col) return;

    // Tratamiento especial para Entregados (done)
    if (key === 'done') {
      const refTs = ord.updatedAt || ord.createdAt || 0;
      const age = refTs ? (now - refTs) : 0;
      if (age > MAX_DONE_AGE_MS) return; // muy viejo → no se muestra
      doneOrders.push(ord);
      return;
    }

    const card = buildOrderCard(ord);
    col.appendChild(card);

    const empty = col.querySelector('.empty');
    if (empty) empty.style.display = 'none';

    counters[key]++;
    if (key === 'pending' || key === 'progress') {
      totalPend += ord.total || 0;
    }
  });

  // Pintar Entregados (done) respetando límite
  if (cols.done) {
    const col = cols.done;
    const empty = col.querySelector('.empty');

    if (doneOrders.length) {
      // ordena por updatedAt/createdAt y recorta a last MAX_DONE_COUNT
      doneOrders.sort((a,b) =>
        (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0)
      );
      if (doneOrders.length > MAX_DONE_COUNT) {
        doneOrders = doneOrders.slice(doneOrders.length - MAX_DONE_COUNT);
      }

      doneOrders.forEach(ord => {
        const card = buildOrderCard(ord);
        col.appendChild(card);
        counters.done++;
      });

      if (empty) empty.style.display = 'none';
    } else if (empty) {
      empty.style.display = 'block';
    }
  }

  // Contadores de columnas
  Object.entries(counters).forEach(([k,v]) => {
    if (counts[k]) counts[k].textContent = v;
  });

  // Totales en header
  if (totalPendEl) totalPendEl.textContent = money(totalPend);
  if (countPendEl) countPendEl.textContent = `${counters.pending + counters.progress} pedidos`;

  // Badge de modo (SIM vs Firestore)
  if (modeBadge) {
    const anySim = state.orders.some(o => String(o.id).startsWith('SIM-'));
    modeBadge.textContent = `modo: ${anySim ? 'SIM (localStorage)' : 'Firestore'}`;
  }
}

/* ======================= Construcción de tarjetas ======================= */

function buildOrderCard(ord) {
  const card = document.createElement('div');
  card.className = 'order';
  card.dataset.id = ord.id;

  const shortId = (ord.id || '').slice(-4) || '----';
  const name    = ord.customerName || 'sin nombre';
  const phone   = ord.phone ? `📞 ${ord.phone}` : '';
  const src     = ord.source || '';
  const status  = (ord.status || 'pending').toLowerCase();
  const notes   = (ord.notes || '').trim();

  const itemsHtml = buildItemsHtml(ord.items || []);

  card.innerHTML = `
    <div class="order-header">
      <div class="order-id">#${escapeHtml(shortId)}</div>
      <div class="order-name">${escapeHtml(name)}</div>
      ${phone ? `<div class="pill">${escapeHtml(phone)}</div>` : ''}
      <div class="status-tag">${escapeHtml(status)}</div>
    </div>
    <div class="order-meta">
      <span class="pill">${escapeHtml(src)}</span>
      <span class="pill">Creado: ${formatTime(ord.createdAt)}</span>
    </div>
    <ul class="order-items">
      ${itemsHtml}
    </ul>
    ${notes ? `<div class="notes">Notas: ${escapeHtml(notes)}</div>` : ''}
    <div class="total">
      Total <span>${money(ord.total)}</span>
    </div>
    <div class="order-actions">
      ${buildActionsHtml(status)}
    </div>
  `;

  // Bind acciones
  card.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', async ev => {
      ev.stopPropagation();
      const act = btn.dataset.act;
      await handleAction(ord, act);
    });
  });

  return card;
}

// Desglose con ingredientes estandarizados para la cocina
function buildItemsHtml(items) {
  if (!items.length) {
    return '<li>Sin desglose (revisar ticket)</li>';
  }

  return items.map(it => {
    const qty   = it.qty || 1;
    const name  = it.name || it.id || 'item';
    const notes = (it.notes || '').trim();

    let line = `${qty}× ${name}`;
    if (it.type === 'drink') line += ' 🥤';
    if (it.type === 'mini')  line += ' (mini)';
    if (it.type === 'side')  line += ' 🍟';

    // Estandar: ingredientes del kiosko v2
    const ings = Array.isArray(it.ingredients) && it.ingredients.length
      ? it.ingredients
      : (Array.isArray(it.baseIngredients) ? it.baseIngredients : []);

    const extras = it.extras || {};
    const extraBits = [];

    if (extras.seasoning) {
      extraBits.push(`Sazonador: ${extras.seasoning}`);
    }
    if (Array.isArray(extras.sauces) && extras.sauces.length) {
      extraBits.push('Salsas: ' + extras.sauces.join(', '));
    }
    if (Array.isArray(extras.ingredients) && extras.ingredients.length) {
      extraBits.push(
        'Extras: ' +
        extras.ingredients.map(e => e.name || e.id || e).join(', ')
      );
    }
    if (notes) {
      extraBits.push('Nota: ' + notes);
    }

    const ingsHtml = ings.length
      ? `<ul class="ing">${ings.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
      : '';

    const extraHtml = extraBits.length
      ? `<div class="muted">${escapeHtml(extraBits.join(' · '))}</div>`
      : '';

    return `
      <li>
        <div>${escapeHtml(line)}</div>
        ${ingsHtml}
        ${extraHtml}
      </li>
    `;
  }).join('');
}

/* ======================= Acciones / flujo de estados ======================= */

function buildActionsHtml(status) {
  const s = status.toLowerCase();

  // Flujo nuevo:
  // pending   -> [Tomar]      -> preparing
  // preparing -> [Listo]      -> ready
  // ready     -> [Entregado]  -> delivered (Por cobrar)
  // delivered -> [Cobrar]     -> paid (Entregados)
  if (s === 'pending') {
    return `<button class="btn btn-primary" data-act="take">Tomar</button>`;
  }
  if (s === 'preparing' || s === 'in-progress' || s === 'cooking' || s === 'progress') {
    return `<button class="btn btn-ok" data-act="ready">Listo</button>`;
  }
  if (s === 'ready') {
    return `<button class="btn btn-primary" data-act="delivered">Entregado</button>`;
  }
  if (s === 'delivered' || s === 'tocash' || s === 'to-charge' || s === 'porcobrar') {
    return `<button class="btn btn-ok" data-act="paid">Cobrar</button>`;
  }
  if (s === 'paid' || s === 'completed' || s === 'done') {
    return `<span class="pill">Archivado</span>`;
  }
  // fallback
  return `<button class="btn small" data-act="take">Tomar</button>`;
}

async function handleAction(ord, act) {
  try {
    if (act === 'take') {
      await updateOrderStatus(ord.id, 'preparing');
      beep();
      return;
    }
    if (act === 'ready') {
      await updateOrderStatus(ord.id, 'ready');
      beep();
      return;
    }
    if (act === 'delivered') {
      // Entregado al cliente, pero falta pago → Por cobrar
      await updateOrderStatus(ord.id, 'delivered');
      beep();
      return;
    }
    if (act === 'paid') {
      await updateOrderStatus(ord.id, 'paid');
      beep();
      toast('Pedido cobrado y archivado');
      return;
    }
  } catch (err) {
    console.error('[cocina] update status error', err);
    toast('No se pudo actualizar el pedido');
  }
}

/* ======================= Helpers ======================= */

function escapeHtml(s='') {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function formatTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--:--';
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${hh}:${mm}`;
}

/* ======================= Init ======================= */

async function init() {
  try {
    await ensureAuth();
  } catch (e) {
    console.warn('[cocina] ensureAuth fallo (modo sim/local)', e);
  }

  // Tema (no rompe si no hay Firestore)
  initThemeFromSettings({ defaultName: 'Base' });

  state.unsub = await subscribeOrders(list => {
    state.orders = (list || []).map(normalizeOrder);
    render();
  });

  window.addEventListener('beforeunload', () => {
    try { state.unsub && state.unsub(); } catch {}
  });

  console.info('[cocina] listo');
}

init();
