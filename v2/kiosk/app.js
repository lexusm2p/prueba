// Seven — Kiosko V2 (full)
// app.js · 2025-11-09b
// Compatible con HTML V2, Cocina V2, track V2 y shared/db.js + firebase.js.

// ======================= Rutas base =======================

const __parts = location.pathname.split('/').filter(Boolean);
const __baseIndex = __parts.indexOf('v2');
const __root = __baseIndex >= 0
  ? '/' + __parts.slice(0, __baseIndex + 1).join('/') + '/'
  : '/';

export const DATA_MENU_URL = `${__root}data/menu.json`;
console.info('[kiosk] DATA_MENU_URL =', DATA_MENU_URL);

const elMsg = document.getElementById('app');
if (elMsg) elMsg.textContent = 'App.js cargado — iniciando módulos…';

// ======================= Imports =======================

import '../shared/firebase.js?v=20251109';
import { beep, toast } from '../shared/notify.js?v=20251109';
import * as DB from '../shared/db.js?v=20251109';
import { ensureAuth } from '../shared/firebase.js?v=20251109';
import { initThemeFromSettings } from '../shared/theme.js?v=20251109';

// ======================= Estado global =======================

const state = {
  menu: null,
  mode: 'mini',
  cart: [],
  customerName: '',
  orderMeta: {
    type: '',        // pickup | dinein (se decide al identificar)
    table: '',
    phone: '',
    payMethodPref: 'efectivo',
    typeChosen: false
  },
  unsubHH: null,
  unsubETA: null,
  unsubTheme: null,
  unsubReady: null,
  unsubAnalytics: null,
  etaText: '7–10 min',
  etaSource: 'fallback',
  hhLeftText: '',
  themeName: '',
  drinkComboActive: false,
  rewards: { type: null, discountCents: 0, miniDog: false, decided: false },
  gift: {
    threshold: 117,
    productId: 'powerdog-mini',
    sound: null,
    autoPrompt: true,
    shownThisSession: false
  },
  lastOrderId: null,
  lastTrackUrl: '',
  isSubmittingOrder: false,
  adminMode: false,
  loyaltyEnabled: true,
  loyaltyAskShown: false,
  identified: false,
  identifiedAt: 0,
  lastKnownPhone: '',
  lastKnownName: '',
  lastOrderPreview: null
};

// ======================= Constantes =======================

const DRINK_PRICE = { solo: 19, combo: 19 };
const CHEDDAR_UPGRADE_BASE = 7;

// Extras con costo estándar
const PAID_EXTRAS_BASE = [
  { id: 'tocino-extra',     label: 'Tocino extra',                    price: 9 },
  { id: 'pina-extra',       label: 'Rebanada de piña',                price: 7 },
  { id: 'jamon-extra',      label: 'Jamón',                           price: 5 },
  { id: 'cebolla-asada',    label: 'Cebolla asada',                   price: 3 },
  { id: 'dlc-mini',         label: 'DLC mini → carne grande',         price: 15, onlyMini: true },
  { id: 'carne-extra',      label: 'Carne extra 85 g',                price: 22 },
  { id: 'salchicha-extra',  label: 'Salchicha extra',                 price: 10 },
  { id: 'aderezo-1oz',      label: 'Aderezo extra 1 oz',              price: 5 }
];

// ======================= Helpers =======================

const money = n => '$' + Number(n ?? 0).toFixed(0);

function deepClean(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    const arr = [];
    for (const v of value) {
      const c = deepClean(v);
      arr.push(c === undefined ? null : c);
    }
    return arr;
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const c = deepClean(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }

  return value;
}

