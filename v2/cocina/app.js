// ==============================
// Seven de Burgers — Kiosko V2
// Archivo: /kiosk/app.js
// ==============================

/* 0) Rutas base (menu.json + track) */

function getBasePrefix(){
  // /prueba/v2/kiosk/index.html  -> /prueba/v2/
  const path = location.pathname.replace(/\/index\.html$/,'');
  const segs = path.split('/').filter(Boolean);
  const kioskIdx = segs.lastIndexOf('kiosk');
  const baseSegs = kioskIdx >= 0 ? segs.slice(0, kioskIdx) : segs.slice(0, -1);
  if (!baseSegs.length) return '/';
  return '/' + baseSegs.join('/') + '/';
}

export const BASE_PREFIX   = getBasePrefix();
export const DATA_MENU_URL = BASE_PREFIX + 'data/menu.json';
const TRACK_PAGE_PATH      = BASE_PREFIX + 'kiosk/track.html';

console.info('[kiosk] BASE_PREFIX =', BASE_PREFIX, 'DATA_MENU_URL =', DATA_MENU_URL);

/* 1) Boot mínimo */

const rootEl = document.getElementById('app');
if (rootEl){
  rootEl.textContent = 'App.js cargado — iniciando módulos…';
}

/* 2) Imports compartidos */

import { beep, toast } from '../shared/notify.js?v=20251106a';
import * as DB from '../shared/db.js?v=20251106a';
import { ensureAuth } from '../shared/firebase.js?v=20251106a';
import { initThemeFromSettings } from '../shared/theme.js?v=20251106a';

/* 3) Utils seguros */

