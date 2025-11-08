// ==============================
// Seven de Burgers — Kiosko V2
// Archivo: kiosk/app.js
// ==============================

/* --------- Rutas base / menú --------- */
const __parts = location.pathname.split('/').filter(Boolean);
// ejemplo: /prueba/v2/kiosk/index.html → BASE_PREFIX = /prueba/v2/
const BASE_PREFIX = __parts.length >= 2 ? `/${__parts[0]}/${__parts[1]}/` : '/';
const DATA_MENU_URL = `${BASE_PREFIX}data/menu.json`;

console.info('[kiosk] BASE_PREFIX =', BASE_PREFIX);
console.info('[kiosk] DATA_MENU_URL =', DATA_MENU_URL);

const elBoot = document.getElementById('app');
if (elBoot) elBoot.textContent = 'App.js cargado — iniciando módulos…';

/* --------- Imports compartidos --------- */
import { beep, toast } from '../shared/notify.js?v=20251106a';
import * as DB from '../shared/db.js?v=20251106a';
import { ensureAuth } from '../shared/firebase.js?v=20251106a';
import { initThemeFromSettings } from '../shared/theme.js?v=20251106a';

/* --------- Estado global --------- */
const state = {
  menu: null,
  mode: 'mini',

  cart: [],
  etaText: '7–10 min',
  etaSource: 'fallback',
  hhLeftText: '',
  themeName: '',
  drinkComboActive: false,

  // identidad / pedido
  customerName: '',
  identified: false,
  orderMeta: {
    type: 'pickup',
    table: '',
    phone: '',
    payMethodPref: 'efectivo'
  },

  // suscripciones Firebase
  unsubHH: null,
  unsubETA: null,
  unsubTheme: null,
  unsubReady: null,
  unsubAnalytics: null,

  // tracking
  lastOrderId: null,
  lastTrackUrl: '',
  isSubmittingOrder: false,

  // gamificación / regalo
  gift: {
    threshold: 117,
    productId: 'powerdog-mini',
    sound: null,
    autoPrompt: true,
    shownThisSession: false
  },

  loyaltyEnabled: true,
  loyaltyAskShown: false
};

/* --------- Constantes negocio --------- */
const DRINK_PRICE = { solo: 19, combo: 19 };
const CHEDDAR_UPGRADE_BASE = 7;

/* =====================================================
   Helpers básicos (cuidando NO mandar undefined)
   ===================================================== */

const money = n => '$' + Number(n || 0).toFixed(0);

function safeInt(n, def = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : def;
}
function safeStr(v, def = '') {
  return (v === undefined || v === null) ? def : String(v);
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(s = '') {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, ch => map[ch]);
}

/* --------- Carga de catálogo --------- */

