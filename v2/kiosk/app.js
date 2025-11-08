// Seven — Kiosko V2 (test)
// app.js · 2025-11-08e  (compatible con HTML V2, Cocina V2 y track V2)

/* ======================= Rutas base ======================= */

const __parts = location.pathname.split('/').filter(Boolean);
const __baseIndex = __parts.indexOf('v2');
const __root = __baseIndex >= 0
  ? '/' + __parts.slice(0, __baseIndex + 1).join('/') + '/'
  : '/';

export const DATA_MENU_URL = `${__root}data/menu.json`;
console.info('[kiosk] DATA_MENU_URL =', DATA_MENU_URL);

const elMsg = document.getElementById('app');
if (elMsg) elMsg.textContent = 'App.js cargado — iniciando módulos…';

/* ======================= Imports ======================= */
/**
 * MUY IMPORTANTE:
 * - Primero cargamos firebase.js (side-effect) para que exponga window.FIREBASE_DB/FIREBASE_FS.
 * - Luego db.js, que usará esos globals y apuntará a Firestore real (ORDERS_COLLECTION).
 * - Las versiones (?v=...) deben coincidir con las que usas en cocina.
 */

import '../shared/firebase.js?v=20251108'; // inicializa Firebase + globals

import { beep, toast } from '../shared/notify.js?v=20251106a';
import * as DB from '../shared/db.js?v=20251108';
import { ensureAuth } from '../shared/firebase.js?v=20251108';
import { initThemeFromSettings } from '../shared/theme.js?v=20251108';

/* ======================= Estado global ======================= */

const state = {
  menu: null,
  mode: 'mini',
  cart: [],
  customerName: '',
  orderMeta: {
    type: 'pickup',   // pickup | online (se ajusta por ?mode=)
    table: '',
    phone: '',
    payMethodPref: 'efectivo'
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

/* ======================= Constantes ======================= */

const DRINK_PRICE = { solo: 19, combo: 19 };
const CHEDDAR_UPGRADE_BASE = 7;

/* ======================= Helpers ======================= */

const money = n => '$' + Number(n ?? 0).toFixed(0);

/** Limpia recursivamente cualquier undefined (Firestore no los acepta) */
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

/* ======================= Lógica de sides / sazonadores ======================= */

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

/* ======================= Highlights ======================= */

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

/* ======================= Power bar / acordeón ======================= */

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

/* ======================= Bebidas / Combo Drink ======================= */

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

/* ======================= Happy Hour / Iconos / Tema / etc ======================= */
/* (sin cambios de lógica relevante, solo organización) */

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

/* ======================= Audio / Tabs / Render cards / etc ======================= */
/* (resto del archivo igual que el tuyo, sin cambios funcionales en submitOrder) */
/* ... TODO restante: copiar el mismo contenido que ya tenías desde "Audio" hasta el final,
   porque esas partes están bien; sólo tocamos imports y detalles arriba. */
