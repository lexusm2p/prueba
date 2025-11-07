// /cocina/app.js — V2.2.3 Kitchen Pro
// - Cliente + tipo + mesa/teléfono
// - Desglose completo: ingredientes, extras, notas por línea
// - Columna "Por cobrar" sin duplicados + total pendiente
// - Botón WhatsApp opcional para pickups listos
// Requiere /shared/db.js >= V2.8.1

import * as DB from '../shared/db.js';

const Status = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED'
};

const els = {
  lP: document.getElementById('lP'),
  lI: document.getElementById('lI'),
  lR: document.getElementById('lR'),
  lA: document.getElementById('lA'), // Por cobrar
  lD: document.getElementById('lD'),
  cP: document.getElementById('cP'),
  cI: document.getElementById('cI'),
  cR: document.getElementById('cR'),
  cA: document.getElementById('cA'),
  cD: document.getElementById('cD'),
  tA: document.getElementById('tA')  // Total Por cobrar
};

function money(n) {
  return '$' + Number(n || 0).toFixed(0);
}
function key(o) {
  return String(o.id);
}
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[m]));
}
function maskPhone(p = '') {
  const d = String(p || '').replace(/\D+/g, '');
  if (!d) return '';
  if (d.startsWith('52') && d.length >= 12) {
    const core = d.slice(2);
    if (core.length >= 10) {
      return '+52 ' + core.slice(0, 2) + '** **** ' + core.slice(-2);
    }
  }
  if (d.length >= 10) return d.slice(0, 2) + '** **** ' + d.slice(-2);
  if (d.length >= 7) return d.slice(0, 1) + '** *** ' + d.slice(-1);
  return d;
}
function payMode(o) {
  const t = String(o.orderType || '').toLowerCase();
  if (t === 'dinein') return 'end';      // paga al final (mesa)
  if (t === 'pickup') return 'counter';  // paga contra entrega (barra)
  return 'none';
}
function goesToAR(o) {
  if (!o || o.status === Status.PAID || o.status === Status.CANCELLED) return false;
  const mode = payMode(o);
  if (mode === 'end') {
    // Mesa: pasa a "Por cobrar" cuando ya se marcó entregado
    return o.status === Status.DELIVERED;
  }
  if (mode === 'counter') {
    // Pickup: se puede cobrar cuando está listo o entregado
    return o.status === Status.READY || o.status === Status.DELIVERED;
  }
  return false;
}

/* ---- Track URL (para WhatsApp) ---- */
function buildTrackUrl({ orderId, phone }) {
  try {
    const u = new URL('../kiosk/track.html', location.href);
    if (orderId) u.searchParams.set('oid', orderId);
    if (phone) {
      const norm = String(phone).replace(/\D+/g, '');
      const withCC = norm.startsWith('52') ? norm : ('52' + norm);
      u.searchParams.set('phone', withCC);
    }
    u.searchParams.set('gamify', '1');
    return u.toString();
  } catch {
    return '';
  }
}