async function fetchCatalogWithFallback() {
  try {
    const r = await fetch(DATA_MENU_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cat = await r.json();
    console.info('[kiosk] catálogo:', {
      burgers: cat?.burgers?.length || 0,
      minis: cat?.minis?.length || 0,
      sides: cat?.sides?.length || 0,
      drinks: cat?.drinks?.length || 0,
      combos: cat?.combos?.length || 0
    });
    window.__CATALOG = cat;
    document.getElementById('__debugMenu')?.remove();
    return cat;
  } catch (e) {
    console.error('[kiosk] error catálogo', e);
    const fallback = {
      burgers: [{ id: 'starter', name: 'Starter Burger', price: 47 }],
      minis: [],
      drinks: [],
      sides: [],
      combos: [],
      appSettings: {}
    };
    window.__CATALOG = fallback;
    document.getElementById('__debugMenu')?.remove();
    return fallback;
  }
}

/* =====================================================
   Helpers catálogo / sides / HH
   ===================================================== */

function findItemById(id) {
  if (!state.menu) return null;
  return (
    state.menu.burgers?.find(b => b.id === id) ||
    state.menu.minis?.find(m => m.id === id) ||
    state.menu.drinks?.find(d => d.id === id) ||
    state.menu.sides?.find(s => s.id === id) ||
    state.menu.combos?.find(c => c.id === id) ||
    null
  );
}

function baseOfItem(item) {
  if (!item || !state.menu) return item;
  if (item.baseOf) {
    return state.menu.burgers?.find(b => b.id === item.baseOf) || item;
  }
  if (item.mini && /-mini$/i.test(item.id || '')) {
    const baseId = String(item.id).replace(/-mini$/i, '');
    return state.menu.burgers?.find(b => b.id === baseId) || item;
  }
  return item;
}

function isSide(item) {
  if (!item) return false;
  const t = String(item.type || '').toLowerCase();
  const c = String(item.category || '').toLowerCase();
  if (t === 'side' || c === 'side') return true;
  if (/side-|papas|gajo/i.test(String(item.id || ''))) return true;
  if (Array.isArray(item.seasonings)) return true;
  return false;
}

function normalizeSeasonings(item) {
  const raw = Array.isArray(item?.seasonings) ? item.seasonings : [];
  return raw
    .map(x => {
      if (typeof x === 'string') {
        const id = slug(x);
        return id ? { id, name: x, kitchen: x } : null;
      }
      const id = x.id || slug(x.name || x.kitchen || '');
      const name = x.name || x.kitchen || '';
      const kitchen = x.kitchen || x.name || '';
      return id && name ? { id, name, kitchen } : null;
    })
    .filter(Boolean);
}

function defaultSeasoning(item) {
  const list = normalizeSeasonings(item);
  if (!list.length) return null;
  const salt = list.find(
    x => /sal\b/i.test(x.name || '') || /sal\b/i.test(x.kitchen || '')
  );
  return (salt || list[0]).kitchen;
}

function formatIngredientsFor(item, base) {
  const app = state.menu?.appSettings || {};
  const meatDefaultBig = safeInt(app.meatGrams, 85);
  const meatDefaultMini = safeInt(app.miniMeatGrams, 45);
  const grams = safeInt(
    item?.meatGrams,
    item?.mini ? meatDefaultMini : meatDefaultBig
  );

  const src = Array.isArray(item?.ingredients) && item.ingredients.length
    ? item.ingredients
    : base?.ingredients || [];

  return src.map(s =>
    /^Carne(\b|\s|$)/i.test(String(s))
      ? `Carne ${grams} g`
      : String(s)
  );
}

/* --------- Happy Hour --------- */

function hhInfo() {
  const hh = state.menu?.happyHour || {};
  const enabled = !!hh.enabled;
  const pct = Math.max(0, Math.min(100, Number(hh.discountPercent || 0))) / 100;
  const eligibleOnly = hh.applyEligibleOnly !== false;
  return { enabled, pct, eligibleOnly };
}

function hhDiscountPerUnit(item) {
  const { enabled, pct, eligibleOnly } = hhInfo();
  if (!enabled || pct <= 0 || !item) return 0;
  if (item.type === 'drink' || item.type === 'combo') return 0;
  const isEligible = eligibleOnly ? item.hhEligible !== false : true;
  if (!isEligible) return 0;
  const unit = Number(item.price || 0);
  return unit * pct;
}

/* =====================================================
   Iconos / temas
   ===================================================== */

const ICONS = {
  starter: "../shared/img/burgers/starter.png",
  koopa: "../shared/img/burgers/koopa.png",
  fatality: "../shared/img/burgers/fatality.png",
  mega: "../shared/img/burgers/mega.png",
  hadouken: "../shared/img/burgers/hadouken.png",
  nintendo: "../shared/img/burgers/nintendo.png",
  finalboss: "../shared/img/burgers/finalboss.png"
};
const ICONS_MEX = {
  starter: "../shared/img/burgers_mex/starter.png",
  koopa: "../shared/img/burgers_mex/koopa.png",
  fatality: "../shared/img/burgers_mex/fatality.png",
  mega: "../shared/img/burgers_mex/mega.png",
  hadouken: "../shared/img/burgers_mex/hadouken.png",
  nintendo: "../shared/img/burgers_mex/nintendo.png",
  finalboss: "../shared/img/burgers_mex/finalboss.png"
};

function getThemeIconFor(baseId) {
  const preset = window.__lastThemePreset || {};
  const base = preset.packBaseUrl || '';
  const map = preset.icons || {};
  const rel = map[baseId];
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
  if (dataAttr) return String(dataAttr).trim();
  const cssVar = getComputedStyle(root).getPropertyValue('--theme-name') || '';
  return String(cssVar).trim().replace(/^"|"$/g, '');
}

function startThemeWatcher() {
  state.themeName = readThemeNameFromDOM();
  const mo = new MutationObserver(() => {
    const newName = readThemeNameFromDOM();
    if (newName !== state.themeName) {
      state.themeName = newName;
      renderCards();
    }
  });
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-theme-name']
  });
  window.addEventListener('theme:changed', () => {
    const newName = readThemeNameFromDOM();
    if (newName !== state.themeName) {
      state.themeName = newName;
      renderCards();
    }
  });
}

/* =====================================================
   Acordeón + barra de poder (cards)
   ===================================================== */

const HIGHLIGHTS = {
  starter: 'La base de todo · sencilla',
  koopa: 'Crunch dulce: piña + tocino',
  fatality: 'Picoso extremo: habanero + cheddar + tocino',
  mega: 'Cheddar cremoso + salchicha y bacon',
  hadouken: 'Doble queso + chipotle · clásico SF',
  nintendo: 'Nostalgia noventera con piña',
  finalboss: 'La más cargada · sensación de jefe final'
};

function getHighlight(item, base) {
  const id = (base?.id || item?.id || '').toLowerCase();
  return item?.highlight || HIGHLIGHTS[id] || '';
}

function powerBarHtml(icon = '🍔') {
  return `
  <div class="power-bar" aria-hidden="true">
    <div class="power-icon" role="img">${icon}</div>
    <div class="power-track">
      <div class="power-fill"></div>
    </div>
  </div>`;
}