const safeInt = (v, def=0)=>{
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const safeStr = (v, def='')=>{
  if (v === null || v === undefined) return def;
  return String(v);
};
const escapeHtml = (s='')=>{
  const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' };
  return String(s).replace(/[&<>"']/g, c => map[c]);
};
const slug = (s='') => String(s)
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

/* Elimina undefined anidados para Firestore */
function sanitizeForFirestore(value){
  if (value === undefined) return null; // Nunca mandar undefined
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)){
    return value.map(v => sanitizeForFirestore(v));
  }
  if (t === 'object'){
    const out = {};
    for (const [k,v] of Object.entries(value)){
      const sv = sanitizeForFirestore(v);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  }
  return safeStr(value);
}

/* 4) Estado global */

const state = {
  menu: null,
  mode: 'mini',
  cart: [],
  customerName: '',
  orderMeta: {
    type: 'pickup',
    table: '',
    phone: '',
    payMethodPref: 'efectivo'
  },
  etaText:'7–10 min',
  etaSource:'fallback',
  themeName:'',
  // HH / subs (no-op seguros si no se usan)
  unsubHH:null,
  unsubETA:null,
  unsubTheme:null,
  unsubReady:null,
  unsubAnalytics:null,
  // Nudge bebidas
  drinkComboActive:false,
  // Regalo
  gift:{
    threshold:117,
    productId:'powerdog-mini',
    sound:null,
    autoPrompt:true,
    shownThisSession:false,
    applied:false
  },
  // identidad
  identified:false,
  identifiedAt:0,
  lastKnownPhone:'',
  lastKnownName:'',
  // tracking
  lastOrderId:null,
  lastTrackUrl:'',
  // flags
  isSubmittingOrder:false,
  adminMode:false
};

/* 5) Constantes negocio */

const DRINK_PRICE = { solo:19, combo:19 };
const CHEDDAR_UPGRADE_BASE = 7;

/* 6) Fetch catálogo */

async function fetchCatalogWithFallback(){
  try{
    const r = await fetch(DATA_MENU_URL, { cache:'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cat = await r.json();
    console.info('[kiosk] catálogo:', {
      burgers: cat?.burgers?.length||0,
      minis:   cat?.minis?.length||0,
      sides:   cat?.sides?.length||0,
      drinks:  cat?.drinks?.length||0,
      combos:  cat?.combos?.length||0
    });
    window.__CATALOG = cat;
    return cat;
  }catch(e){
    console.error('[kiosk] error catálogo', e);
    const fallback = {
      burgers:[{id:'starter',name:'Starter Burger',price:47}],
      minis:[],
      sides:[],
      drinks:[],
      combos:[]
    };
    window.__CATALOG = fallback;
    return fallback;
  }
}

/* 7) Helpers menú */

function findItemById(id){
  if (!state.menu) return null;
  return (
    state.menu.burgers?.find(b => b.id === id) ||
    state.menu.minis?.find(m => m.id === id)   ||
    state.menu.drinks?.find(d => d.id === id)  ||
    state.menu.sides?.find(s => s.id === id)   ||
    state.menu.combos?.find(c => c.id === id)  ||
    null
  );
}

function baseOfItem(item){
  if (!item) return item;
  if (item.baseOf){
    return findItemById(item.baseOf) || item;
  }
  if (item.mini && /-mini$/i.test(item.id||'')){
    const baseId = String(item.id).replace(/-mini$/i,'');
    return findItemById(baseId) || item;
  }
  return item;
}

function formatIngredientsFor(item, base){
  const meatDefaultBig  = safeInt(state.menu?.appSettings?.meatGrams, 85);
  const meatDefaultMini = safeInt(state.menu?.appSettings?.miniMeatGrams,45);
  const grams = safeInt(
    item?.meatGrams,
    item?.mini ? meatDefaultMini : meatDefaultBig
  );
  const src = (Array.isArray(item?.ingredients) && item.ingredients.length)
    ? item.ingredients
    : (base?.ingredients || []);
  return src.map(s =>
    /^Carne(\b|\s|$)/i.test(String(s))
      ? `Carne ${grams} g`
      : s
  );
}

/* Sides / sazonadores */

function isSide(item){
  if (!item) return false;
  const t = String(item.type||'').toLowerCase();
  const c = String(item.category||'').toLowerCase();
  if (t === 'side' || c === 'side') return true;
  if (/side-|papas|gajo/i.test(String(item.id||''))) return true;
  return Array.isArray(item.seasonings);
}

function normalizeSeasonings(item){
  const raw = Array.isArray(item?.seasonings) ? item.seasonings : [];
  return raw.map(x=>{
    if (typeof x === 'string'){
      return { id:slug(x), name:x, kitchen:x };
    }
    return {
      id: x.id || slug(x.name || x.kitchen || ''),
      name: x.name || x.kitchen || '',
      kitchen: x.kitchen || x.name || ''
    };
  }).filter(o => o.id && o.name);
}

function defaultSeasoning(item){
  const list = normalizeSeasonings(item);
  if (!list.length) return null;
  const salt = list.find(x =>
    /sal\b/i.test(x.name) || /sal\b/i.test(x.kitchen)
  );
  return (salt || list[0]).kitchen;
}

/* 8) HH */

function hhInfo(){
  const hh = state.menu?.happyHour || {};
  const enabled = !!hh.enabled;
  const pct = Math.max(0, Math.min(100, safeInt(hh.discountPercent))) / 100;
  const eligibleOnly = hh.applyEligibleOnly !== false;
  return { enabled, pct, eligibleOnly };
}

function hhDiscountPerUnit(item){
  const { enabled, pct, eligibleOnly } = hhInfo();
  if (!enabled || pct <= 0 || !item) return 0;
  if (item.type === 'drink' || item.type === 'combo') return 0;
  const isEligible = eligibleOnly ? (item.hhEligible !== false) : true;
  if (!isEligible) return 0;
  const unit = safeInt(item.price,0);
  return unit * pct;
}

/* 9) Icons (base + tema) */

const ICONS = {
  starter:   "../shared/img/burgers/starter.png",
  koopa:     "../shared/img/burgers/koopa.png",
  fatality:  "../shared/img/burgers/fatality.png",
  mega:      "../shared/img/burgers/mega.png",
  hadouken:  "../shared/img/burgers/hadouken.png",
  nintendo:  "../shared/img/burgers/nintendo.png",
  finalboss: "../shared/img/burgers/finalboss.png"
};
const ICONS_MEX = {
  starter:   "../shared/img/burgers_mex/starter.png",
  koopa:     "../shared/img/burgers_mex/koopa.png",
  fatality:  "../shared/img/burgers_mex/fatality.png",
  mega:      "../shared/img/burgers_mex/mega.png",
  hadouken:  "../shared/img/burgers_mex/hadouken.png",
  nintendo:  "../shared/img/burgers_mex/nintendo.png",
  finalboss: "../shared/img/burgers_mex/finalboss.png"
};
function getThemeIconFor(baseId){
  const preset = window.__lastThemePreset || {};
  const base   = preset.packBaseUrl || '';
  const map    = preset.icons || {};
  const rel    = map?.[baseId];
  if (!rel || !base) return null;
  try{
    return new URL(rel, window.location.origin + base).toString();
  }catch{
    return null;
  }
}

/* 10) Tema watcher */

function readThemeNameFromDOM(){
  const root = document.documentElement;
  const dataAttr =
    root.getAttribute('data-theme-name') ||
    root.getAttribute('data-theme') ||
    root.dataset?.themeName ||
    root.dataset?.theme || '';
  if (dataAttr) return String(dataAttr).trim();
  const cssVar = getComputedStyle(root)
    .getPropertyValue('--theme-name') || '';
  return String(cssVar).trim().replace(/^"|"$/g,'');
}

function startThemeWatcher(){
  state.themeName = readThemeNameFromDOM();
  const mo = new MutationObserver(()=>{
    const nn = readThemeNameFromDOM();
    if (nn !== state.themeName){
      state.themeName = nn;
      renderCards();
    }
  });
  mo.observe(document.documentElement, {
    attributes:true,
    attributeFilter:['data-theme','data-theme-name']
  });
  window.addEventListener('theme:changed', ()=>{
    const nn = readThemeNameFromDOM();
    if (nn !== state.themeName){
      state.themeName = nn;
      renderCards();
    }
  });
}

/* 11) Power bar + acordeón */

function powerBarHtml(icon='🍔'){
  return `
  <div class="power-bar" aria-hidden="true">
    <div class="power-icon" role="img" aria-label="icon">${icon}</div>
    <div class="power-track">
      <div class="power-fill"></div>
    </div>
  </div>`;
}

const HIGHLIGHTS = {
  starter:   'La base de todo · sencilla',
  koopa:     'Crunch dulce: piña + tocino',
  fatality:  'Picoso extremo: habanero + cheddar + tocino',
  mega:      'Cheddar cremoso + salchicha y bacon',
  hadouken:  'Doble queso + chipotle · clásico SF',
  nintendo:  'Nostalgia noventera con piña',
  finalboss: 'La más cargada · sensación de jefe final'
};

function getHighlight(item, base){
  const id = (base?.id || item?.id || '').toLowerCase();
  return item?.highlight || HIGHLIGHTS[id] || '';
}

function buildAccordionForItem(item, base){
  // combos: lista interna
  if (item?.type === 'combo'){
    const raw = Array.isArray(item.items) ? item.items : [];
    const subs = raw.map(ci=>{
      const ref = findItemById(ci.id);
      const qty = ci.qty && ci.qty > 1 ? ` ×${ci.qty}` : '';
      const inc = ref ? formatIngredientsFor(ref, baseOfItem(ref)) : [];
      return `
        <li>
          <strong>${escapeHtml(ref?.name || ci.id)}${qty}</strong>
          ${inc.length ? `<ul>${inc.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>`:''}
        </li>`;
    }).join('');
    const short = raw.slice(0,3).map(ci=>{
      const ref = findItemById(ci.id);
      const qty = ci.qty && ci.qty>1 ? ` ×${ci.qty}` : '';
      return `${escapeHtml(ref?.name || ci.id)}${qty}`;
    });
    const extra = Math.max(0, raw.length - short.length);
    return `
      <details class="ing-acc" data-acc data-id="${escapeHtml(item.id)}">
        <summary>
          <div class="k-chips">
            ${short.map(s=>`<span class="k-chip">${s}</span>`).join('')}
            ${extra>0 ? `<span class="k-chip chip-more" data-more>+${extra}</span>`:''}
          </div>
          ${getHighlight(item, base)
            ? `<div class="muted small">${escapeHtml(getHighlight(item, base))}</div>`
            : ''}
          ${powerBarHtml('⭐')}
        </summary>
        ${subs ? `<ul class="ing-list">${subs}</ul>`:''}
      </details>`;
  }

  const inc = formatIngredientsFor(item, base).filter(Boolean);
  if (!inc.length){
    return getHighlight(item, base)
      ? `<div class="muted small">${escapeHtml(getHighlight(item, base))}</div>`
      : '';
  }
  const shown = inc.slice(0,3);
  const extra = Math.max(0, inc.length - shown.length);
  return `
    <details class="ing-acc" data-acc data-id="${escapeHtml(item.id)}">
      <summary>
        <div class="k-chips">
          ${shown.map(s=>`<span class="k-chip">${escapeHtml(s)}</span>`).join('')}
          ${extra>0 ? `<span class="k-chip">+${extra}</span>`:''}
        </div>
        ${getHighlight(item, base)
          ? `<div class="muted small">${escapeHtml(getHighlight(item, base))}</div>`
          : ''}
        ${powerBarHtml(isSide(item)?'🥔':'🍔')}
      </summary>
      <ul class="ing-list">
        ${inc.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    </details>`;
}

function bindAccordionBehavior(container){
  container.addEventListener('toggle', e=>{
    const d = e.target;
    if (!d?.matches?.('details.ing-acc')) return;
    const fill = d.querySelector('.power-fill');
    if (!fill) return;
    if (d.open){
      fill.style.width = '100%';
      try{ beep(); }catch{}
    }else{
      fill.style.width = '0%';
    }
  });
}

/* 12) Bebidas / Combo Drink (VERSIÓN COMPLETA) */

function subtotalSinBebidas(cart = state.cart){
  return cart.reduce((a,l)=>{
    if (!l || l.isGift) return a;
    if (l.type === 'drink') return a;
    return a + safeInt(l.lineTotal);
  }, 0);
}

function isDrinkComboUnlocked(cart = state.cart){
  return subtotalSinBebidas(cart) >= 77;
}

function ensureDrinkPrices(cart = state.cart){
  const unlocked = isDrinkComboUnlocked(cart);
  const target = unlocked ? DRINK_PRICE.combo : DRINK_PRICE.solo;

  if (unlocked !== state.drinkComboActive){
    state.drinkComboActive = unlocked;
    if (unlocked){
      try{ playAchievement(); }catch{}
      toast('🎉 Combo Drink Seven activo: bebidas a precio combo');
    }else{
      toast('Combo Drink Seven desactivado — bebidas a $19');
    }
  }

  for (const l of cart){
    if (!l || l.type !== 'drink') continue;
    const qty = safeInt(l.qty,1);
    l.meta = l.meta || {};
    l.meta.pricingMode = unlocked ? 'combo' : 'solo';
    l.unitPrice = target;
    l.hhDisc = 0;
    l.lineTotal = qty * target;
  }
}

function findDrinkFlexible(key=''){
  const list = state.menu?.drinks || [];
  const k = String(key).toLowerCase();
  if (!k) return list[0] || null;
  let d = list.find(x => String(x.id||'').toLowerCase() === k);
  if (d) return d;
  d = list.find(x => String(x.name||'').toLowerCase().includes(k));
  return d || null;
}

function addDrinkToCart(drink){
  if (!drink) return;
  const comboOn = isDrinkComboUnlocked();
  const basePrice = safeInt(drink.price, DRINK_PRICE.solo);
  const price = comboOn ? DRINK_PRICE.combo : basePrice;

  state.cart.push({
    id: safeStr(drink.id),
    name: safeStr(drink.name),
    type:'drink',
    qty:1,
    unitPrice: basePrice,
    baseIngredients:[],
    extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null, seasoning:null, cheddarUpgrade:false },
    notes:'',
    lineTotal: price,
    hhDisc: 0,
    meta:{ pricingMode: comboOn ? 'combo' : 'solo' },
    isGift:false
  });

  ensureDrinkPrices();
  updateCartBar();
  beep(); toast(`${drink.name} agregado`);
}

function getSuggestedDrinks(max=2){
  const list = (state.menu?.drinks || [])
    .filter(d => !d.hidden);
  return list.slice(0,max);
}

function smartDrinkNudge(){
  const drinks = getSuggestedDrinks(2);
  if (!drinks.length) return;

  const existing = document.getElementById('__drinkNudge');
  if (existing) existing.remove();

  const priceTxt = isDrinkComboUnlocked()
    ? DRINK_PRICE.combo
    : DRINK_PRICE.solo;

  const box = document.createElement('div');
  box.id = '__drinkNudge';
  box.style.cssText = [
    'position:fixed',
    'left:8px',
    'bottom:8px',
    'z-index:1000',
    'background:#0f182a',
    'border:1px solid rgba(255,255,255,.12)',
    'border-radius:12px',
    'padding:8px',
    'display:flex',
    'gap:8px',
    'align-items:center'
  ].join(';');

  let btns = drinks.map((d,i)=>`
    <button class="btn tiny" data-i="${i}">
      ${escapeHtml(d.name)} $${priceTxt}
    </button>`).join('');

  btns += `<button class="btn ghost tiny" data-x="1">No</button>`;

  box.innerHTML = `
    <span class="muted small" style="white-space:nowrap">¿Bebida?</span>
    ${btns}
  `;
  document.body.appendChild(box);

  box.onclick = ev=>{
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.x){
      box.remove();
      return;
    }
    const idx = Number(b.dataset.i);
    const d = drinks[idx];
    if (d) addDrinkToCart(d);
    box.remove();
  };

  setTimeout(()=>{ try{ box.remove(); }catch{} }, 5000);
}

/* 13) Tabs */

document.getElementById('btnMinis')?.addEventListener('click', ()=> setMode('mini'));
document.getElementById('btnBig')?.addEventListener('click', ()=> setMode('big'));
document.getElementById('btnPapas')?.addEventListener('click', ()=> setMode('papas'));

function setMode(mode){
  state.mode = mode;
  renderCards();
  setActiveTab(mode);
}

function setActiveTab(mode=state.mode){
  const ids = ['btnMinis','btnBig','btnPapas','btnCombos','btnDrinks'];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    const active =
      (mode === 'mini'   && id==='btnMinis')  ||
      (mode === 'big'    && id==='btnBig')    ||
      (mode === 'papas'  && id==='btnPapas')  ||
      (mode === 'combos' && id==='btnCombos') ||
      (mode === 'drinks' && id==='btnDrinks');
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-selected', active ? 'true':'false');
  });
}

function enableCombosTab(){
  const has = Array.isArray(state.menu?.combos) && state.menu.combos.length;
  if (!has) return;
  if (document.getElementById('btnCombos')) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar) return;
  const b = document.createElement('button');
  b.id = 'btnCombos';
  b.className = 'btn tab';
  b.textContent = 'Combos';
  b.addEventListener('click',()=> setMode('combos'));
  bar.appendChild(b);
}
function enableDrinksTab(){
  const has = Array.isArray(state.menu?.drinks) && state.menu.drinks.length;
  if (!has) return;
  if (document.getElementById('btnDrinks')) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar) return;
  const b = document.createElement('button');
  b.id='btnDrinks';
  b.className='btn tab';
  b.textContent='Bebidas';
  b.addEventListener('click',()=> setMode('drinks'));
  bar.appendChild(b);
}
function enablePapasTab(){
  const has = Array.isArray(state.menu?.sides) && state.menu.sides.length;
  if (!has) return;
  if (document.getElementById('btnPapas')) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar) return;
  const b = document.createElement('button');
  b.id='btnPapas';
  b.className='btn tab';
  b.textContent='Papas';
  b.addEventListener('click',()=> setMode('papas'));
  const btnDr = document.getElementById('btnDrinks');
  if (btnDr) bar.insertBefore(b, btnDr);
  else bar.appendChild(b);
}

