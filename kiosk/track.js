// /kiosk/track.js
// Track gamificado: huevo -> se abre -> por romperse -> mascota 🍔
// Mantiene: HH, ETA, QR, autostart, feed READY, notificaciones.
// + Coleccionables (máx 7 / cliente; 2 raros)
// + CORRECCIÓN: soporte OID para pedidos de mesa (sin teléfono) + métricas.
// + UX: Enter en teléfono, “Buscando…” amable, copy de desbloqueo incluye DELIVERED.

import * as DB from '../shared/db.js';

const $ = (s, r = document) => r.querySelector(s);

// ----------------- UI refs (existentes + nuevos) -----------------
const hhPill = $('#hhPill');
const hhText = $('#hhText');
const etaEl = $('#eta');

const phoneIn = $('#phone');
const goBtn = $('#go');
const mineEl = $('#mine');
const readyEl = $('#ready');

const ding = $('#ding'); // <audio> para READY

// Gamificación
const playBox = $('#play');
const petEmoji = $('#petEmoji');
const stageText = $('#stageText');
const stCap = $('#stCap');
const payline = $('#payline');
const totalMoney = $('#totalMoney');

// Coleccionables
const colGrid = $('#colGrid');
const colCap = $('#colCap');

// Compartir / volver
const shareLink = $('#shareLink');

// === QR ===
const qrImg = $('#qrImg');
const qrUrl = $('#qrUrl');
const qrUpdate = $('#qrUpdate');
const qrCopy = $('#qrCopy');

// ---- Notificaciones (permiso) ----
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(() => {});
}

/* ===================== Query params ===================== */
const QS = new URLSearchParams(location.search);
let currentOID = (QS.get('oid') || '').trim(); // 👈 seguimiento por ID de pedido
let currentPhone = normPhone(QS.get('phone') || ''); // 👈 o por teléfono
const autoStart = QS.get('autostart') === '1';
const GAMIFY = QS.get('gamify') === '1';

/* ===================== Happy Hour ===================== */
let hhTimer = null;
const HH_REFRESH_GUARD_KEY = 'hhRefreshGuard';

function fmtMMSS(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60), s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function stopHHTimer() {
  if (hhTimer) {
    clearInterval(hhTimer);
    hhTimer = null;
  }
}

function renderHHPill({ enabled, discountPercent }, extraText = '') {
  hhPill?.classList.toggle('hh-on', !!enabled);
  if (!hhText) return;
  hhText.textContent = enabled
    ? `Happy Hour – ${Number(discountPercent || 0)}%${extraText ? ` · ${extraText}` : ''}`
    : 'HH OFF';
}

function tickHH(hh) {
  const end = Number(hh.endsAt || 0);
  const left = end - Date.now();
  if (left <= 0) {
    stopHHTimer();
    const guard = sessionStorage.getItem(HH_REFRESH_GUARD_KEY);
    const token = String(end || '0');
    if (guard !== token) {
      sessionStorage.setItem(HH_REFRESH_GUARD_KEY, token);
      renderHHPill({ enabled: false, discountPercent: hh.discountPercent });
      setTimeout(() => {
        try {
          location.reload();
        } catch {}
      }, 300);
      return;
    }
    renderHHPill({ enabled: false, discountPercent: hh.discountPercent });
    return;
  }
  renderHHPill(hh, fmtMMSS(left));
}

function startHHCountdown(hh) {
  stopHHTimer();
  renderHHPill(hh);
  if (hh.enabled && Number(hh.endsAt)) {
    tickHH(hh);
    hhTimer = setInterval(() => tickHH(hh), 1000);
  }
}

if (typeof DB.subscribeHappyHour === 'function') {
  DB.subscribeHappyHour(hh => {
    const normalized = {
      enabled: !!hh?.enabled,
      discountPercent: Number(hh?.discountPercent || 0),
      endsAt: hh?.endsAt != null ? Number(hh.endsAt) : null
    };
    startHHCountdown(normalized);
  });
}

window.addEventListener('beforeunload', stopHHTimer);