function buildAccordionForItem(item, base) {
  // Combos: mostrar detalle de piezas
  if (item?.type === 'combo') {
    const rawItems = Array.isArray(item.items) ? item.items : [];
    const subs = rawItems
      .map(ci => {
        const ref = findItemById(ci.id);
        const qtyText = ci.qty && ci.qty > 1 ? ` ×${ci.qty}` : '';
        const inc = ref
          ? formatIngredientsFor(ref, baseOfItem(ref))
          : [];
        return `
        <li>
          <strong>${escapeHtml(ref?.name || ci.id)}${qtyText}</strong>
          ${
            inc.length
              ? `<ul>${inc
                  .map(s => `<li>${escapeHtml(s)}</li>`)
                  .join('')}</ul>`
              : ''
          }
        </li>`;
      })
      .join('');

    const short = rawItems.slice(0, 3).map(ci => {
      const ref = findItemById(ci.id);
      const qty = ci.qty && ci.qty > 1 ? ` ×${ci.qty}` : '';
      return `${escapeHtml(ref?.name || ci.id)}${qty}`;
    });
    const extra = Math.max(0, rawItems.length - short.length);

    return `
    <details class="ing-acc" data-acc data-id="${escapeHtml(item.id)}">
      <summary class="ing-head">
        <div class="k-chips">
          ${short.map(s => `<span class="k-chip">${s}</span>`).join('')}
          ${
            extra > 0
              ? `<span class="k-chip chip-more" data-more>+${extra}</span>`
              : ''
          }
        </div>
        ${
          getHighlight(item, base)
            ? `<div class="muted small">${escapeHtml(
                getHighlight(item, base)
              )}</div>`
            : ''
        }
        ${powerBarHtml('⭐')}
      </summary>
      ${
        subs
          ? `<ul class="ing-list" style="margin:8px 0 0 18px">${subs}</ul>`
          : ''
      }
    </details>`;
  }

  // Normales
  const inc = formatIngredientsFor(item, base).filter(Boolean);
  if (!inc.length) {
    return getHighlight(item, base)
      ? `<div class="muted small" style="margin-top:4px">${escapeHtml(
          getHighlight(item, base)
        )}</div>`
      : '';
  }
  const shown = inc.slice(0, 3);
  const extra = Math.max(0, inc.length - shown.length);
  return `
  <details class="ing-acc" data-acc data-id="${escapeHtml(item.id)}">
    <summary class="ing-head">
      <div class="k-chips">
        ${shown
          .map(s => `<span class="k-chip">${escapeHtml(s)}</span>`)
          .join('')}
        ${extra > 0 ? `<span class="k-chip">+${extra}</span>` : ``}
      </div>
      ${
        getHighlight(item, base)
          ? `<div class="muted small">${escapeHtml(
              getHighlight(item, base)
            )}</div>`
          : ''
      }
      ${powerBarHtml(isSide(item) ? '🥔' : '🍔')}
    </summary>
    <ul class="ing-list" style="margin:8px 0 0 18px">
      ${inc.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
    </ul>
  </details>`;
}

function bindAccordionBehavior(container) {
  container.addEventListener('toggle', ev => {
    const d = ev.target;
    if (!d?.matches?.('details.ing-acc')) return;
    const fill = d.querySelector('.power-fill');
    if (!fill) return;
    if (d.open) {
      fill.style.width = '100%';
      try { beep(); } catch {}
    } else {
      fill.style.width = '0%';
      try { beep(); } catch {}
    }
  });
}

/* =====================================================
   Tabs
   ===================================================== */

document.getElementById('btnMinis')?.addEventListener('click', () => setMode('mini'));
document.getElementById('btnBig')?.addEventListener('click', () => setMode('big'));
document.getElementById('btnPapas')?.addEventListener('click', () => setMode('papas'));

function setMode(mode) {
  state.mode = mode;
  renderCards();
  setActiveTab(mode);
}

function setActiveTab(mode = state.mode) {
  const ids = ['btnMinis', 'btnBig', 'btnPapas', 'btnCombos', 'btnDrinks'];
  const on = el => {
    if (!el) return;
    el.classList.add('is-active');
    el.setAttribute('aria-selected', 'true');
  };
  const off = el => {
    if (!el) return;
    el.classList.remove('is-active');
    el.setAttribute('aria-selected', 'false');
  };
  ids.forEach(id => off(document.getElementById(id)));
  if (mode === 'mini') on(document.getElementById('btnMinis'));
  else if (mode === 'big') on(document.getElementById('btnBig'));
  else if (mode === 'papas') on(document.getElementById('btnPapas'));
  else if (mode === 'combos') on(document.getElementById('btnCombos'));
  else if (mode === 'drinks') on(document.getElementById('btnDrinks'));
}

function enableCombosTab() {
  const hasCombos = Array.isArray(state.menu?.combos) && state.menu.combos.length > 0;
  if (!hasCombos) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar || document.getElementById('btnCombos')) return;
  const btn = document.createElement('button');
  btn.id = 'btnCombos';
  btn.className = 'btn tab';
  btn.textContent = 'Combos';
  btn.addEventListener('click', () => setMode('combos'));
  bar.appendChild(btn);
}
function enableDrinksTab() {
  const hasDrinks = Array.isArray(state.menu?.drinks) && state.menu.drinks.length > 0;
  if (!hasDrinks) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar || document.getElementById('btnDrinks')) return;
  const btn = document.createElement('button');
  btn.id = 'btnDrinks';
  btn.className = 'btn tab';
  btn.textContent = 'Bebidas';
  btn.addEventListener('click', () => setMode('drinks'));
  bar.appendChild(btn);
}
function enablePapasTab() {
  const hasSides = Array.isArray(state.menu?.sides) && state.menu.sides.length > 0;
  if (!hasSides) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar || document.getElementById('btnPapas')) return;
  const btn = document.createElement('button');
  btn.id = 'btnPapas';
  btn.className = 'btn tab';
  btn.textContent = 'Papas';
  btn.addEventListener('click', () => setMode('papas'));
  const btnDrinks = document.getElementById('btnDrinks');
  if (btnDrinks) bar.insertBefore(btn, btnDrinks);
  else bar.appendChild(btn);
}