/* ---- Items: desglose completo para cocina ---- */
function renderItemDetail(it) {
  if (!it) return '';
  const lines = [];

  const qty = Number(it.qty || 1);
  const name = it.name || it.id || 'Item';

  lines.push(`<b>${escapeHtml(name)}</b> ×${qty}`);

  const inc = Array.isArray(it.ingredients) && it.ingredients.length
    ? it.ingredients
    : (Array.isArray(it.baseIngredients) ? it.baseIngredients : []);

  if (inc.length) {
    lines.push(
      '<ul>' +
      inc.map(s => `<li>${escapeHtml(String(s))}</li>`).join('') +
      '</ul>'
    );
  }

  const extraBits = [];

  if (it.salsaCambiada) {
    extraBits.push('Cambio salsa: ' + escapeHtml(it.salsaCambiada));
  }
  if (it.extras?.dlcCarne) {
    extraBits.push('DLC carne 85g');
  }
  if (Array.isArray(it.extras?.sauces) && it.extras.sauces.length) {
    it.extras.sauces.forEach(s => {
      extraBits.push('Aderezo extra: ' + escapeHtml(s));
    });
  }
  if (Array.isArray(it.extras?.ingredients) && it.extras.ingredients.length) {
    it.extras.ingredients.forEach(s => {
      extraBits.push('Extra: ' + escapeHtml(s));
    });
  }
  if (it.extras?.seasoning) {
    extraBits.push('Sazonador papas: ' + escapeHtml(it.extras.seasoning));
  }

  if (extraBits.length) {
    lines.push(
      `<div class="muted" style="margin-top:2px">${extraBits.join(', ')}</div>`
    );
  }

  if (it.notes) {
    lines.push(
      `<div class="muted" style="margin-top:2px"><i>Notas:</i> ${escapeHtml(it.notes)}</div>`
    );
  }

  return `<div>${lines.join('')}</div>`;
}

/* ---- Card factory ---- */
function cardHTML(o) {
  const name = o.customer || 'Cliente';
  const typeRaw = String(o.orderType || '').toLowerCase();
  const isPickup = typeRaw === 'pickup';
  const isDineIn = typeRaw === 'dinein';

  const mesa = isDineIn ? (o.table || '') : '';
  const phone = isPickup ? (o.phone || '') : '';
  const phoneMasked = phone ? maskPhone(phone) : '';

  const payPref = o.payMethodPref
    ? ` · ${escapeHtml(String(o.payMethodPref))}`
    : '';

  const shortId = o.id && o.id.slice ? o.id.slice(-5) : String(o.id || '—');

  const header = `
    <div class="row">
      <b>#${escapeHtml(shortId)} · ${escapeHtml(name)}</b>
      ${
        isPickup
          ? `<span class="badge">Pickup</span>`
          : `<span class="badge">Mesa${mesa ? ' ' + escapeHtml(mesa) : ''}</span>`
      }
      ${phoneMasked ? `<span class="badge">${phoneMasked}</span>` : ''}
      <span class="price">${money(o.subtotal)}${payPref}</span>
    </div>
  `;

  const itemsHtml = (o.items || [])
    .filter(x => !x.isGift)
    .map(renderItemDetail)
    .join(
      '<hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:6px 0"/>'
    );

  const orderNotes = o.notes
    ? `<div class="muted" style="margin-top:6px"><i>Notas del pedido:</i> ${escapeHtml(
        o.notes
      )}</div>`
    : '';

  const pmode = payMode(o);
  const canNotify =
    isPickup &&
    (o.status === Status.READY || o.status === Status.DELIVERED) &&
    phone;
  const notifyBtn = canNotify
    ? `<button class="btn" data-a="notify" title="Avisar por WhatsApp">Avisar WhatsApp</button>`
    : '';

  let actions = '';

  if (goesToAR(o)) {
    const needsDeliver = pmode === 'counter' && o.status === Status.READY;
    actions = `
      ${needsDeliver ? `<button class="btn" data-a="deliver">Entregar</button>` : ``}
      <button class="btn" data-a="paid">Cobrar ${money(o.subtotal)}</button>
      ${notifyBtn}
      <button class="btn danger" data-a="cancel">Cancelar</button>
    `;
  } else {
    actions =
      o.status === Status.PENDING
        ? `<button class="btn" data-a="take">Tomar</button>`
        : o.status === Status.IN_PROGRESS
        ? `<button class="btn" data-a="ready">Listo</button>`
        : o.status === Status.READY
        ? `
          <button class="btn" data-a="deliver">Entregar</button>
          <button class="btn" data-a="paid">Cobrar ${money(o.subtotal)}</button>
          ${notifyBtn}
          <button class="btn danger" data-a="cancel">Cancelar</button>
        `
        : o.status === Status.DELIVERED
        ? `
          <button class="btn" data-a="paid">Cobrar ${money(o.subtotal)}</button>
          ${notifyBtn}
          <button class="btn danger" data-a="cancel">Cancelar</button>
        `
        : o.status !== Status.CANCELLED
        ? `<button class="btn danger" data-a="cancel">Cancelar</button>`
        : `<span class="badge">Cancelada</span>`;
  }

  return `
    ${header}
    <div style="margin-top:6px">
      ${itemsHtml || '<div class="muted">Sin items</div>'}
    </div>
    ${orderNotes}
    <div class="row" style="margin-top:8px; gap:6px">
      ${actions}
    </div>
  `;
}