/* ===================== ETA (settings/eta o fallback) ===================== */
let etaSource = 'fallback'; // 'settings' si viene de Firestore
function setETA(text) {
  if (etaEl) etaEl.textContent = text || '7–10 min';
}
setETA('7–10 min');

if (typeof DB.subscribeETA === 'function') {
  DB.subscribeETA(text => {
    if (text == null) return;
    etaSource = 'settings';
    setETA(String(text || '7–10 min'));
  });
}

/* ===================== Helpers ===================== */
function normPhone(s = '') {
  return String(s).replace(/\D+/g, '').slice(0, 15);
}
const ts = (d) => (d?.toMillis?.() ?? new Date(d || 0).getTime());
const money = (n) => '$' + Number(n ?? 0).toFixed(0);
const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, m => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[m]));
const getPhone = (o) => normPhone(o?.phone ?? o?.meta?.phone ?? o?.customer?.phone ?? '');

function fmtSelfUrl({ oid, phone, gamify } = {}) {
  const u = new URL(location.href);
  if (oid) u.searchParams.set('oid', oid);
  else u.searchParams.delete('oid');
  if (phone) u.searchParams.set('phone', phone);
  else u.searchParams.delete('phone');
  if (gamify) u.searchParams.set('gamify', '1');
  else u.searchParams.delete('gamify');
  u.searchParams.set('autostart', '1');
  return u.toString();
}

/* ====== Coleccionables: clave por teléfono O por OID (mesa) ====== */
function idForCollectibles() {
  // Preferimos teléfono; si no hay, usamos OID para clientes de mesa
  return currentPhone || currentOID || '';
}
function lsKeyCollect() {
  return `trackCollectibles:${idForCollectibles()}`;
}
function loadCollectibles() {
  try {
    return JSON.parse(localStorage.getItem(lsKeyCollect()) || '{}') || {};
  } catch {
    return {};
  }
}
function saveCollectibles(data) {
  try {
    localStorage.setItem(lsKeyCollect(), JSON.stringify(data || {}));
  } catch {}
}

/* ===================== Gamificación ===================== */
const STAGES = {
  INIT: {
    emoji: '🥚',
    text: 'Esperando confirmación…'
  },
  RECEIVED: {
    emoji: '🥚',
    text: 'Tu huevo llegó al nido.'
  },
  COOKING: {
    emoji: '🥚🪨',
    text: 'El cascarón empieza a romperse…'
  },
  IN_PROGRESS: {
    emoji: '🐣',
    text: 'Se oye un crack… ¡ya casi!'
  },
  READY: {
    emoji: '🍔🙂',
    text: '¡Nació tu Burger Buddy! Ya puedes recogerlo.'
  },
  DONE: {
    emoji: '🍔😋',
    text: 'Disfruta tu Burger Buddy. ¡Gracias!'
  },
  DELIVERED: {
    emoji: '🍔😋',
    text: 'Disfruta tu Burger Buddy. ¡Gracias!'
  }
};
function stageForStatus(st = '') {
  const s = String(st || '').toUpperCase();
  const stageMap = {
    'READY': STAGES.READY,
    'DONE': STAGES.DONE,
    'PAID': STAGES.DONE,
    'DELIVERED': STAGES.DONE,
    'COOKING': STAGES.COOKING,
    'PREPARING': STAGES.COOKING,
    'IN_PROGRESS': STAGES.IN_PROGRESS,
    'TAKEN': STAGES.IN_PROGRESS,
    'RECEIVED': STAGES.RECEIVED,
    'PENDING': STAGES.RECEIVED,
  };
  return stageMap[s] || STAGES.INIT;
}

/* ===================== Coleccionables ===================== */
const COL_CAP = {
  limit: 7,
  rares: 2
};
const COMMON_POOL = [{
  id: 'c1',
  emoji: '🍟',
  name: 'Papas Pro'
}, {
  id: 'c2',
  emoji: '🥤',
  name: 'Refresco Retro'
}, {
  id: 'c3',
  emoji: '🧀',
  name: 'Cheddar Crew'
}, {
  id: 'c4',
  emoji: '🌶️',
  name: 'Spicy Squad'
}, {
  id: 'c5',
  emoji: '🥓',
  name: 'Bacon Band'
}];
const RARE_POOL = [{
  id: 'r1',
  emoji: '👑🍔',
  name: 'Burger Kingpin',
  rare: true
}, {
  id: 'r2',
  emoji: '🛸🍔',
  name: 'UFO Patty',
  rare: true
}];