/* =====================================================
   Bebidas / Combo Drink
   ===================================================== */

function subtotalSinBebidas(cart = state.cart) {
  return cart.reduce((a, l) => {
    if (!l || l.isGift) return a;
    if (l.type === 'drink') return a;
    return a + safeInt(l.lineTotal);
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
      toast('🎉 Combo Drink Seven activo: bebidas a precio combo');
    } else {
      toast('Combo Drink Seven desactivado — bebidas a $19');
    }
  }
  cart.forEach(l => {
    if (l?.type === 'drink') {
      const qty = safeInt(l.qty, 1);
      l.meta = l.meta || {};
      l.meta.pricingMode = unlocked ? 'combo' : 'solo';
      l.unitPrice = target;
      l.hhDisc = 0;
      l.lineTotal = qty * target;
    }
  });
}

function findDrinkFlexible(key = '') {
  const list = state.menu?.drinks || [];
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
  state.cart.push({
    id: safeStr(drink.id),
    name: safeStr(drink.name),
    type: 'drink',
    qty: 1,
    unitPrice: safeInt(drink.price, price),
    lineTotal: price,
    baseIngredients: [],
    extras: { sauces: [], ingredients: [] },
    notes: '',
    hhDisc: 0,
    meta: { pricingMode: comboOn ? 'combo' : 'solo' }
  });
  ensureDrinkPrices();
  updateCartBar();
  beep();
  toast(`${drink.name} agregado`);
}

function addDrinkByKey(key) {
  const d = findDrinkFlexible(key);
  if (!d) {
    toast('Bebida no disponible');
    return;
  }
  addDrinkToCart(d);
}

/* =====================================================
   Render de tarjetas
   ===================================================== */

function qtyInCart(id) {
  return state.cart
    .filter(l => l && l.id === id && !l.isGift)
    .reduce((a, l) => a + safeInt(l.qty, 1), 0);
}

function renderCards() {
  const grid = document.getElementById('cards');
  if (!grid || !state.menu) return;
  grid.innerHTML = '';

  let items;
  if (state.mode === 'mini') items = state.menu.minis || [];
  else if (state.mode === 'big') items = state.menu.burgers || [];
  else if (state.mode === 'papas') items = state.menu.sides || [];
  else if (state.mode === 'combos') items = state.menu.combos || [];
  else if (state.mode === 'drinks') items = state.menu.drinks || [];
  else items = state.menu.minis || [];

  items.forEach(it => {
    const base = baseOfItem(it);
    const rawId = it.id || '';
    const baseId =
      base?.id ||
      (it.mini && /-mini$/i.test(rawId)
        ? rawId.replace(/-mini$/i, '')
        : rawId);

    const mxOn = /independencia|méx|mex|patria|viva/i.test(
      String(state.themeName || '')
    );
    const themedSrc = getThemeIconFor(baseId);
    const iconSrc =
      it.icon ||
      themedSrc ||
      (mxOn && ICONS_MEX[baseId]) ||
      ICONS[baseId] ||
      null;

    const card = document.createElement('div');
    card.className = 'card';

    const isCombo = it.type === 'combo';
    const isDrink = it.type === 'drink' || state.mode === 'drinks';
    const isSideItem = isSide(it);

    const disc = !isDrink && !isCombo ? hhDiscountPerUnit(it) : 0;
    const basePrice = safeInt(it.price);
    const eff = !isDrink && !isCombo
      ? Math.max(0, basePrice - disc)
      : (isDrink ? safeInt(it.price || DRINK_PRICE.solo) : basePrice);

    const qSel = qtyInCart(it.id);
    const selectedBadge =
      qSel > 0
        ? `<span class="tag" data-sel>×${qSel} en pedido</span>`
        : '';

    const showPrice = isCombo ? basePrice : eff;

    const priceHtml =
      !isDrink && !isCombo && disc > 0
        ? `<div class="price"><s>${money(basePrice)}</s> <span class="tag">${money(
            eff
          )}</span> ${selectedBadge}</div>`
        : `<div class="price">${money(showPrice)} ${selectedBadge}</div>`;

    const actionsHtml = isDrink
      ? `<button class="btn small" data-a="drinkAdd">Agregar</button>`
      : `${
          isCombo
            ? ''
            : `<button class="btn small ghost" data-a="custom">Personalizar</button>`
        }
         <button class="btn small" data-a="${
           isCombo ? 'order' : 'quick'
         }">${isCombo ? 'Ordenar combo' : 'Ordenar rápido'}</button>`;

    const mediaImg = iconSrc
      ? `<img src="${iconSrc}" alt="${escapeHtml(
          it.name
        )}" class="icon-img" loading="lazy"/>`
      : `<div class="icon" aria-hidden="true"></div>`;

    card.innerHTML = `
      <h3>${escapeHtml(it.name)}</h3>
      <div class="media">${mediaImg}</div>
      ${buildAccordionForItem(it, base)}
      <div class="row">
        ${priceHtml}
        <div class="row" style="gap:8px">${actionsHtml}</div>
      </div>
    `;
    grid.appendChild(card);

    if (qSel > 0) {
      card.classList.add('is-selected');
      const fill = card.querySelector('.power-fill');
      if (fill) fill.style.width = '100%';
    }

    // Interacciones

    card.querySelector('[data-more]')?.addEventListener('click', ev => {
      ev.preventDefault();
      openItemModal(it, base);
    });

    if (isCombo) {
      card.querySelector('[data-a="order"]')?.addEventListener('click', async () => {
        const ok = await ensureCustomerIdentified(state.orderMeta.type);
        if (!ok) return;
        addComboToCart(it);
      });
    } else if (isDrink) {
      card.querySelector('[data-a="drinkAdd"]')?.addEventListener('click', async () => {
        const ok = await ensureCustomerIdentified(state.orderMeta.type);
        if (!ok) return;
        addDrinkToCart(it);
      });
    } else {
      card.querySelector('[data-a="custom"]')?.addEventListener('click', async () => {
        if (!state.identified) {
          const ok = await ensureCustomerIdentified(state.orderMeta.type);
          if (!ok) return;
        }
        openItemModal(it, base);
      });
      card.querySelector('[data-a="quick"]')?.addEventListener('click', async () => {
        const ok = await ensureCustomerIdentified(state.orderMeta.type);
        if (!ok) return;
        addQuickItem(it, base);
      });
    }
  });

  bindAccordionBehavior(grid);
  enableCombosTab();
  enableDrinksTab();
  enablePapasTab();
}