/* ---- Fingerprint para diff ---- */
function fingerprintItems(items = []) {
  try {
    return items
      .map(i =>
        [
          i.id,
          i.name,
          i.qty,
          i.salsaCambiada || '',
          i.notes || '',
          i.isGift ? 'G' : '',
          i.extras?.dlcCarne ? 'D1' : '',
          (i.extras?.seasoning || ''),
          (i.extras?.sauces || []).join('|'),
          (i.extras?.ingredients || []).join('|'),
          (i.ingredients || i.baseIngredients || []).join('|')
        ].join('~')
      )
      .join('||');
  } catch {
    return String(items?.length || 0);
  }
}

/* ---- Diff & patch por columna ---- */
function patchColumn(container, rows) {
  if (!container) return;

  const existing = new Map();
  container.querySelectorAll('.card').forEach(el =>
    existing.set(el.dataset.id, el)
  );

  let last = null;
  for (const o of rows) {
    const id = key(o);
    let el = existing.get(id);
    const nextFp =
      `${o.status}|${o.subtotal}|${(o.items?.length || 0)}|` +
      `${o.orderType || ''}|${o.table || ''}|${o.phone || ''}|` +
      `${o.notes || ''}|${fingerprintItems(o.items)}`;

    if (!el) {
      el = document.createElement('div');
      el.className = 'card';
      el.dataset.id = id;
      el.__fp = '';
      if (last) last.after(el);
      else container.prepend(el);
    }

    if (el.__fp !== nextFp) {
      el.innerHTML = cardHTML(o);
      el.__fp = nextFp;
    }

    // asegurar orden
    if (last && el.previousElementSibling !== last) {
      last.after(el);
    }

    existing.delete(id);
    last = el;
  }

  // quitar órdenes que ya no están
  existing.forEach(el => el.remove());

  // actualizar badge de la columna (si existe)
  const badge = container.parentElement?.querySelector('.h .badge');
  if (badge) badge.textContent = String(rows.length);
}

/* ---- Agrupar + Por cobrar ---- */
function groupAndPatch(all) {
  const rows = Array.isArray(all) ? all : [];

  const base = {
    [Status.PENDING]: [],
    [Status.IN_PROGRESS]: [],
    [Status.READY]: [],
    [Status.DELIVERED]: []
  };

  for (const o of rows) {
    if (base[o.status]) base[o.status].push(o);
  }

  const AR = rows.filter(goesToAR);
  const arSet = new Set(AR.map(o => o.id));
  const READY = base[Status.READY].filter(o => !arSet.has(o.id));
  const DELIV = base[Status.DELIVERED].filter(o => !arSet.has(o.id));

  patchColumn(els.lP, base[Status.PENDING]);
  patchColumn(els.lI, base[Status.IN_PROGRESS]);
  patchColumn(els.lR, READY);
  patchColumn(els.lA, AR);
  patchColumn(els.lD, DELIV);

  const totalAR = AR.reduce(
    (acc, o) => acc + Number(o.subtotal || 0),
    0
  );
  if (els.tA) els.tA.textContent = money(totalAR);

  if (els.cP) els.cP.textContent = String(base[Status.PENDING].length);
  if (els.cI) els.cI.textContent = String(base[Status.IN_PROGRESS].length);
  if (els.cR) els.cR.textContent = String(READY.length);
  if (els.cA) els.cA.textContent = String(AR.length);
  if (els.cD) els.cD.textContent = String(DELIV.length);
}