function pickReward(current) {
  const have = new Set(current.map(x => x.id));
  const leftCommon = COMMON_POOL.filter(x => !have.has(x.id));
  const haveRares = current.filter(x => x.rare).length;
  const leftRare = RARE_POOL.filter(x => !have.has(x.id));
  const tryRare = (haveRares < COL_CAP.rares) && (current.length >= 3) && leftRare.length > 0 && Math.random() < 0.10;
  const pool = tryRare ? leftRare : (leftCommon.length ? leftCommon : leftRare);
  if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderCollection() {
  if (!colGrid || !colCap) return;
  const store = loadCollectibles();
  const col = Array.isArray(store.collection) ? store.collection : [];
  colGrid.innerHTML = col.map(c => `
    <div class="card-mini" title="${c.name}">
      <div>${c.emoji}</div>
      ${c.rare ? '<div class="ribbon">Raro</div>' : ''}
    </div>
  `).join('');
  const left = Math.max(0, COL_CAP.limit - col.length);
  colCap.textContent = left > 0
    ? `Te faltan ${left} para completar tu colección (máx. ${COL_CAP.limit}).`
    : `Colección completa. ¡Bien!`;
}

function flashNewReward(reward) {
  if (!colGrid) return;
  const card = document.createElement('div');
  card.className = 'card-mini';
  card.style.outline = '2px solid rgba(47,227,139,.35)';
  card.style.transform = 'scale(0.9)';
  card.style.transition = 'transform .25s ease, outline .4s ease';
  card.innerHTML = `<div>${reward.emoji}</div><div class="ribbon">${reward.rare ? 'Raro 👑' : 'Nuevo'}</div>`;
  colGrid.prepend(card);
  setTimeout(() => {
    card.style.transform = 'scale(1)';
    card.style.outline = '1px solid var(--border)';
  }, 60);
}

function awardIfEligible(order) {
  if (!GAMIFY) return;
  if (!order) return;

  const status = String(order.status || '').toUpperCase();
  if (!(status === 'READY' || status === 'DONE' || status === 'PAID' || status === 'DELIVERED')) return;

  const orderId = order.id || order.orderId || '';
  const store = loadCollectibles();
  const awarded = new Set(store.awardedOrderIds || []);
  const col = Array.isArray(store.collection) ? store.collection : [];

  if (awarded.has(orderId)) return;
  if (col.length >= COL_CAP.limit) return;

  const reward = pickReward(col);
  if (!reward) return;

  col.push(reward);
  awarded.add(orderId);
  saveCollectibles({
    collection: col,
    awardedOrderIds: [...awarded]
  });

  renderCollection();
  flashNewReward(reward);
}

/* ===================== Métricas preparación (local + opcional DB) ===================== */
function metricKey(id) {
  return `prepMetric:${id}`;
}
function seedCreatedAt(oid) {
  if (!oid) return;
  try {
    const k = metricKey(oid);
    if (!localStorage.getItem(k)) {
      localStorage.setItem(k, JSON.stringify({
        createdAt: Date.now(),
        readyAt: null
      }));
    }
  } catch {}
}
function sealReadyMetric(oid) {
  if (!oid) return;
  try {
    const k = metricKey(oid);
    const raw = localStorage.getItem(k);
    if (!raw) return;
    const m = JSON.parse(raw);
    if (!m.readyAt) {
      m.readyAt = Date.now();
      localStorage.setItem(k, JSON.stringify(m));
      if (typeof DB.logPrepMetric === 'function') {
        DB.logPrepMetric({
          orderId: oid,
          createdAtLocal: m.createdAt || null,
          readyAtLocal: m.readyAt,
          source: 'track'
        }).catch(() => {});
      }
    }
  } catch {}
}

/* ===================== Render: Mi pedido (gamificado) ===================== */
let lastMineId = null;
let lastMineStatus = null;

const STATUS_TEXT = {
  PENDING: {
    tag: '📥 Pedido recibido',
    sub: 'Esperando confirmación en cocina'
  },
  RECEIVED: {
    tag: '📥 Pedido recibido',
    sub: 'Esperando confirmación en cocina'
  },
  IN_PROGRESS: {
    tag: '🔥 En preparación',
    sub: 'Estamos cocinando tu pedido'
  },
  COOKING: {
    tag: '🔥 En preparación',
    sub: 'Estamos cocinando tu pedido'
  },
  READY: {
    tag: '🛎️ Listo para entregar',
    sub: 'Pásalo a recoger o espera en tu mesa'
  },
  DELIVERED: {
    tag: '✔️ Entregado',
    sub: 'En proceso de cobro'
  },
  PAID: {
    tag: '💚 Pagado',
    sub: '¡Gracias!'
  },
  DONE: {
    tag: '💚 Pagado',
    sub: '¡Gracias!'
  }
};

function renderMine(order) {
  if (!mineEl) return;

  if (!order) {
    mineEl.classList.remove('ok');
    mineEl.innerHTML = '<div class="muted">Escribe tu teléfono y pulsa “Ver estado”.</div>';
    if (playBox) playBox.style.display = 'none';
    lastMineId = null;
    lastMineStatus = null;
    return;
  }

  let st = String(order.status || 'PENDING').toUpperCase();
  if (order.paid) st = 'PAID';

  // sonido + notificación al pasar a READY
  if (order.id === lastMineId && lastMineStatus !== 'READY' && st === 'READY') {
    try {
      ding?.play?.();
    } catch {}
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Tu pedido está listo 🛎️', {
          body: `${order.customer || '—'} · Total ${money(order.subtotal || 0)}`
        });
      } catch {}
    }
  }

  const label = STATUS_TEXT[st] || STATUS_TEXT.PENDING;
  const items = order.items || [];
  const count = items.reduce((n, i) => n + (i.qty || 1), 0);
  const names = items.map(i => i.name).slice(0, 2).map(escapeHtml).join(', ');
  const subtotal = Number(order.subtotal || 0);

  // Encabezado (mesa o pickup)
  const headerRight = order.orderType === 'dinein'
    ? `Mesa ${escapeHtml(order.table || '—')}`
    : `Pickup ${escapeHtml(order.phone || '')}`;

  mineEl.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between">
      <div style="min-width:0">
        <div><b>${escapeHtml(order.customer || '—')}</b> · ${count} it.</div>
        <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${names}</div>
      </div>
      <span class="tag">${label.tag}</span>
    </div>
    <div class="muted" style="margin-top:4px">${label.sub} · ${headerRight}</div>
  `;

  if (GAMIFY && playBox) playBox.style.display = 'grid';
  const stInfo = stageForStatus(st);
  if (petEmoji) petEmoji.textContent = stInfo.emoji;
  if (stageText) stageText.textContent = stInfo.text;

  if (subtotal > 0) {
    if (payline) payline.style.display = 'flex';
    if (totalMoney) totalMoney.textContent = money(subtotal);
  } else {
    if (payline) payline.style.display = 'none';
  }
  if (stCap) {
    stCap.textContent =
      (st === 'READY' || st === 'DONE' || st === 'PAID' || st === 'DELIVERED')
        ? '¡Felicidades! Se desbloquea un coleccionable.'
        : 'Tu mascota evoluciona conforme avanza tu pedido.';
  }

  // Métrica: sellar READY en la primera vez
  if (st === 'READY' || st === 'DONE' || st === 'PAID' || st === 'DELIVERED') {
    sealReadyMetric(order.id || currentOID);
  }

  // Premio si aplica
  awardIfEligible(order);

  lastMineId = order.id;
  lastMineStatus = st;
}

/* ===================== Render: Listos ===================== */
function renderReady(list) {
  if (!readyEl) return;
  const rows = (list || [])
    .filter(o => String(o.status || '').toUpperCase() === 'READY')
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt))
    .slice(0, 8)
    .map(o => {
      const items = o.items || [];
      const count = items.reduce((n, i) => n + (i.qty || 1), 0);
      const names = items.map(i => i.name).slice(0, 2).map(escapeHtml).join(', ');
      return `<li>
        <div style="flex:1;min-width:0">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${escapeHtml(o.customer || '—')}</b> · ${count} it.</div>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(names)}</div>
        </div>
        <div>🛎️</div>
      </li>`;
    }).join('');
  readyEl.innerHTML = rows || '<li><div class="muted">—</div></li>';
}

/* ===================== ETA fallback ===================== */
function tsToMs(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t && t.seconds != null) return (t.seconds * 1000) + Math.floor((t.nanoseconds || 0) / 1e6);
  const d = new Date(t);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}
function isToday(ms) {
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function computeEtaFallback(orders) {
  const base = {
    min: 7,
    max: 10
  };
  const samples = [];
  for (const o of (orders || [])) {
    const created = tsToMs(o.createdAt);
    const ready = tsToMs(o.readyAt || o.doneAt || (o.timestamps?.readyAt) || (o.timestamps?.doneAt));
    if (!created || !ready) continue;
    if (!isToday(ready)) continue;
    const s = String(o.status || '').toUpperCase();
    if (s !== 'READY' && s !== 'DONE' && s !== 'PAID' && s !== 'DELIVERED') continue;
    const mins = (ready - created) / 60000;
    if (mins > 0 && mins < 120) samples.push(mins);
  }
  if (samples.length >= 3) {
    samples.sort((a, b) => a - b);
    const cut = Math.max(1, Math.floor(samples.length * 0.1));
    const trimmed = samples.slice(cut, samples.length - cut);
    const avg = trimmed.reduce((a, n) => a + n, 0) / trimmed.length;
    const lo = Math.max(5, Math.round(avg - 2));
    const hi = Math.min(25, Math.round(avg + 2));
    return `${lo}–${hi} min`;
  }
  const q = (orders || []).filter(o => {
    const s = String(o.status || '').toUpperCase();
    return s === 'PENDING' || s === 'RECEIVED' || s === 'PREPARING' || s === 'TAKEN' || s === 'IN_PROGRESS' || s === 'COOKING';
  }).length;
  if (q > 0) {
    const bump = Math.min(12, Math.ceil(q * 1.5));
    const lo = base.min + Math.floor(bump / 2);
    const hi = base.max + bump;
    return `${lo}–${hi} min`;
  }
  return `${base.min}–${base.max} min`;
}

/* ===================== Estado vivo (por OID o por teléfono) + Feed ===================== */
let unsubOrders = null;
const subOrders = (DB.subscribeActiveOrders || DB.subscribeOrders || DB.onOrdersSnapshot || null);

// UX: mostrar “Buscando…” tras un pequeño delay si no hay coincidencias
let searchingTimer = null;
function startSearchingTimer() {
  if (searchingTimer) clearTimeout(searchingTimer);
  searchingTimer = setTimeout(() => {
    if (mineEl) {
      mineEl.classList.remove('ok');
      mineEl.innerHTML = '<div class="muted">Buscando… Si no ves tu pedido, verifica el número o pide al staff que lo asocie.</div>';
      if (playBox) playBox.style.display = 'none';
    }
  }, 800);
}

function ensureOrdersSub() {
  if (unsubOrders) return;
  if (typeof subOrders === 'function') {
    unsubOrders = subOrders((list = []) => {
      renderReady(list);
      if (etaSource !== 'settings') {
        setETA(computeEtaFallback(list));
      }
      
      let mine = null;
      if (currentPhone) {
        mine = list
          .filter(o => normPhone(getPhone(o)) === currentPhone)
          .sort((a, b) => ts(b.createdAt) - ts(a.createdAt))[0];
      } else if (currentOID) {
        mine = list.find(o => (o.id || '') === currentOID);
      }

      if (mine) {
        if (searchingTimer) {
          clearTimeout(searchingTimer);
          searchingTimer = null;
        }
        seedCreatedAt(mine.id || currentOID);
        renderMine(mine);
      } else {
        if (!searchingTimer) startSearchingTimer();
      }
    });
  }
}

// Suscripción puntual por OID si existe API directa
let unsubMineByOid = null;
function subscribeMineByOid(oid) {
  if (!oid) return;
  if (unsubMineByOid) {
    try {
      unsubMineByOid();
    } catch {}
    unsubMineByOid = null;
  }
  seedCreatedAt(oid);
  if (typeof DB.subscribeOrder === 'function') {
    unsubMineByOid = DB.subscribeOrder(oid, (o) => {
      if (o) {
        renderMine(o);
        if (searchingTimer) {
          clearTimeout(searchingTimer);
          searchingTimer = null;
        }
      }
    });
  } else {
    // si no hay API, nos apoyamos en la global
    ensureOrdersSub();
  }
}

/* ===================== QR ===================== */
function updateQrWith(url) {
  if (!url) return;
  const size = 160;
  const api = 'https://api.qrserver.com/v1/create-qr-code/';
  const src = `${api}?size=${size}x${size}&qzone=2&data=${encodeURIComponent(url)}`;
  if (qrImg) qrImg.src = src;
  if (qrUrl) qrUrl.value = url;
}
function setDefaultQrUrl() {
  const url = fmtSelfUrl({
    oid: currentOID || null,
    phone: currentPhone || null,
    gamify: GAMIFY
  });
  updateQrWith(url);
}
qrUpdate?.addEventListener('click', () => {
  const raw = (qrUrl?.value || '').trim();
  if (raw) updateQrWith(raw);
});
qrCopy?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(qrUrl.value);
    qrCopy.textContent = '¡Copiado!';
    setTimeout(() => qrCopy.textContent = 'Copiar enlace', 1200);
  } catch {
    alert('No pude copiar. Selecciona el texto y copia manualmente.');
  }
});

// Compartir
shareLink?.addEventListener('click', async (e) => {
  e.preventDefault();
  const url = qrUrl?.value || fmtSelfUrl({
    oid: currentOID || null,
    phone: currentPhone || null,
    gamify: GAMIFY
  });
  try {
    if (navigator.share) await navigator.share({
      title: 'Seguimiento Seven de Burgers',
      url
    });
    else {
      await navigator.clipboard.writeText(url);
      alert('Enlace copiado');
    }
  } catch {}
});

/* ===================== Entrada manual por teléfono ===================== */
function triggerSearchByPhone() {
  const p = normPhone(phoneIn?.value || '');
  if (p.length < 10) {
    alert('Ingresa un teléfono de 10 dígitos.');
    return;
  }
  currentPhone = p;
  currentOID = ''; // si el usuario busca por teléfono, dejamos de anclar a OID
  renderCollection();
  renderMine(null);
  setDefaultQrUrl();
  ensureOrdersSub();
}

goBtn?.addEventListener('click', triggerSearchByPhone);

phoneIn?.addEventListener('input', () => {
  const pos = phoneIn.selectionStart ?? phoneIn.value.length;
  phoneIn.value = normPhone(phoneIn.value);
  try {
    phoneIn.setSelectionRange(pos, pos);
  } catch {}
});
// UX: Enter = click “Ver estado”
phoneIn?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    triggerSearchByPhone();
  }
});

/* ===================== BOOT ===================== */
(function boot() {
  // Prefill teléfono si viene por query
  if (currentPhone && phoneIn) phoneIn.value = currentPhone;

  // Colección inicial (según phone u oid)
  renderCollection();

  // QR acorde al contexto
  setDefaultQrUrl();

  // Feed READY + ETA fallback
  ensureOrdersSub();

  // Si llega OID (mesa), nos suscribimos directo si es posible
  if (currentOID) subscribeMineByOid(currentOID);

  // Autostart:
  // - Si viene OID: mostramos de inmediato.
  // - Si viene phone: también.
  if (autoStart) {
    // Ya renderiza via ensureOrdersSub / subscribeMineByOid
  }
})();

// Limpieza
window.addEventListener('beforeunload', () => {
  try {
    unsubOrders && unsubOrders();
  } catch {}
  try {
    unsubMineByOid && unsubMineByOid();
  } catch {}
  try {
    if (searchingTimer) clearTimeout(searchingTimer);
  } catch {}
});