/* =====================================================
   Quick add / combos
   ===================================================== */

async function addQuickItem(item, base) {
  const ok = await ensureCustomerIdentified(state.orderMeta.type);
  if (!ok) return;

  const d = hhDiscountPerUnit(item);
  const unit = Math.max(0, safeInt(item.price) - d);
  const seasoning = isSide(item) ? defaultSeasoning(item) : null;

  state.cart.push({
    id: safeStr(item.id),
    name: safeStr(item.name),
    mini: !!item.mini,
    qty: 1,
    unitPrice: safeInt(item.price),
    baseIngredients: formatIngredientsFor(item, base),
    ingredients: formatIngredientsFor(item, base),
    salsaDefault: base?.salsaDefault || base?.suggested || null,
    salsaCambiada: null,
    extras: {
      sauces: [],
      ingredients: [],
      dlcCarne: false,
      surpriseSauce: null,
      seasoning
    },
    notes: '',
    lineTotal: unit,
    hhDisc: d,
    type: isSide(item) ? 'side' : 'burger'
  });

  ensureDrinkPrices();
  updateCartBar();
  beep();
  toast(`${item.name} agregado`);
  smartDrinkNudge();
}

function smartDrinkNudge() {
  const priceTxt = isDrinkComboUnlocked() ? DRINK_PRICE.combo : DRINK_PRICE.solo;
  let box = document.getElementById('__drinkNudge');
  if (box) box.remove();
  box = document.createElement('div');
  box.id = '__drinkNudge';
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:1000;background:#0f182a;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;display:flex;gap:8px;align-items:center';
  box.innerHTML = `
    <span class="muted small">¿Bebida?</span>
    <button class="btn tiny" data-k="7up">Limonada $${priceTxt}</button>
    <button class="btn tiny" data-k="pepsi">Cola $${priceTxt}</button>
    <button class="btn ghost tiny" data-k="x">No</button>`;
  document.body.appendChild(box);
  box.onclick = e => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    const k = b.getAttribute('data-k');
    if (k === 'x') {
      box.remove();
      return;
    }
    addDrinkByKey(k);
    box.remove();
  };
  setTimeout(() => {
    try { box.remove(); } catch {}
  }, 5000);
}

async function addComboToCart(combo) {
  const ok = await ensureCustomerIdentified(state.orderMeta.type);
  if (!ok) return;
  try {
    const items = [];
    if (Array.isArray(combo.items)) {
      combo.items.forEach(ci => {
        const ref = findItemById(ci.id);
        items.push({
          kind: ci.kind || (ref?.mini ? 'mini' : isSide(ref) ? 'side' : 'burger'),
          id: safeStr(ci.id),
          qty: safeInt(ci.qty, 1),
          name: safeStr(ref?.name || ci.id),
          grams: ci.grams || null,
          seasoning: ci.seasoningId || null,
          sauce: ci.sauce || null
        });
      });
    }

    const qty = 1;
    const unitPrice = safeInt(combo.price);
    state.cart.push({
      id: safeStr(combo.id),
      name: safeStr(combo.name),
      type: 'combo',
      qty,
      unitPrice,
      lineTotal: unitPrice * qty,
      hhDisc: 0,
      items,
      extras: { cheddarUpgrade: false },
      notes: ''
    });

    ensureDrinkPrices();
    updateCartBar();
    beep();
    toast(`${combo.name} agregado`);
  } catch (e) {
    console.warn('addComboToCart fail', e);
    toast('No pude agregar el combo');
  }
}

/* =====================================================
   Modal Personalizar (versión compacta segura)
   ===================================================== */