/* 14) Render cards */

function qtyInCart(id){
  return state.cart
    .filter(l => l && l.id === id && !l.isGift)
    .reduce((a,l)=> a + safeInt(l.qty,1), 0);
}

function renderCards(){
  const grid = document.getElementById('cards');
  if (!grid || !state.menu) return;
  grid.innerHTML = '';

  let items;
  if (state.mode === 'mini')        items = state.menu.minis  || [];
  else if (state.mode === 'big')    items = state.menu.burgers|| [];
  else if (state.mode === 'papas')  items = state.menu.sides  || [];
  else if (state.mode === 'combos') items = state.menu.combos || [];
  else if (state.mode === 'drinks') items = state.menu.drinks || [];
  else                              items = state.menu.minis  || [];

  items.forEach(it=>{
    const base   = baseOfItem(it);
    const rawId  = it.id || '';
    const baseId = (base?.id) ||
      (it.mini && /-mini$/i.test(rawId)
        ? rawId.replace(/-mini$/i,'')
        : rawId);

    const mxOn   = /independencia|méx|mex|patria|viva/i.test(state.themeName||'');
    const themedSrc = getThemeIconFor(baseId);
    const iconSrc =
      it.icon ||
      themedSrc ||
      ((mxOn && ICONS_MEX[baseId]) ? ICONS_MEX[baseId] : (ICONS[baseId] || null));

    const card = document.createElement('div');
    card.className = 'card';

    const isCombo = it.type === 'combo';
    const isDrink = it.type === 'drink' || (state.mode === 'drinks');
    const isSideItem = isSide(it);

    const disc = (!isDrink && !isCombo) ? hhDiscountPerUnit(it) : 0;
    const eff  = (!isDrink && !isCombo)
      ? Math.max(0, safeInt(it.price) - disc)
      : safeInt(it.price, DRINK_PRICE.solo);

    const selQty = qtyInCart(it.id);
    const selBadge = selQty > 0
      ? `<span class="tag" data-sel>×${selQty} en pedido</span>`
      : '';

    const showPrice = isCombo ? safeInt(it.price, eff) : eff;

    const priceHtml = (!isDrink && !isCombo && disc > 0)
      ? `<div class="price"><s>${'$'+safeInt(it.price)}</s> <span class="tag">${'$'+eff}</span> ${selBadge}</div>`
      : `<div class="price">${'$'+showPrice} ${selBadge}</div>`;

    const actionsHtml = isDrink
      ? `<button class="btn small" data-a="drinkAdd">Agregar</button>`
      : `${
           isCombo
             ? ''
             : `<button class="btn small ghost" data-a="custom">Personalizar</button>`
         }
         <button class="btn small" data-a="${isCombo?'order':'quick'}">
           ${isCombo ? 'Ordenar combo' : 'Ordenar rápido'}
         </button>`;

    const mediaImg = iconSrc
      ? `<img src="${iconSrc}" alt="${escapeHtml(it.name)}" class="icon-img" loading="lazy">`
      : `<div class="icon" aria-hidden="true"></div>`;

    card.innerHTML = `
      <h3>${escapeHtml(it.name)}</h3>
      <div class="media">${mediaImg}</div>
      ${buildAccordionForItem(it, base)}
      <div class="row">
        ${priceHtml}
        <div class="row">${actionsHtml}</div>
      </div>
    `;

    grid.appendChild(card);

    if (selQty > 0){
      card.classList.add('is-selected');
      const fill = card.querySelector('.power-fill');
      if (fill) fill.style.width = '100%';
    }

    card.querySelector('[data-more]')?.addEventListener('click', ev=>{
      ev.preventDefault();
      openItemModal(it, base);
    });

    if (isCombo){
      card.querySelector('[data-a="order"]')?.addEventListener('click', async ()=>{
        const ok = await ensureCustomerIdentified(state.orderMeta.type);
        if (!ok) return;
        addComboToCart(it);
      });
    }else if (isDrink){
      card.querySelector('[data-a="drinkAdd"]')?.addEventListener('click', async ()=>{
        const ok = await ensureCustomerIdentified(state.orderMeta.type);
        if (!ok) return;
        addDrinkToCart(it);
      });
    }else{
      card.querySelector('[data-a="custom"]')?.addEventListener('click', async ()=>{
        if (!state.identified) await ensureCustomerIdentified(state.orderMeta.type);
        openItemModal(it, base);
      });
      card.querySelector('[data-a="quick"]')?.addEventListener('click', async ()=>{
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

/* 15) Quick add / combos */

async function addQuickItem(item, base){
  const ok = await ensureCustomerIdentified(state.orderMeta.type);
  if (!ok) return;

  const d = hhDiscountPerUnit(item);
  const unit = Math.max(0, safeInt(item.price) - d);

  let seasoning = null;
  if (isSide(item)) seasoning = defaultSeasoning(item);

  state.cart.push({
    id:item.id,
    name:item.name,
    mini:!!item.mini,
    qty:1,
    unitPrice:safeInt(item.price),
    baseIngredients: formatIngredientsFor(item, base),
    ingredients:     formatIngredientsFor(item, base),
    salsaDefault: base?.salsaDefault || base?.suggested || null,
    salsaCambiada:null,
    extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null, seasoning },
    notes:'',
    lineTotal:unit,
    hhDisc:d,
    type:isSide(item)?'side':null,
    isGift:false
  });

  ensureDrinkPrices();
  updateCartBar();
  beep(); toast(`${item.name} agregado`);
  smartDrinkNudge();
}

async function addComboToCart(combo){
  const ok = await ensureCustomerIdentified(state.orderMeta.type);
  if (!ok) return;
  try{
    const items = [];
    if (Array.isArray(combo.items)){
      for (const ci of combo.items){
        const ref = findItemById(ci.id);
        items.push({
          kind: ci.kind || (ref?.mini ? 'mini' : (isSide(ref)?'side':'burger')),
          id: ci.id,
          qty: safeInt(ci.qty,1),
          name: ref?.name || ci.id,
          grams: ci.grams || null,
          seasoning: ci.seasoningId || null,
          sauce: ci.sauce || null
        });
      }
    }
    const unitPrice = safeInt(combo.price,0);
    const line = {
      id: combo.id,
      name: combo.name,
      type:'combo',
      qty:1,
      unitPrice,
      lineTotal:unitPrice,
      hhDisc:0,
      items,
      extras:{ cheddarUpgrade:false },
      notes:'',
      isGift:false
    };
    state.cart.push(line);
    ensureDrinkPrices();
    updateCartBar();
    beep(); toast(`${combo.name} agregado`);
  }catch(e){
    console.warn('addComboToCart fail', e);
    toast('No pude agregar el combo');
  }
}

/* 16) Modal producto (versión compacta segura) */

function openItemModal(item, base){
  // Para tu versión real puedes reinyectar tu modal completo.
  // Esta versión mínima evita errores si el HTML no está.
  const modal = document.getElementById('modal');
  if (!modal) return;
  const body  = modal.querySelector('.modal-body');
  const title = modal.querySelector('.modal-title');
  const btn   = modal.querySelector('[data-a="addToCart"]');
  if (title) title.textContent = item.name;
  if (body){
    body.innerHTML = `
      <p class="muted small">Personaliza tu ${escapeHtml(item.name)}.</p>
      <p class="muted small">(Configurador completo pendiente en esta build.)</p>
    `;
  }
  if (btn){
    btn.onclick = async ()=>{
      await addQuickItem(item, base);
      closeModal(modal);
    };
  }
  modal.classList.add('open');
}
function closeModal(m){ m?.classList?.remove('open'); }
document.querySelectorAll('[data-close-modal]')
  ?.forEach(b=> b.addEventListener('click',()=> closeModal(b.closest('.modal'))));

/* 17) Carrito */

const cartBar = document.getElementById('cartBar');
document.getElementById('openCart')?.addEventListener('click', openCartModal);

function updateCartBar(){
  ensureDrinkPrices();
  const count = state.cart.reduce((a,l)=> a + safeInt(l.qty,1), 0);
  const total = state.cart.reduce((a,l)=> a + safeInt(l.lineTotal,0), 0);

  const countEl = document.getElementById('cartCount');
  if (countEl) countEl.textContent = String(count);
  const totalEl = document.getElementById('cartBarTotal');
  if (totalEl) totalEl.textContent = '$' + total;

  if (cartBar) cartBar.style.display = count>0 ? 'flex' : 'none';
  document.body.classList.toggle('has-cart', count>0);

  checkGiftUnlock();
  paintIdentityBadge();
}

function checkGiftUnlock(){
  const unlocked = subtotalSinBebidas() >= state.gift.threshold;
  state.giftUnlocked = unlocked;
}

/* Identidad badge */

function paintIdentityBadge(){
  let b = document.getElementById('idBadge');
  if (!b){
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

/* Modal carrito mínimo */

function openCartModal(){
  const m = document.getElementById('cartModal');
  if (!m) return;
  const body = m.querySelector('#cartBody');
  if (!body) return;

  const rows = state.cart.map((l,i)=>`
    <div class="row" data-i="${i}">
      <div class="ellipsis">
        ${escapeHtml(l.name)} ×${safeInt(l.qty,1)}
      </div>
      <div class="right">$${safeInt(l.lineTotal,0)}</div>
    </div>
  `).join('') || '<p class="muted small">Tu carrito está vacío.</p>';

  body.innerHTML = rows;

  const totEl = document.getElementById('cartTotalFooter');
  if (totEl){
    const total = state.cart.reduce((a,l)=> a + safeInt(l.lineTotal,0), 0);
    totEl.textContent = '$' + total;
  }

  const btn = m.querySelector('[data-a="submitOrder"]');
  if (btn){
    btn.onclick = submitOrder;
  }

  m.classList.add('open');
}

/* 18) Crear pedido (Firebase-safe) */

function makeTrackUrl(oid){
  return `${TRACK_PAGE_PATH}?oid=${encodeURIComponent(oid)}&gamify=1&autostart=1`;
}

function updateSubmitButtonState(loading){
  const btn = document.querySelector('#cartModal [data-a="submitOrder"]');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Enviando…' : 'Confirmar pedido';
}

async function submitOrder(){
  if (state.isSubmittingOrder) return;
  if (!state.cart.length){
    toast('Tu carrito está vacío');
    return;
  }

  state.isSubmittingOrder = true;
  updateSubmitButtonState(true);

  try{
    const ts = Date.now();

    const items = state.cart.map(l => ({
      id: safeStr(l.id),
      name: safeStr(l.name),
      qty: safeInt(l.qty,1),
      type: l.type || null,
      mini: !!l.mini,
      unitPrice: safeInt(l.unitPrice,0),
      lineTotal: safeInt(l.lineTotal,0),
      hhDisc: safeInt(l.hhDisc,0),
      extras: l.extras || {},
      notes: safeStr(l.notes || ''),
      isGift: !!l.isGift
    }));

    const total = items.reduce((a,l)=> a + safeInt(l.lineTotal,0), 0);
    const hhTotalDiscount = items.reduce((a,l)=> a + safeInt(l.hhDisc,0), 0);

    const orderDocRaw = {
      createdAt: ts,
      updatedAt: ts,
      status: 'pending',
      source: 'kiosk',
      kioskMode: 'v2',
      // cliente
      customerName: safeStr(
        state.customerName || state.lastKnownName || 'Cliente'
      ),
      phone: safeStr(state.orderMeta.phone || state.lastKnownPhone || ''),
      type: state.orderMeta.type || 'pickup',
      table: safeStr(state.orderMeta.table || ''),
      payMethodPref: state.orderMeta.payMethodPref || 'efectivo',
      // totales
      items,
      total,
      hhTotalDiscount,
      gift: state.giftUnlocked ? {
        productId: safeStr(state.gift.productId),
        applied: !!state.gift.applied
      } : null,
      etaText: safeStr(state.etaText || ''),
      theme: safeStr(state.themeName || ''),
      trackAllowed: true
    };

    const orderDoc = sanitizeForFirestore(orderDocRaw);

    const oid = await DB.createOrder(orderDoc);
    console.info('[kiosk] order created', oid);

    state.lastOrderId = oid;
    state.lastTrackUrl = makeTrackUrl(oid);
    const url = state.lastTrackUrl;

    state.cart = [];
    updateCartBar();

    showTrackModal(url);
  }catch(err){
    console.error('createOrder error', err);
    toast('No pude enviar tu pedido. Intenta de nuevo.');
  }finally{
    state.isSubmittingOrder = false;
    updateSubmitButtonState(false);
  }
}

/* Track-modal simple */

function showTrackModal(url){
  const m = document.getElementById('trackModal') || document.getElementById('cartModal');
  if (!m) {
    alert('Pedido enviado. Seguimiento: ' + url);
    return;
  }
  const linkBox = m.querySelector('[data-track-link]');
  if (linkBox){
    linkBox.value = location.origin + url;
  }
  const btnOpen = m.querySelector('[data-a="openTrack"]');
  if (btnOpen){
    btnOpen.onclick = ()=> {
      window.open(url, '_blank');
    };
  }
  m.classList.add('open');
}

/* 19) Identidad básica */

async function ensureCustomerIdentified(type='pickup'){
  if (state.identified && state.orderMeta.phone) return true;
  try{
    const storedPhone = localStorage.getItem('kiosk:phone') || '';
    const storedName  = localStorage.getItem('kiosk:name') || '';
    if (storedPhone){
      state.orderMeta.phone = storedPhone;
      state.customerName = storedName || 'Cliente';
      state.identified = true;
      paintIdentityBadge();
      return true;
    }
  }catch{}
  // Si no hay form de identidad, asumimos ok para no bloquear flujo en test
  state.identified = true;
  paintIdentityBadge();
  return true;
}

/* 20) Hooks vacíos seguros (HH, ETA, analytics, gift modal) */

function bindHappyHour(){}
function bindETA(){}
function startOrdersAnalytics(){}
function ensureTrackPrompt(){}
function ensureGiftModal(){}

/* 21) Init */

init();

async function init(){
  try{
    await ensureAuth();
  }catch(e){
    console.warn('Anon auth fail', e);
  }

  try{
    state.customerName = localStorage.getItem('kiosk:name') || '';
    state.orderMeta.phone = localStorage.getItem('kiosk:phone') || '';
    if (state.orderMeta.phone){
      state.identified = true;
      state.lastKnownPhone = state.orderMeta.phone;
      state.lastKnownName  = state.customerName;
    }
  }catch{}

  state.menu = await fetchCatalogWithFallback();

  startThemeWatcher();
  ensureDrinkPrices();
  renderCards();
  setActiveTab('mini');
  updateCartBar();

  bindHappyHour();
  bindETA();
  startOrdersAnalytics();
  ensureTrackPrompt();
  ensureGiftModal();
  paintIdentityBadge();

  if (state.unsubTheme){
    try{ state.unsubTheme(); }catch{}
    state.unsubTheme = null;
  }
  state.unsubTheme = initThemeFromSettings({ defaultName:'Base' });

  if (sessionStorage.getItem('kioskAdmin') === '1'){
    state.adminMode = true;
  }

  console.info('[kiosk] init done');
}

/* 22) Limpieza */

window.addEventListener('beforeunload', ()=>{
  try{
    state.unsubHH?.();
    state.unsubETA?.();
    state.unsubTheme?.();
    state.unsubReady?.();
    state.unsubAnalytics?.();
  }catch{}
});