/* ---- Acciones ---- */
function bindActions() {
  const cols = document.getElementById('cols');
  if (!cols) {
    console.warn('[cocina] #cols no encontrado en HTML');
    return;
  }

  cols.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-a]');
    if (!btn) return;
    const card = btn.closest('.card');
    if (!card) return;

    const id = card.dataset.id;
    const act = btn.dataset.a;

    try {
      if (act === 'take')
        await DB.updateOrderStatus(id, Status.IN_PROGRESS);
      else if (act === 'ready')
        await DB.updateOrderStatus(id, Status.READY);
      else if (act === 'deliver')
        await DB.updateOrderStatus(id, Status.DELIVERED);
      else if (act === 'paid')
        await DB.updateOrderStatus(id, Status.PAID);
      else if (act === 'cancel')
        await DB.updateOrderStatus(id, Status.CANCELLED);
      else if (act === 'notify')
        await notifyPickup(id);
    } catch (err) {
      console.warn('[cocina] acción error:', err);
      alert('No se pudo ejecutar la acción. Revisa consola.');
    }
  });
}

/* ---- Aviso por WhatsApp (pickup listo) ---- */
const __ORDERS_MAP = new Map();

async function notifyPickup(orderId) {
  if (typeof DB.sendWhatsAppMessage !== 'function') {
    alert('WhatsApp no disponible en este entorno.');
    return;
  }
  const o = __ORDERS_MAP.get(String(orderId));
  if (!o || !o.phone) {
    alert('Pedido sin teléfono registrado.');
    return;
  }

  const rawPhone = String(o.phone).replace(/\D+/g, '');
  if (!rawPhone) {
    alert('Teléfono inválido.');
    return;
  }

  const withCC = rawPhone.startsWith('52') ? rawPhone : '52' + rawPhone;
  const track = buildTrackUrl({ orderId, phone: withCC });
  const etaTxt = o.etaText ? `ETA: ${o.etaText}\n` : '';
  const shortId =
    orderId && orderId.slice ? orderId.slice(-5) : String(orderId || '');

  const text =
    `¡Hola ${o.customer || ''}! Tu pedido #${shortId} en Seven de Burgers ` +
    `está ${o.status === Status.READY ? 'LISTO' : 'casi listo'}.\n` +
    etaTxt +
    `Total: ${money(o.subtotal)}\n` +
    (track ? `Sigue tu pedido aquí: ${track}` : '');

  try {
    await DB.sendWhatsAppMessage({
      to: withCC,
      text,
      meta: { kind: 'kitchen_notify', orderId }
    });
    alert('Cliente notificado por WhatsApp.');
  } catch (err) {
    console.warn('[cocina] sendWhatsAppMessage error', err);
    alert('No se pudo enviar WhatsApp.');
  }
}

/* ---- Inicio / Subs ---- */
function start() {
  bindActions();

  if (typeof DB.subscribeKitchenOrders !== 'function') {
    console.error(
      '[cocina] subscribeKitchenOrders no está definido en DB. Revisa versión de /shared/db.js'
    );
    return;
  }

  const unsub = DB.subscribeKitchenOrders(rows => {
    try {
      __ORDERS_MAP.clear();
      (rows || []).forEach(o => {
        if (o && o.id != null) {
          __ORDERS_MAP.set(String(o.id), o);
        }
      });
      window.requestAnimationFrame(() =>
        groupAndPatch(rows || [])
      );
    } catch (err) {
      console.warn('[cocina] error al renderizar snapshot', err);
    }
  });

  window.addEventListener('beforeunload', () => {
    try {
      unsub && unsub();
    } catch {}
  });
}

start();