function openItemModal(item, base) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');
  const btnAdd = document.getElementById('modalAdd');
  const qtyInput = document.getElementById('modalQty');
  const notesInput = document.getElementById('modalNotes');
  const seasoningBox = document.getElementById('seasonings');

  if (!modal || !body || !title || !btnAdd || !qtyInput) {
    console.warn('modal incompleto en HTML');
    return;
  }

  const baseItem = baseOfItem(item);
  const ingredients = formatIngredientsFor(item, baseItem);
  title.textContent = `${item.name} · ${money(item.price)}`;

  // Ingredientes base
  let html = '';
  if (ingredients.length) {
    html += `<div class="field">
      <label>Incluye</label>
      <ul class="ing-list">${ingredients
        .map(s => `<li>${escapeHtml(s)}</li>`)
        .join('')}</ul>
    </div>`;
  }

  // Sazonador sides
  if (isSide(item) && seasoningBox) {
    const seasonings = normalizeSeasonings(item);
    if (seasonings.length) {
      const def = defaultSeasoning(item);
      html += `<div class="field"><label>Sazonador (gratis)</label><div id="seasonings">`;
      seasonings.forEach(seas => {
        const id = `seas_${seas.id}`;
        const checked = seas.kitchen === def ? 'checked' : '';
        html += `
          <label for="${id}">
            <input type="radio" name="seasoning" id="${id}" value="${escapeHtml(
          seas.kitchen
        )}" ${checked}>
            <span>${escapeHtml(seas.name)}</span>
          </label>`;
      });
      html += `</div></div>`;
    }
  }

  // Extras simples (placeholder: compatibles con versiones previas)
  html += `
    <div class="field">
      <label>+ Ingredientes extra</label>
      <small class="muted small">Pide al cajero agregar extras específicos.</small>
    </div>`;

  body.innerHTML = html;
  qtyInput.value = '1';
  notesInput.value = '';

  modal.classList.add('open');

  const close = () => modal.classList.remove('open');
  modal.querySelector('[data-close]')?.addEventListener('click', close, {
    once: true
  });
  modal.addEventListener(
    'click',
    e => {
      if (e.target === modal) close();
    },
    { once: true }
  );

  btnAdd.onclick = () => {
    const qty = Math.max(1, safeInt(qtyInput.value, 1));
    const notes = safeStr(notesInput.value, '').trim();

    let seasoning = null;
    if (isSide(item) && body.querySelector('#seasonings')) {
      const sel = body.querySelector('#seasonings input[type=radio]:checked');
      seasoning = sel ? sel.value : null;
    }

    const d = hhDiscountPerUnit(item);
    const unit = Math.max(0, safeInt(item.price) - d);

    state.cart.push({
      id: safeStr(item.id),
      name: safeStr(item.name),
      mini: !!item.mini,
      qty,
      unitPrice: safeInt(item.price),
      baseIngredients: ingredients,
      ingredients: ingredients,
      extras: {
        sauces: [],
        ingredients: [],
        dlcCarne: false,
        surpriseSauce: null,
        seasoning
      },
      notes,
      lineTotal: unit * qty,
      hhDisc: d * qty,
      type: isSide(item) ? 'side' : 'burger'
    });

    ensureDrinkPrices();
    updateCartBar();
    beep();
    toast(`${item.name} agregado`);
    close();
  };
}

/* =====================================================
   Carrito
   ===================================================== */

const cartBar = document.getElementById('cartBar');
document.getElementById('openCart')?.addEventListener('click', openCartModal);

function recomputeLine(l) {
  if (!l) return;
  const item = findItemById(l.id);
  if (l.type === 'drink') {
    // ya se maneja en ensureDrinkPrices
    const qty = safeInt(l.qty, 1);
    const base = isDrinkComboUnlocked() ? DRINK_PRICE.combo : DRINK_PRICE.solo;
    l.unitPrice = base;
    l.hhDisc = 0;
    l.lineTotal = qty * base;
    return;
  }
  if (item) {
    const d = hhDiscountPerUnit(item);
    const qty = safeInt(l.qty, 1);
    const unit = Math.max(0, safeInt(item.price) - d);
    l.unitPrice = safeInt(item.price);
    l.hhDisc = d * qty;
    l.lineTotal = unit * qty;
  } else {
    l.unitPrice = safeInt(l.unitPrice);
    const qty = safeInt(l.qty, 1);
    l.lineTotal = safeInt(l.lineTotal, l.unitPrice * qty);
    l.hhDisc = safeInt(l.hhDisc);
  }
}

function recomputeAllLines() {
  state.cart.forEach(recomputeLine);
  ensureDrinkPrices();
}

function computeBreakdown() {
  let total = 0;
  let hh = 0;
  state.cart.forEach(l => {
    total += safeInt(l.lineTotal);
    hh += safeInt(l.hhDisc);
  });
  const subtotal = total + hh;
  return { subtotal, hh, total };
}

function paintBreakdown() {
  ensureDrinkPrices();
  const { total } = computeBreakdown();
  const totFooter = document.getElementById('cartTotalFooter');
  if (totFooter) totFooter.textContent = money(total);
}

function paintIdentityBadge() {
  let b = document.getElementById('idBadge');
  if (!b) {
    b = document.createElement('div');
    b.id = 'idBadge';
    b.className = 'tag';
    b.style.cssText =
      'position:fixed;right:10px;bottom:56px;z-index:1000;';
    document.body.appendChild(b);
  }
  b.textContent = 'Cliente reconocido';
  b.style.display = state.identified ? 'inline-flex' : 'none';
}

function updateCartBar() {
  ensureDrinkPrices();
  const count = state.cart.reduce((a, l) => a + safeInt(l.qty, 1), 0);
  const total = state.cart.reduce(
    (a, l) => a + safeInt(l.lineTotal),
    0
  );
  const countEl = document.getElementById('cartCount');
  const totalEl = document.getElementById('cartBarTotal');
  if (countEl) countEl.textContent = String(count);
  if (totalEl) totalEl.textContent = money(total);
  if (cartBar) cartBar.style.display = count > 0 ? 'flex' : 'none';
  document.body.classList.toggle('has-cart', count > 0);
  checkGiftUnlock(!state.gift.shownThisSession);
  paintIdentityBadge();
}