async function fetchCatalogWithFallback() {
  try {
    const r = await fetch(DATA_MENU_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cat = await r.json();
    console.info('[kiosk] catálogo:', {
      burgers: cat?.burgers?.length || 0,
      minis:   cat?.minis?.length || 0,
      sides:   cat?.sides?.length || 0,
      drinks:  cat?.drinks?.length || 0,
      combos:  cat?.combos?.length || 0
    });
    window.__CATALOG = cat;
    return cat;
  } catch (e) {
    console.error('[kiosk] error catálogo', e);
    const fallback = {
      burgers: [{ id: 'starter', name: 'Starter Burger', price: 47 }],
      minis: [],
      sides: [],
      drinks: [],
      combos: []
    };
    window.__CATALOG = fallback;
    return fallback;
  }
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findItemById(id) {
  return state.menu?.burgers?.find?.(b => b.id === id)
    || state.menu?.minis?.find?.(m => m.id === id)
    || state.menu?.drinks?.find?.(d => d.id === id)
    || state.menu?.sides?.find?.(s => s.id === id)
    || state.menu?.combos?.find?.(c => c.id === id)
    || null;
}

function baseOfItem(item) {
  if (!item) return item;
  if (item.baseOf) {
    return state.menu?.burgers?.find?.(b => b.id === item.baseOf) || item;
  }
  if (item.mini && /-mini$/i.test(item.id || '')) {
    const baseId = String(item.id).replace(/-mini$/i, '');
    return state.menu?.burgers?.find?.(b => b.id === baseId) || item;
  }
  return item;
}

function formatIngredientsFor(item, base) {
  const meatDefaultBig  = Number(state.menu?.appSettings?.meatGrams ?? 85);
  const meatDefaultMini = Number(state.menu?.appSettings?.miniMeatGrams ?? 45);
  const grams = Number(
    item?.meatGrams ??
    (item?.mini ? meatDefaultMini : meatDefaultBig)
  );
  const src = (Array.isArray(item?.ingredients) && item.ingredients.length)
    ? item.ingredients
    : (base?.ingredients || []);
  return src.map(s =>
    /^Carne(\b|\s|$)/i.test(String(s)) ? `Carne ${grams} g` : s
  );
}

function escapeHtml(s = '') {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, ch => map[ch]);
}

function getCheddarUpgradePrice() {
  const fromMenu = Number(
    state.menu?.extras?.sideCheddarUpgradePrice ??
    state.menu?.extras?.cheddarUpgradePrice
  );
  return Number.isFinite(fromMenu) && fromMenu > 0
    ? fromMenu
    : CHEDDAR_UPGRADE_BASE;
}

// ======================= Sides / sazonadores =======================

function isSide(item) {
  if (!item) return false;
  const t = String(item.type || '').toLowerCase();
  const c = String(item.category || '').toLowerCase();
  if (t === 'side' || c === 'side') return true;
  return /side-|papas|gajo/i.test(String(item.id || ''))
    || Array.isArray(item.seasonings);
}

function normalizeSeasonings(item) {
  const raw = Array.isArray(item?.seasonings) ? item.seasonings : [];
  return raw.map(x => {
    if (typeof x === 'string') {
      return { id: slug(x), name: x, kitchen: x };
    }
    return {
      id: x.id || slug(x.name || x.kitchen || ''),
      name: x.name || x.kitchen || '',
      kitchen: x.kitchen || x.name || ''
    };
  }).filter(o => o.id && o.name);
}

function defaultSeasoning(item) {
  const list = normalizeSeasonings(item);
  if (!list.length) return null;
  const salt = list.find(x =>
    /sal\b/i.test(x.name) || /sal\b/i.test(x.kitchen)
  );
  return (salt || list[0]).kitchen;
}

// ======================= Extras con costo =======================

function getPaidExtrasForItem(item) {
  const isMini = !!item?.mini;
  const list = [];

  PAID_EXTRAS_BASE.forEach(e => {
    if (e.onlyMini && !isMini) return;
    list.push({
      id: e.id,
      name: e.label,
      price: Number(e.price || 0)
    });
  });

  const fromMenu = []
    .concat(item?.paidExtras || [])
    .concat(state.menu?.extras?.paidExtras || [])
    .filter(Boolean);

  fromMenu.forEach(x => {
    if (typeof x === 'string') {
      list.push({ id: slug(x), name: x, price: 5 });
    } else {
      const id = x.id || slug(x.name || x.label || '');
      const name = x.name || x.label || id;
      const price = Number(x.price || x.cents || 5);
      if (id && name && price > 0) {
        list.push({ id, name, price });
      }
    }
  });

  const seen = {};
  return list.filter(x => {
    if (!x.id) return false;
    if (seen[x.id]) return false;
    seen[x.id] = 1;
    return true;
  });
}

// ======================= Highlights =======================

const HIGHLIGHTS = {
  starter:   'La base de todo · sencilla',
  koopa:     'Dulce + crujiente (piña + tocino)',
  fatality:  'Picoso extremo',
  mega:      'Cheddar + salchicha + tocino',
  hadouken:  'Doble queso + chipotle',
  nintendo:  'Nostalgia gamer',
  finalboss: 'Jefe final del menú'
};

function getHighlight(item, base) {
  const id = (base?.id || item?.id || '').toLowerCase();
  return item?.highlight || HIGHLIGHTS[id] || '';
}

// ======================= Power bar / acordeón =======================

function powerBarHtml(icon = '🍔') {
  return `
  <div class="power-bar" aria-hidden="true" style="display:flex;align-items:center;gap:6px;margin-top:6px">
    <div class="power-icon" style="font-size:16px;line-height:1">${icon}</div>
    <div class="power-track" style="flex:1;height:8px;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.08);">
      <div class="power-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#ffc242,#ff9f0a);transition:width .28s ease;"></div>
    </div>
  </div>`;
}

function buildAccordionForItem(item, base) {
  if (item?.type === 'combo') {
    const rawItems = Array.isArray(item.items) ? item.items : [];
    const subs = rawItems.map(it => {
      const ref = findItemById(it.id);
      const qty = it.qty && it.qty > 1 ? ` ×${it.qty}` : '';
      const inc = ref ? formatIngredientsFor(ref, baseOfItem(ref)) : [];
      return `
      <li>
        <strong>${escapeHtml(ref?.name || it.id)}${qty}</strong>
        ${inc.length ? `<ul>${inc.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
      </li>`;
    }).join('');
    const short = rawItems.slice(0, 3).map(it => {
      const ref = findItemById(it.id);
      const qty = it.qty && it.qty > 1 ? ` ×${it.qty}` : '';
      return `${escapeHtml(ref?.name || it.id)}${qty}`;
    });
    const extra = Math.max(0, rawItems.length - short.length);
    return `
    <details class="ing-acc">
      <summary>
        <div class="k-chips">
          ${short.map(s => `<span class="k-chip">${s}</span>`).join('')}
          ${extra > 0 ? `<span class="k-chip">+${extra}</span>` : ''}
        </div>
        ${getHighlight(item, base) ? `<div class="muted small">${escapeHtml(getHighlight(item, base))}</div>` : ''}
        ${powerBarHtml('⭐')}
      </summary>
      ${subs ? `<ul class="ing-list">${subs}</ul>` : ''}
    </details>`;
  }

  const inc = formatIngredientsFor(item, base).filter(Boolean);
  if (!inc.length) {
    return getHighlight(item, base)
      ? `<div class="muted small">${escapeHtml(getHighlight(item, base))}</div>`
      : '';
  }
  const shown = inc.slice(0, 3);
  const extra = Math.max(0, inc.length - shown.length);
  return `
  <details class="ing-acc">
    <summary>
      <div class="k-chips">
        ${shown.map(s => `<span class="k-chip">${escapeHtml(s)}</span>`).join('')}
        ${extra > 0 ? `<span class="k-chip">+${extra}</span>` : ''}
      </div>
      ${getHighlight(item, base) ? `<div class="muted small">${escapeHtml(getHighlight(item, base))}</div>` : ''}
      ${powerBarHtml(isSide(item) ? '🥔' : '🍔')}
    </summary>
    <ul class="ing-list">
      ${inc.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
    </ul>
  </details>`;
}

function bindAccordionBehavior(container) {
  container.addEventListener('toggle', e => {
    const d = e.target;
    if (!d?.matches?.('details.ing-acc')) return;
    const fill = d.querySelector('.power-fill');
    if (!fill) return;
    fill.style.width = d.open ? '100%' : '0%';
    if (d.open) { try { beep(); } catch {} }
  });
}

// ======================= Bebidas / Combo Drink =======================

function subtotalSinBebidas(cart = state.cart) {
  return cart.reduce((a, l) => {
    if (!l || l.isGift) return a;
    if (l.type === 'drink') return a;
    return a + Number(l.lineTotal || 0);
  }, 0);
}

function isDrinkComboUnlocked(cart = state.cart) {
  return subtotalSinBebidas(cart) >= 77;
}

function ensureDrinkPrices(cart = state.cart) {
  const unlocked = isDrinkComboUnlocked(cart);
  const target = unlocked ? DRINK_PRICE.combo : DRINK_PRICE.solo;

  if (unlocked !== state.drinkComboActive) {
    state.drinkComboActive = unlocked;
    if (unlocked) {
      try { playAchievement(); } catch {}
      toast('🎉 Combo Drink Seven activo');
    } else {
      toast('Combo Drink Seven desactivado');
    }
  }

  cart.forEach(l => {
    if (l?.type === 'drink') {
      const qty = l.qty || 1;
      l.meta = l.meta || {};
      l.meta.pricingMode = unlocked ? 'combo' : 'solo';
      l.unitPrice = Number(l.unitPrice || l.price || target);
      l.lineTotal = target * qty;
      l.hhDisc = 0;
    }
  });
}

function findDrinkFlexible(key = '') {
  const list = state.menu?.drinks || [];
  if (!list.length) return null;
  const k = String(key).toLowerCase();
  let d = list.find(x => String(x.id || '').toLowerCase() === k);
  if (d) return d;
  d = list.find(x => String(x.name || '').toLowerCase().includes(k));
  return d || null;
}

function addDrinkToCart(drink) {
  if (!drink) return;
  const comboOn = isDrinkComboUnlocked();
  const price = comboOn ? DRINK_PRICE.combo : DRINK_PRICE.solo;
  const qty = 1;
  state.cart.push({
    id: drink.id,
    name: drink.name,
    type: 'drink',
    qty,
    unitPrice: Number(drink.price || price),
    baseIngredients: [],
    extras: {
      sauces: [],
      ingredients: [],
      dlcCarne: false,
      surpriseSauce: null
    },
    notes: '',
    lineTotal: price * qty,
    hhDisc: 0,
    meta: { pricingMode: comboOn ? 'combo' : 'solo' }
  });
  ensureDrinkPrices();
  updateCartBar();
  beep();
  toast(`${drink.name} agregado`);
}

function addDrinkByKey(key) {
  const list = state.menu?.drinks || [];
  if (!list.length) {
    toast('Bebida no disponible');
    return;
  }
  let drink = null;
  if (key) drink = findDrinkFlexible(key);
  if (!drink) drink = list[0];
  addDrinkToCart(drink);
}

// ======================= Happy Hour =======================

function hhInfo() {
  const hh = state.menu?.happyHour || {};
  const enabled = !!hh.enabled;
  const pct = Math.max(0, Math.min(100, Number(hh.discountPercent || 0))) / 100;
  const eligibleOnly = hh.applyEligibleOnly !== false;
  return { enabled, pct, eligibleOnly };
}

function hhDiscountPerUnit(item) {
  const { enabled, pct, eligibleOnly } = hhInfo();
  if (!enabled || pct <= 0) return 0;
  if (!item) return 0;
  if (item.type === 'drink' || item.type === 'combo') return 0;
  const isEligible = eligibleOnly ? (item.hhEligible !== false) : true;
  if (!isEligible) return 0;
  return Number(item.price || 0) * pct;
}

// ======================= Iconos / Tema =======================

const ICONS = {
  starter:   '../shared/img/burgers/starter.png',
  koopa:     '../shared/img/burgers/koopa.png',
  fatality:  '../shared/img/burgers/fatality.png',
  mega:      '../shared/img/burgers/mega.png',
  hadouken:  '../shared/img/burgers/hadouken.png',
  nintendo:  '../shared/img/burgers/nintendo.png',
  finalboss: '../shared/img/burgers/finalboss.png'
};
const ICONS_MEX = {
  starter:   '../shared/img/burgers_mex/starter.png',
  koopa:     '../shared/img/burgers_mex/koopa.png',
  fatality:  '../shared/img/burgers_mex/fatality.png',
  mega:      '../shared/img/burgers_mex/mega.png',
  hadouken:  '../shared/img/burgers_mex/hadouken.png',
  nintendo:  '../shared/img/burgers_mex/nintendo.png',
  finalboss: '../shared/img/burgers_mex/finalboss.png'
};

function getThemeIconFor(baseId) {
  const preset = window.__lastThemePreset || {};
  const base = preset.packBaseUrl || '';
  const map = preset.icons || {};
  const rel = map?.[baseId];
  if (!rel || !base) return null;
  try {
    return new URL(rel, window.location.origin + base).toString();
  } catch {
    return null;
  }
}

function readThemeNameFromDOM() {
  const root = document.documentElement;
  const dataAttr =
    root.getAttribute('data-theme-name') ||
    root.getAttribute('data-theme') ||
    root.dataset?.themeName ||
    root.dataset?.theme ||
    '';
  if (dataAttr) return dataAttr.trim();
  const cssVar = getComputedStyle(root).getPropertyValue('--theme-name') || '';
  return String(cssVar).trim().replace(/^"|"$/g, '');
}

function startThemeWatcher() {
  state.themeName = readThemeNameFromDOM();
  const mo = new MutationObserver(() => {
    const name = readThemeNameFromDOM();
    if (name !== state.themeName) {
      state.themeName = name;
      renderCards();
    }
  });
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-theme-name']
  });
  window.addEventListener('theme:changed', () => {
    const name = readThemeNameFromDOM();
    if (name !== state.themeName) {
      state.themeName = name;
      renderCards();
    }
  });
}

// ======================= Audio =======================

let achievementAudio = null;
try {
  // achievementAudio = new Audio('../shared/sfx/achievement.mp3');
} catch {}
async function playAchievement() {
  try { if (achievementAudio) { await achievementAudio.play(); return; } } catch {}
  beep();
}

let giftAudio = null;
try {
  if (state.gift.sound) giftAudio = new Audio(state.gift.sound);
} catch {}
async function playGiftSfx() {
  try { if (giftAudio) { await giftAudio.play(); return; } } catch {}
  beep();
}

// ======================= Tabs =======================

document.getElementById('btnMinis')?.addEventListener('click', () => setMode('mini'));
document.getElementById('btnBig')?.addEventListener('click', () => setMode('big'));

function setMode(mode) {
  state.mode = mode;
  renderCards();
  setActiveTab(mode);
}

function setActiveTab(mode = state.mode) {
  const ids = ['btnMinis', 'btnBig', 'btnPapas', 'btnDrinks'];
  ids.forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    const on =
      (id === 'btnMinis' && mode === 'mini') ||
      (id === 'btnBig'   && mode === 'big') ||
      (id === 'btnPapas' && mode === 'papas') ||
      (id === 'btnDrinks'&& mode === 'drinks');
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function enablePapasTab() {
  if (!Array.isArray(state.menu?.sides) || !state.menu.sides.length) return;
  if (document.getElementById('btnPapas')) return;
  const bar = document.getElementById('tabsBar');
  if (!bar) return;
  const btn = document.createElement('button');
  btn.id = 'btnPapas';
  btn.className = 'btn tab';
  btn.textContent = 'Papas';
  btn.addEventListener('click', () => setMode('papas'));
  bar.appendChild(btn);
}

function enableDrinksTab() {
  if (!Array.isArray(state.menu?.drinks) || !state.menu.drinks.length) return;
  if (document.getElementById('btnDrinks')) return;
  const bar = document.getElementById('tabsBar');
  if (!bar) return;
  const btn = document.createElement('button');
  btn.id = 'btnDrinks';
  btn.className = 'btn tab';
  btn.textContent = 'Bebidas';
  btn.addEventListener('click', () => setMode('drinks'));
  bar.appendChild(btn);
}

// ======================= Render cards =======================

function qtyInCart(id) {
  return state.cart
    .filter(l => l && l.id === id && !l.isGift)
    .reduce((a, l) => a + (l.qty || 1), 0);
}

function renderCards() {
  const grid = document.getElementById('cards');
  if (!grid || !state.menu) return;
  grid.innerHTML = '';

  let items;
  if (state.mode === 'mini')        items = state.menu.minis  || [];
  else if (state.mode === 'big')   items = state.menu.burgers|| [];
  else if (state.mode === 'papas') items = state.menu.sides  || [];
  else if (state.mode === 'drinks')items = state.menu.drinks || [];
  else                             items = state.menu.minis  || [];

  items.forEach(it => {
    const base = baseOfItem(it);
    const rawId = it.id || '';
    const baseId = (base?.id)
      || (it.mini && /-mini$/i.test(rawId) ? rawId.replace(/-mini$/i, '') : rawId);

    const mxOn = /independencia|méx|mex|patria|viva/i.test(state.themeName || '');
    const themedSrc = getThemeIconFor(baseId);
    const iconSrc = it.icon
      || themedSrc
      || ((mxOn && ICONS_MEX[baseId]) ? ICONS_MEX[baseId] : ICONS[baseId]);

    const card = document.createElement('div');
    card.className = 'card';

    const isCombo = it.type === 'combo';
    const isDrink = it.type === 'drink' || state.mode === 'drinks';
    const disc = (!isDrink && !isCombo) ? hhDiscountPerUnit(it) : 0;
    const eff = (!isDrink && !isCombo)
      ? Math.max(0, Number(it.price || 0) - disc)
      : Number(it.price ?? DRINK_PRICE.solo);

    const qSel = qtyInCart(it.id);
    const selBadge = qSel > 0 ? `<span class="tag">×${qSel} en pedido</span>` : '';

    const showPrice = isCombo ? Number(it.price || eff) : eff;
    const priceHtml =
      (!isDrink && !isCombo && disc > 0)
        ? `<div class="price"><s>${money(it.price)}</s> <span class="tag">${money(eff)}</span> ${selBadge}</div>`
        : `<div class="price">${money(showPrice)} ${selBadge}</div>`;

    const actionsHtml = isDrink
      ? `<button class="btn small" data-a="drinkAdd">Agregar</button>`
      : `<button class="btn small ghost" data-a="custom">Personalizar</button>
         <button class="btn small" data-a="quick">Ordenar rápido</button>`;

    const media = iconSrc
      ? `<img src="${iconSrc}" alt="${escapeHtml(it.name)}" class="icon-img" loading="lazy"/>`
      : `<div class="icon" aria-hidden="true"></div>`;

    card.innerHTML = `
      <h3>${escapeHtml(it.name)}</h3>
      <div class="media">${media}</div>
      ${buildAccordionForItem(it, base)}
      <div class="row">
        ${priceHtml}
        <div class="row">${actionsHtml}</div>
      </div>
    `;
    grid.appendChild(card);

    if (qSel > 0) {
      const fill = card.querySelector('.power-fill');
      if (fill) fill.style.width = '100%';
    }

    if (isDrink) {
      card.querySelector('[data-a="drinkAdd"]')?.addEventListener('click', async () => {
        const ok = await ensureCustomerIdentified();
        if (!ok) return;
        addDrinkToCart(it);
      });
    } else {
      card.querySelector('[data-a="custom"]')?.addEventListener('click', async () => {
        if (!state.identified) await ensureCustomerIdentified();
        openItemModal(it, base);
      });
      card.querySelector('[data-a="quick"]')?.addEventListener('click', async () => {
        const ok = await ensureCustomerIdentified();
        if (!ok) return;
        addQuickItem(it, base);
      });
    }
  });

  bindAccordionBehavior(grid);
  enablePapasTab();
  enableDrinksTab();
}

// ======================= Orden rápido =======================

async function addQuickItem(item, base) {
  const ok = await ensureCustomerIdentified();
  if (!ok) return;
  const d = hhDiscountPerUnit(item);
  const unit = Math.max(0, Number(item.price || 0) - d);
  let seasoning = null;
  if (isSide(item)) seasoning = defaultSeasoning(item);
  state.cart.push({
    id: item.id,
    name: item.name,
    mini: !!item.mini,
    qty: 1,
    unitPrice: Number(item.price || 0),
    baseIngredients: formatIngredientsFor(item, base),
    ingredients: formatIngredientsFor(item, base),
    extras: {
      sauces: [],
      ingredients: [],
      dlcCarne: false,
      surpriseSauce: null,
      seasoning: seasoning || null
    },
    notes: '',
    lineTotal: unit,
    hhDisc: d,
    type: isSide(item) ? 'side' : undefined
  });
  ensureDrinkPrices();
  updateCartBar();
  beep();
  toast(`${item.name} agregado`);
  smartDrinkNudge();
}

function smartDrinkNudge() {
  const drinks = state.menu?.drinks || [];
  if (!drinks.length) return;
  const priceTxt = isDrinkComboUnlocked() ? DRINK_PRICE.combo : DRINK_PRICE.solo;
  const [d1, d2] = drinks;

  let box = document.getElementById('__drinkNudge');
  if (!box) {
    box = document.createElement('div');
    box.id = '__drinkNudge';
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:1000;background:#0f182a;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;display:flex;gap:8px;align-items:center';
    document.body.appendChild(box);
  }
  box.innerHTML = `
    <span class="muted small">¿Agregar bebida?</span>
    <button class="btn tiny" data-id="${d1.id}">${escapeHtml(d1.name)} $${priceTxt}</button>
    ${d2 ? `<button class="btn tiny" data-id="${d2.id}">${escapeHtml(d2.name)} $${priceTxt}</button>` : ''}
    <button class="btn ghost tiny" data-k="x">No</button>
  `;

  box.onclick = e => {
    const bId = e.target.closest('button[data-id]');
    const bNo = e.target.closest('button[data-k="x"]');
    if (bNo) {
      box.remove();
      return;
    }
    if (bId) {
      const id = bId.dataset.id;
      const drink = findItemById(id);
      if (drink) addDrinkToCart(drink);
      box.remove();
    }
  };

  setTimeout(() => { try { box.remove(); } catch {} }, 5000);
}

// ======================= Modal custom =======================

function openItemModal(item, base) {
  const modal = document.getElementById('modal');
  const body  = document.getElementById('mBody') || modal?.querySelector('.modal-body');
  const title = document.getElementById('mTitle');
  const totalEl = document.getElementById('mTotal');
  const addBtn  = document.getElementById('mAdd');
  const closeBtn= document.getElementById('mClose');

  if (!modal || !body || !title || !totalEl || !addBtn) {
    addQuickItem(item, base);
    return;
  }

  const inc = formatIngredientsFor(item, base);
  const seasoningList = isSide(item) ? normalizeSeasonings(item) : [];
  const paidExtras = getPaidExtrasForItem(item);

  title.textContent = item.name;
  body.innerHTML = `
    <div class="field">
      <label>Incluye</label>
      <div class="k-chips">
        ${inc.length
          ? inc.map(s => `<span class="k-chip">${escapeHtml(s)}</span>`).join('')
          : '<span class="muted small">Configurable en cocina</span>'}
      </div>
    </div>
    ${paidExtras.length ? `
    <div class="field">
      <label>Extras con costo</label>
      <div id="extrasList" class="ul-clean">
        ${paidExtras.map(e => `
        <label style="grid-column:1 / -1;display:flex;align-items:center;gap:8px;font-size:13px;">
          <input type="checkbox" data-id="${escapeHtml(e.id)}" data-name="${escapeHtml(e.name)}" data-price="${e.price}">
          <span>${escapeHtml(e.name)} (+${money(e.price)})</span>
        </label>`).join('')}
      </div>
    </div>` : ''}
    ${seasoningList.length ? `
    <div class="field">
      <label>Sazonador (gratis)</label>
      <div id="seasonings">
        ${seasoningList.map((s,i) => `
        <label>
          <input type="radio" name="seasoning" value="${escapeHtml(s.kitchen)}" ${i===0?'checked':''}/>
          <span>${escapeHtml(s.name)}</span>
        </label>`).join('')}
      </div>
    </div>` : ''}
    <div class="field">
      <label>Cantidad</label>
      <input type="number" id="qty" min="1" value="1"/>
    </div>
    <div class="field">
      <label>Comentarios a cocina</label>
      <textarea id="notes" placeholder="Sin jitomate, poco picante…"></textarea>
    </div>
  `;

  const qtyInput = body.querySelector('#qty');
  const extraInputs = body.querySelectorAll('#extrasList input[type="checkbox"]');

  const recompute = () => {
    const q = Math.max(1, Number(qtyInput.value || 1));
    const d = hhDiscountPerUnit(item);
    const baseUnit = Math.max(0, Number(item.price || 0) - d);
    let extrasUnit = 0;
    extraInputs.forEach(ch => {
      if (ch.checked) extrasUnit += Number(ch.dataset.price || 0);
    });
    const total = (baseUnit + extrasUnit) * q;
    totalEl.textContent = money(total);
  };
  if (qtyInput) qtyInput.addEventListener('input', recompute);
  extraInputs.forEach(ch => ch.addEventListener('change', recompute));
  recompute();

  addBtn.onclick = async () => {
    const ok = await ensureCustomerIdentified();
    if (!ok) return;
    const q = Math.max(1, Number(qtyInput.value || 1));
    const d = hhDiscountPerUnit(item);
    const baseUnit = Math.max(0, Number(item.price || 0) - d);
    const notes = (body.querySelector('#notes')?.value || '').trim();

    let seasoning = null;
    if (isSide(item)) {
      const r = body.querySelector('input[name="seasoning"]:checked');
      seasoning = r?.value || defaultSeasoning(item);
    }

    const chosenExtras = [];
    let extrasUnit = 0;
    const metaFlags = {};
    extraInputs.forEach(ch => {
      if (!ch.checked) return;
      const id = ch.dataset.id;
      const name = ch.dataset.name;
      const price = Number(ch.dataset.price || 0);
      extrasUnit += price;
      chosenExtras.push(name);

      if (id === 'dlc-mini') metaFlags.dlcMiniToBig = true;
      if (id === 'carne-extra') metaFlags.extraPatty = true;
      if (id === 'salchicha-extra') metaFlags.extraSausage = true;
      if (id === 'aderezo-1oz') {
        metaFlags.extraSauceOz = (metaFlags.extraSauceOz || 0) + 1;
      }
    });

    const unitFinal = baseUnit + extrasUnit;
    const lineTotal = unitFinal * q;
    const hhDisc = d * q;

    state.cart.push({
      id: item.id,
      name: item.name,
      mini: !!item.mini,
      qty: q,
      unitPrice: unitFinal,
      baseIngredients: inc,
      ingredients: inc,
      extras: {
        sauces: [],
        ingredients: chosenExtras,
        dlcCarne: !!metaFlags.dlcMiniToBig,
        surpriseSauce: null,
        seasoning: seasoning || null,
        meta: metaFlags
      },
      notes,
      lineTotal,
      hhDisc,
      type: isSide(item) ? 'side' : (item.type || undefined)
    });

    ensureDrinkPrices();
    updateCartBar();
    beep();
    toast(`${item.name} agregado`);
    closeModal(modal);
  };

  closeBtn.onclick = () => closeModal(modal);
  openModal(modal);
}

function openModal(m) {
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
}
function closeModal(m) {
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
}

// ======================= Carrito =======================

const cartBar = document.getElementById('cartBar');
document.getElementById('openCart')?.addEventListener('click', openCartModal);

function recomputeLine(l) {
  if (!l) return;
  if (l.type === 'drink') return;
  if (!l.unitPrice) {
    const ref = findItemById(l.id);
    l.unitPrice = Number(ref?.price || 0);
  }
  const qty = l.qty || 1;
  const base = l.unitPrice * qty;
  const hh = l.hhDisc || 0;
  l.lineTotal = Math.max(0, base - hh);
}

function recomputeAllLines() {
  state.cart.forEach(recomputeLine);
}

function computeBreakdown() {
  let total = 0, hh = 0;
  state.cart.forEach(l => {
    total += Number(l.lineTotal || 0);
    hh    += Number(l.hhDisc || 0);
  });
  const subtotal = total + hh;
  return { subtotal, hh, total };
}

function paintIdentityBadge() {
  let b = document.getElementById('idBadge');
  if (!b) {
    b = document.createElement('div');
    b.id = 'idBadge';
    b.className = 'tag';
    b.style.cssText = 'position:fixed;right:10px;bottom:56px;z-index:1000;';
    document.body.appendChild(b);
  }
  b.textContent = 'Datos listos para este pedido';
  b.style.display = state.identified ? 'inline-flex' : 'none';
}

function updateCartBar() {
  ensureDrinkPrices();
  recomputeAllLines();
  const count = state.cart.reduce((a, l) => a + (l.qty || 1), 0);
  const total = state.cart.reduce((a, l) => a + (l.lineTotal || 0), 0);
  const cEl = document.getElementById('cartCount');
  const tEl = document.getElementById('cartBarTotal');
  if (cEl) cEl.textContent = String(count);
  if (tEl) tEl.textContent = money(total);
  if (cartBar) cartBar.style.display = count > 0 ? 'flex' : 'none';
  document.body.classList.toggle('has-cart', count > 0);
  checkGiftUnlock(!state.gift.shownThisSession);
  paintIdentityBadge();
}

function openCartModal() {
  const modal = document.getElementById('cartModal');
  const body = document.getElementById('cartBody');
  if (!modal || !body) return;

  body.innerHTML = '';

  if (!state.cart.length) {
    body.innerHTML = '<p class="muted">Tu carrito está vacío.</p>';
  } else {
    state.cart.forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div>${escapeHtml(l.name)} ×${l.qty || 1}</div>
        ${l.extras?.ingredients?.length
          ? `<div class="muted small">${l.extras.ingredients.map(escapeHtml).join(', ')}</div>` : ''}
        ${l.notes ? `<div class="muted small">${escapeHtml(l.notes)}</div>` : ''}
        <div style="margin-left:auto">${money(l.lineTotal || 0)}</div>
        <button class="btn tiny ghost" data-i="${i}">✕</button>
      `;
      body.appendChild(row);
    });
  }

  paintBreakdown();
  openModal(modal);

  body.onclick = e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const idx = Number(b.dataset.i);
    if (idx >= 0) {
      state.cart.splice(idx, 1);
      updateCartBar();
      openCartModal();
    }
  };
}

document.getElementById('cartClose')?.addEventListener('click', () => {
  const m = document.getElementById('cartModal');
  if (m) closeModal(m);
});

function paintBreakdown() {
  ensureDrinkPrices();
  recomputeAllLines();
  const { total } = computeBreakdown();
  const f = document.getElementById('cartTotalFooter');
  if (f) f.textContent = money(total);
}

// ======================= Confirmar pedido =======================

document.addEventListener('click', e => {
  const btn = e.target.closest(
    '#cartConfirm, #btnConfirmOrder, #confirmOrderBtn, [data-confirm-order], .js-confirm-order'
  );
  if (!btn) return;
  e.preventDefault();
  submitOrder();
});

// ======================= Gift / HH / ETA (stubs) =======================

function checkGiftUnlock(autoOpen) {
  const { total } = computeBreakdown();
  if (state.gift.shownThisSession) return;
  if (total >= state.gift.threshold) {
    state.gift.shownThisSession = true;
    if (autoOpen) { try { playGiftSfx(); } catch {} toast('🎁 Pedido con regalo disponible'); }
  }
}
function ensureGiftModal() {}
function bindHappyHour() {}
function bindETA() {}
function startOrdersAnalytics() {}

// ======================= Tracking =======================

function buildTrackUrl(orderId) {
  const base = `${location.origin}${__root}kiosk/track.html`;
  const u = new URL(base);
  u.searchParams.set('oid', orderId);
  u.searchParams.set('gamify', '1');
  u.searchParams.set('autostart', '1');
  return u.toString();
}

function ensureTrackPrompt(url) {
  const linkInput = document.getElementById('trackLink');
  const btnNow = document.getElementById('trackNow');
  if (linkInput) linkInput.value = url;
  if (btnNow) btnNow.onclick = () => window.open(url, '_blank');
  if (!linkInput && !btnNow) toast('Sigue tu pedido aquí: ' + url);
}

// ======================= Identidad =======================

async function ensureCustomerIdentified() {
  if (!state.orderMeta.typeChosen) {
    const isPickup = confirm('¿Tu pedido es PARA LLEVAR?\nAceptar = Para llevar\nCancelar = Comer aquí (mesa)');
    state.orderMeta.type = isPickup ? 'pickup' : 'dinein';
    state.orderMeta.typeChosen = true;

    if (!isPickup) {
      const mesa = prompt('Número o nombre de mesa (opcional):', '') || '';
      state.orderMeta.table = mesa.trim();
    }
  }

  const isPickup = state.orderMeta.type === 'pickup';

  const suggestedName = state.lastKnownName || localStorage.getItem('kiosk:name') || '';
  const name = (prompt('Nombre para el pedido:', suggestedName) || '').trim();
  if (!name) {
    toast('Pon un nombre para identificar tu pedido');
    return false;
  }

  const suggestedPhone = state.lastKnownPhone || localStorage.getItem('kiosk:phone') || '';
  let phone = '';
  if (isPickup) {
    phone = (prompt('Número de WhatsApp para avisarte cuando esté listo (obligatorio):', suggestedPhone) || '').trim();
    if (!phone) {
      toast('El número es necesario para avisarte de tu pedido para llevar');
      return false;
    }
  } else {
    phone = (prompt('Número de WhatsApp para recompensas y avisos (opcional):', suggestedPhone) || '').trim();
  }

  state.customerName = name;
  state.orderMeta.phone = phone;
  state.identified = true;
  state.identifiedAt = Date.now();

  state.lastKnownName = name;
  state.lastKnownPhone = phone;
  try {
    localStorage.setItem('kiosk:name', name);
    if (phone) localStorage.setItem('kiosk:phone', phone);
  } catch {}

  paintIdentityBadge();
  return true;
}

// ======================= Dopamina / Lealtad =======================

function showLoyaltyNudge() {
  if (state.loyaltyAskShown || !state.loyaltyEnabled) return;
  if (state.orderMeta.phone) return;

  state.loyaltyAskShown = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.82);
  `;
  overlay.innerHTML = `
    <div style="
      background:#050816;
      border-radius:18px;
      padding:18px 18px 14px;
      max-width:360px;
      width:90%;
      box-shadow:0 18px 40px rgba(0,0,0,.7);
      text-align:center;
      border:1px solid rgba(255,255,255,.14);
      position:relative;
      overflow:hidden;
    ">
      <div style="
        position:absolute;
        top:-40px;right:-40px;
        width:90px;height:90px;
        border-radius:50%;
        border:4px solid #ffc242;
        box-shadow:0 0 22px rgba(255,194,66,.8);
        animation:spinCoin 1.3s linear infinite;
        background:
          radial-gradient(circle at 30% 30%, #fff7d0 0%, #ffc242 45%, #b37700 100%);
        ">
      </div>
      <h2 style="margin:0 0 6px;font-size:22px;color:#ffc242;">🎮 Nivel Seven desbloqueado</h2>
      <p style="margin:0 0 10px;font-size:14px;color:#dbe4ff;">
        Guarda tu WhatsApp y empieza a acumular puntos para
        <b>bebidas, papas y burgers sorpresa</b>.
      </p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;">
        <button id="lvYes" class="btn" style="font-size:13px;">Quiero mis recompensas</button>
        <button id="lvNo" class="btn ghost" style="font-size:13px;">Ahora no</button>
      </div>
    </div>
    <style>
      @keyframes spinCoin{
        from{transform:rotateY(0deg);}
        50% {transform:rotateY(180deg);}
        to{transform:rotateY(360deg);}
      }
    </style>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#lvYes').onclick = () => {
    const p = (prompt('Escribe tu número de WhatsApp para vincular tus recompensas:','') || '').trim();
    if (p) {
      state.orderMeta.phone = p;
      state.lastKnownPhone = p;
      try { localStorage.setItem('kiosk:phone', p); } catch {}
      toast('✨ Listo, tu perfil Seven quedó activo');
    }
    overlay.remove();
  };
  overlay.querySelector('#lvNo').onclick = () => {
    overlay.remove();
  };
}

// ======================= Crear pedido =======================

async function submitOrder() {
  if (!state.cart.length) {
    toast('Tu carrito está vacío');
    return;
  }
  if (state.isSubmittingOrder) return;

  const okId = await ensureCustomerIdentified();
  if (!okId) return;

  state.isSubmittingOrder = true;

  try {
    ensureDrinkPrices();
    recomputeAllLines();
    const { subtotal, hh, total } = computeBreakdown();

    const order = {
      createdAt: Date.now(),
      status: 'pending',
      source: 'kiosk-v2',
      mode: state.orderMeta.type || 'pickup',
      table: state.orderMeta.table || '',
      customerName: state.customerName || '',
      phone: state.orderMeta.phone || '',
      payMethodPref: state.orderMeta.payMethodPref || 'efectivo',
      items: state.cart.map(l => ({
        id: l.id,
        name: l.name,
        qty: l.qty || 1,
        type: l.type || (l.mini ? 'mini' : 'item'),
        unitPrice: l.unitPrice || 0,
        lineTotal: l.lineTotal || 0,
        notes: l.notes || '',
        extras: l.extras || {},
        meta: l.meta || {}
      })),
      subtotal,
      hhDiscount: hh,
      total
    };

    const cleanOrder = deepClean(order);

    const orderId = await DB.createOrder(cleanOrder);
    console.info('[kiosk] order created', orderId);

    state.lastOrderId = orderId;
    const url = buildTrackUrl(orderId);
    state.lastTrackUrl = url;

    state.cart = [];
    updateCartBar();

    const cartModal = document.getElementById('cartModal');
    if (cartModal) closeModal(cartModal);

    beep();
    toast('✅ Pedido enviado');
    ensureTrackPrompt(url);

    showLoyaltyNudge();
  } catch (e) {
    console.error('[kiosk] submitOrder error', e);
    toast('No se pudo enviar el pedido. Intenta otra vez.');
  } finally {
    state.isSubmittingOrder = false;
  }
}

// ======================= Init =======================

init();

async function init() {
  const qs = new URLSearchParams(location.search);
  const modeQ = (qs.get('mode') || '').toLowerCase();
  if (modeQ === 'offline') {
    state.orderMeta.type = 'pickup';
    state.orderMeta.typeChosen = true;
  }

  try { await ensureAuth(); } catch (e) { console.warn('anon auth fail', e); }

  try {
    state.lastKnownName = localStorage.getItem('kiosk:name') || '';
    state.lastKnownPhone = localStorage.getItem('kiosk:phone') || '';
  } catch {}

  state.menu = await fetchCatalogWithFallback();

  startThemeWatcher();
  ensureDrinkPrices();
  renderCards();
  setActiveTab('mini');
  updateCartBar();

  bindHappyHour();
  bindETA();
  startOrdersAnalytics();

  if (state.unsubTheme) { try { state.unsubTheme(); } catch {} state.unsubTheme = null; }
  state.unsubTheme = initThemeFromSettings({ defaultName: 'Base' });

  ensureGiftModal();
  paintIdentityBadge();

  if (sessionStorage.getItem('kioskAdmin') === '1') state.adminMode = true;

  console.info('[kiosk] listo');
}

// ======================= Limpieza =======================

window.addEventListener('beforeunload', () => {
  try {
    state.unsubHH?.();
    state.unsubETA?.();
    state.unsubTheme?.();
    state.unsubReady?.();
    state.unsubAnalytics?.();
  } catch {}
});