function openCartModal() {
  if (!state.cart.length) return;
  recomputeAllLines();

  const modal = document.getElementById('cartModal');
  const body = document.getElementById('cartBody');
  const totalEl = document.getElementById('cartTotalFooter');
  const btnSend = document.getElementById('btnSendOrder');
  if (!modal || !body || !btnSend) return;

  const { subtotal, hh, total } = computeBreakdown();
  totalEl.textContent = money(total);

  body.innerHTML = '';
  state.cart.forEach((l, idx) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="ellipsis">${escapeHtml(l.name)} ×${safeInt(
      l.qty,
      1
    )}</div>
      <div class="right">${money(l.lineTotal)}</div>
      <button class="btn tiny ghost">–</button>
    `;
    row.querySelector('button').onclick = () => {
      state.cart.splice(idx, 1);
      openCartModal();
      updateCartBar();
    };
    body.appendChild(row);
  });

  if (hh > 0) {
    const hhRow = document.createElement('div');
    hhRow.className = 'muted small';
    hhRow.textContent = `Ahorro Happy Hour: ${money(hh)}`;
    body.appendChild(hhRow);
  }

  modal.classList.add('open');

  const close = () => modal.classList.remove('open');
  modal.querySelector('[data-close]')?.addEventListener('click', close, {
    once: true
  });
  modal.addEventListener(
    'click',
    e => {
      if (e.target === modal) close();
    },
    { once: true }
  );

  btnSend.onclick = submitOrderSafely;
}

/* =====================================================
   Regalo / Gift (versión segura)
   ===================================================== */

function checkGiftUnlock(autoOpen = false) {
  const { total } = computeBreakdown();
  if (
    !state.gift ||
    state.gift.shownThisSession ||
    !state.gift.productId
  )
    return;
  if (total >= state.gift.threshold) {
    state.gift.shownThisSession = true;
    if (autoOpen) {
      openGiftModal();
    }
  }
}

function openGiftModal() {
  try {
    playGiftSfx();
  } catch {}
  toast('🎁 Lograste el regalo de la casa. Díselo al staff.');
}

let achievementAudio = null;
async function playAchievement() {
  try {
    if (achievementAudio) {
      await achievementAudio.play();
      return;
    }
  } catch {}
  beep();
}
let giftAudio = null;
async function playGiftSfx() {
  try {
    if (giftAudio) {
      await giftAudio.play();
      return;
    }
  } catch {}
  beep();
}

/* =====================================================
   Identidad cliente (mínimo viable)
   ===================================================== */

async function ensureCustomerIdentified(type = 'pickup') {
  // Usa lo guardado
  if (state.identified && state.orderMeta.phone) return true;

  try {
    const cachedName = localStorage.getItem('kiosk:name') || '';
    const cachedPhone = localStorage.getItem('kiosk:phone') || '';

    let name = cachedName;
    let phone = cachedPhone;

    if (!name) {
      name = prompt('Tu nombre para el pedido:', cachedName || '') || '';
    }
    if (!phone) {
      phone =
        prompt(
          'WhatsApp / teléfono para avisarte cuando esté listo:',
          cachedPhone || ''
        ) || '';
    }

    name = name.trim();
    phone = phone.trim();

    if (!name || !phone) {
      toast('Necesito tu nombre y teléfono para continuar 🙂');
      return false;
    }

    state.customerName = name;
    state.orderMeta.type = type || 'pickup';
    state.orderMeta.phone = phone;
    state.orderMeta.table = '';
    state.orderMeta.payMethodPref =
      state.orderMeta.payMethodPref || 'efectivo';
    state.identified = true;

    localStorage.setItem('kiosk:name', name);
    localStorage.setItem('kiosk:phone', phone);

    paintIdentityBadge();
    return true;
  } catch (e) {
    console.warn('identity prompt blocked', e);
    return true; // no lo rompemos, pero podrías cambiarlo
  }
}

/* =====================================================
   Envío de pedido → Firebase / Cocina / Track
   ===================================================== */

async function submitOrderSafely() {
  if (!state.cart.length) {
    toast('Tu carrito está vacío');
    return;
  }
  if (state.isSubmittingOrder) return;
  const okId = await ensureCustomerIdentified(state.orderMeta.type);
  if (!okId) return;

  state.isSubmittingOrder = true;

  try {
    recomputeAllLines();
    const { subtotal, hh, total } = computeBreakdown();

    const items = state.cart.map(l => ({
      id: safeStr(l.id),
      name: safeStr(l.name),
      type: safeStr(l.type || (isSide(findItemById(l.id)) ? 'side' : 'burger')),
      qty: safeInt(l.qty, 1),
      unitPrice: safeInt(l.unitPrice),
      lineTotal: safeInt(l.lineTotal),
      hhDisc: safeInt(l.hhDisc),
      notes: safeStr(l.notes, ''),
      extras: {
        sauces: Array.isArray(l.extras?.sauces) ? l.extras.sauces : [],
        ingredients: Array.isArray(l.extras?.ingredients)
          ? l.extras.ingredients
          : [],
        dlcCarne: !!l.extras?.dlcCarne,
        surpriseSauce: l.extras?.surpriseSauce || null,
        seasoning: l.extras?.seasoning || null,
        cheddarUpgrade: !!l.extras?.cheddarUpgrade
      },
      meta: l.meta || null,
      isGift: !!l.isGift
    }));

    const now = Date.now();

    const order = {
      items,
      subtotal,
      hhDiscount: hh,
      total,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      source: 'kiosk-v2',
      etaText: safeStr(state.etaText),
      etaSource: safeStr(state.etaSource),
      theme: safeStr(state.themeName),
      meta: {
        customerName: safeStr(state.customerName),
        phone: safeStr(state.orderMeta.phone),
        table: safeStr(state.orderMeta.table),
        type: safeStr(state.orderMeta.type || 'pickup'),
        payMethodPref: safeStr(
          state.orderMeta.payMethodPref || 'efectivo'
        )
      }
    };

    // Limpia propiedades undefined por seguridad absoluta
    Object.keys(order).forEach(k => {
      if (order[k] === undefined) delete order[k];
    });

    // === Llamada a DB.createOrder (misma firma que V1) ===
    if (!DB || typeof DB.createOrder !== 'function') {
      console.error(
        '[kiosk] DB.createOrder no disponible — revisa shared/db.js'
      );
      toast('Error de conexión con cocina. Avísale al staff.');
      state.isSubmittingOrder = false;
      return;
    }

    const res = await DB.createOrder(order);
    const orderId =
      res?.orderId || res?.id || res || `O-${String(now)}`;

    state.lastOrderId = orderId;

    // Track URL igual que antes
    const trackUrl = new URL('./track.html', location.href);
    trackUrl.searchParams.set('oid', orderId);
    trackUrl.searchParams.set('gamify', '1');
    trackUrl.searchParams.set('autostart', '1');

    state.lastTrackUrl = trackUrl.toString();

    console.info('[kiosk] track URL =', state.lastTrackUrl);

    // Limpia carrito
    state.cart = [];
    updateCartBar();

    // Mostrar modal / enlace
    alert(
      `Pedido enviado.\nTu número de orden: ${orderId}\n` +
        `Puedes seguirlo aquí:\n${state.lastTrackUrl}`
    );

    // Opcional: abrir en nueva pestaña
    try {
      window.open(state.lastTrackUrl, '_blank');
    } catch {}

    beep();
    toast('Pedido enviado a cocina ✅');
  } catch (e) {
    console.error('[kiosk] error al enviar pedido', e);
    toast('No se pudo enviar el pedido. Intenta de nuevo o avisa al staff.');
  } finally {
    state.isSubmittingOrder = false;
    const cartModal = document.getElementById('cartModal');
    cartModal?.classList.remove('open');
  }
}

/* =====================================================
   Happy Hour / ETA (suscripciones si existen)
   ===================================================== */

function bindHappyHour() {
  if (!DB || typeof DB.subscribeHappyHour !== 'function') return;
  try {
    state.unsubHH = DB.subscribeHappyHour(info => {
      if (!info) return;
      state.hhLeftText = info.text || '';
      const pill = document.getElementById('hhText');
      if (pill) pill.textContent = state.hhLeftText;
    });
  } catch (e) {
    console.warn('HH subscribe fail', e);
  }
}

function bindETA() {
  if (!DB || typeof DB.subscribeETA !== 'function') return;
  try {
    state.unsubETA = DB.subscribeETA(data => {
      if (!data) return;
      state.etaText = data.text || state.etaText;
      state.etaSource = data.source || 'remote';
      document
        .querySelectorAll('[data-eta-text]')
        .forEach(el => (el.textContent = state.etaText));
    });
  } catch (e) {
    console.warn('ETA subscribe fail', e);
  }
}

function startOrdersAnalytics() {
  if (!DB || typeof DB.startOrdersAnalytics !== 'function') return;
  try {
    state.unsubAnalytics = DB.startOrdersAnalytics('kiosk-v2');
  } catch (e) {
    console.warn('analytics init fail', e);
  }
}

/* =====================================================
   Placeholders seguros (no rompen si no existen)
   ===================================================== */

function ensureTrackPrompt() {
  // si tienes UI especial de seguimiento, inicialízala aquí.
}
function ensureGiftModal() {
  // si tienes modal visual de regalo, puedes prepararlo aquí.
}

/* =====================================================
   Init
   ===================================================== */

init();

async function init() {
  try {
    await ensureAuth();
  } catch (e) {
    console.warn('anon auth fail', e);
  }

  try {
    state.customerName = localStorage.getItem('kiosk:name') || '';
    state.orderMeta.phone = localStorage.getItem('kiosk:phone') || '';
    if (state.orderMeta.phone) state.identified = true;
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

  if (state.unsubTheme) {
    try {
      state.unsubTheme();
    } catch {}
    state.unsubTheme = null;
  }
  state.unsubTheme = initThemeFromSettings({ defaultName: 'Base' });

  ensureTrackPrompt();
  ensureGiftModal();
  paintIdentityBadge();

  if (sessionStorage.getItem('kioskAdmin') === '1') {
    state.adminMode = true;
  }
}

/* =====================================================
   Limpieza antes de salir
   ===================================================== */

window.addEventListener('beforeunload', () => {
  try {
    state.unsubHH?.();
    state.unsubETA?.();
    state.unsubTheme?.();
    state.unsubReady?.();
    state.unsubAnalytics?.();
  } catch {}
});
