// Seven — Kiosko V2 (lean compat) · 2025-11-08
// - Compatible con cocina/track V2 (namespace v2)
// - Usa shared/db.js, firebase.js, theme.js existentes
// - Tabs Minis / Big / Papas / Bebidas
// - Carrito + modal confirmación + tracking
// - Seguro si faltan partes del HTML (no rompe)

// ======================= Rutas base ===========================
const __parts = location.pathname.split('/').filter(Boolean);
// ej: /prueba/v2/kiosk/index.html  → ["prueba","v2","kiosk","index.html"]
// menú está en /prueba/v2/data/menu.json
const __baseIndex = __parts.indexOf('v2');
const __root = __baseIndex >= 0
  ? '/' + __parts.slice(0, __baseIndex + 1).join('/') + '/'
  : '/';
export const DATA_MENU_URL = `${__root}data/menu.json`;
console.info('[kiosk] DATA_MENU_URL =', DATA_MENU_URL);

const appMsg = document.getElementById('appMsg') || document.getElementById('app');
if (appMsg) appMsg.textContent = 'App.js cargado — iniciando módulos…';

// ======================= Imports ==============================
import { beep, toast } from '../shared/notify.js?v=20251106a';
import * as DB from '../shared/db.js?v=20251106a';
import { ensureAuth } from '../shared/firebase.js?v=20251106a';
import { initThemeFromSettings } from '../shared/theme.js?v=20251106a';

// ======================= Estado global ========================
const state = {
  menu: null,
  mode: 'mini',
  cart: [],
  // identidad / meta
  customerName: '',
  orderMeta: {
    type: 'pickup',   // pickup | online (se ajusta por query)
    table: '',
    phone: '',
    payMethodPref: 'efectivo'
  },
  // subs
  unsubHH: null,
  unsubETA: null,
  unsubTheme: null,
  unsubReady: null,
  unsubAnalytics: null,
  // UI
  etaText: '7–10 min',
  etaSource: 'fallback',
  hhLeftText: '',
  themeName: '',
  // perks
  drinkComboActive: false,
  rewards: { type:null, discountCents:0, miniDog:false, decided:false },
  gift: {
    threshold: 117,
    productId: 'powerdog-mini',
    sound: null,
    autoPrompt: true,
    shownThisSession: false
  },
  // tracking
  lastOrderId: null,
  lastTrackUrl: '',
  // flags
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

// ======================= Constantes negocio ===================
const DRINK_PRICE = { solo: 19, combo: 19 };
const CHEDDAR_UPGRADE_BASE = 7;

// ======================= Helpers base =========================
const money = (n) => '$' + Number(n ?? 0).toFixed(0);

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
      minis:[], sides:[], drinks:[], combos:[]
    };
    window.__CATALOG = fallback;
    return fallback;
  }
}

function slug(s){
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function findItemById(id){
  return state.menu?.burgers?.find?.(b=>b.id===id)
      || state.menu?.minis?.find?.(m=>m.id===id)
      || state.menu?.drinks?.find?.(d=>d.id===id)
      || state.menu?.sides?.find?.(s=>s.id===id)
      || state.menu?.combos?.find?.(c=>c.id===id)
      || null;
}

function baseOfItem(item){
  if (!item) return item;
  if (item.baseOf) {
    return state.menu?.burgers?.find?.(b=>b.id===item.baseOf) || item;
  }
  if (item.mini && /-mini$/i.test(item.id||'')){
    const baseId = String(item.id).replace(/-mini$/i,'');
    return state.menu?.burgers?.find?.(b=>b.id===baseId) || item;
  }
  return item;
}

function formatIngredientsFor(item, base){
  const meatDefaultBig  = Number(state.menu?.appSettings?.meatGrams ?? 85);
  const meatDefaultMini = Number(state.menu?.appSettings?.miniMeatGrams ?? 45);
  const grams = Number(item?.meatGrams ?? (item?.mini ? meatDefaultMini : meatDefaultBig));
  const src = (Array.isArray(item?.ingredients) && item.ingredients.length)
    ? item.ingredients : (base?.ingredients || []);
  return src.map(s => /^Carne(\b|\s|$)/i.test(String(s)) ? `Carne ${grams} g` : s );
}

function escapeHtml(s = '') {
  const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  return String(s).replace(/[&<>"']/g, ch => map[ch]);
}

function getCheddarUpgradePrice(){
  const fromMenu = Number(state.menu?.extras?.sideCheddarUpgradePrice ?? state.menu?.extras?.cheddarUpgradePrice);
  return Number.isFinite(fromMenu) && fromMenu > 0 ? fromMenu : CHEDDAR_UPGRADE_BASE;
}

// ======================= Sides / sazonadores ==================
function isSide(item){
  if (!item) return false;
  if (String(item.type||'').toLowerCase()==='side') return true;
  if (String(item.category||'').toLowerCase()==='side') return true;
  return /side-|papas|gajo/i.test(String(item.id||'')) || Array.isArray(item.seasonings);
}
function normalizeSeasonings(item){
  const raw = Array.isArray(item?.seasonings) ? item.seasonings : [];
  return raw.map(x=>{
    if (typeof x === 'string') return { id: slug(x), name: x, kitchen: x };
    return {
      id: x.id || slug(x.name || x.kitchen || ''),
      name: x.name || x.kitchen || '',
      kitchen: x.kitchen || x.name || ''
    };
  }).filter(o=>o.id && o.name);
}
function defaultSeasoning(item){
  const list = normalizeSeasonings(item);
  if (!list.length) return null;
  const salt = list.find(x => /sal\b/i.test(x.name) || /sal\b/i.test(x.kitchen));
  return (salt || list[0]).kitchen;
}

// ======================= Highlights ===========================
const HIGHLIGHTS = {
  starter:   'La base de todo · sencilla',
  koopa:     'Crunch dulce: piña + tocino',
  fatality:  'Picoso extremo: habanero + cheddar + tocino',
  mega:      'Cheddar cremoso + salchicha y bacon',
  hadouken:  'Doble queso + chipotle · clásico SF',
  nintendo:  'Nostalgia noventera con piña',
  finalboss: 'La más cargada · jefe final'
};
function getHighlight(item, base){
  const id = (base?.id || item?.id || '').toLowerCase();
  return item?.highlight || HIGHLIGHTS[id] || '';
}

// ======================= Power bar & acordeón =================
function powerBarHtml(icon='🍔'){
  return `
  <div class="power-bar" aria-hidden="true">
    <div class="power-icon" role="img" aria-label="icon">${icon}</div>
    <div class="power-track">
      <div class="power-fill"></div>
    </div>
  </div>`;
}

function buildAccordionForItem(item, base){
  // combos
  if (item?.type === 'combo'){
    const rawItems = Array.isArray(item.items) ? item.items : [];
    const subs = rawItems.map(it=>{
      const ref = findItemById(it.id);
      const qty = it.qty && it.qty>1 ? ` ×${it.qty}` : '';
      const inc = ref ? formatIngredientsFor(ref, baseOfItem(ref)) : [];
      return `
      <li>
        <strong>${escapeHtml(ref?.name || it.id)}${qty}</strong>
        ${inc?.length ? `<ul>${inc.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ``}
      </li>`;
    }).join('');

    const short = rawItems.slice(0,3).map(it=>{
      const ref = findItemById(it.id);
      const qty = it.qty && it.qty>1 ? ` ×${it.qty}` : '';
      return `${escapeHtml(ref?.name || it.id)}${qty}`;
    });
    const extra = Math.max(0, rawItems.length - short.length);

    return `
    <details class="ing-acc" data-acc data-id="${escapeHtml(item.id)}">
      <summary class="ing-head">
        <div class="k-chips">
          ${short.map(s=>`<span class="k-chip">${s}</span>`).join('')}
          ${extra>0 ? `<span class="k-chip chip-more" data-more>+${extra}</span>` : ``}
        </div>
        ${getHighlight(item, base) ? `<div class="muted small">${escapeHtml(getHighlight(item, base))}</div>`:''}
        ${powerBarHtml('⭐')}
      </summary>
      ${subs ? `<ul class="ing-list">${subs}</ul>` : ``}
    </details>`;
  }

  const inc = formatIngredientsFor(item, base).filter(Boolean);
  if (!inc.length) {
    return getHighlight(item, base)
      ? `<div class="muted small small">${escapeHtml(getHighlight(item, base))}</div>`
      : '';
  }

  const shown = inc.slice(0,3);
  const extra = Math.max(0, inc.length - shown.length);

  return `
  <details class="ing-acc" data-acc data-id="${escapeHtml(item.id)}">
    <summary class="ing-head">
      <div class="k-chips" aria-label="Incluye">
        ${shown.map(s=>`<span class="k-chip">${escapeHtml(s)}</span>`).join('')}
        ${extra>0 ? `<span class="k-chip">+${extra}</span>`: ``}
      </div>
      ${getHighlight(item, base) ? `<div class="muted small">${escapeHtml(getHighlight(item, base))}</div>`:''}
      ${powerBarHtml(isSide(item)?'🥔':'🍔')}
    </summary>
    <ul class="ing-list">
      ${inc.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}
    </ul>
  </details>`;
}

function bindAccordionBehavior(container){
  container.addEventListener('toggle', (e)=>{
    const d = e.target;
    if (!d?.matches?.('details.ing-acc')) return;
    const fill = d.querySelector('.power-fill');
    if (!fill) return;
    if (d.open){ fill.style.width = '100%'; try{ beep(); }catch{} }
    else { fill.style.width = '0%'; }
  });
}

// ======================= Bebidas / Combo Drink =================
function subtotalSinBebidas(cart = state.cart){
  return cart.reduce((a,l)=>{
    if (!l || l.isGift) return a;
    if (l.type === 'drink') return a;
    return a + Number(l.lineTotal||0);
  }, 0);
}
function isDrinkComboUnlocked(cart = state.cart){
  return subtotalSinBebidas(cart) >= 77;
}
function ensureDrinkPrices(cart = state.cart){
  const unlocked = isDrinkComboUnlocked(cart);
  const target   = unlocked ? DRINK_PRICE.combo : DRINK_PRICE.solo;

  if (unlocked !== state.drinkComboActive){
    state.drinkComboActive = unlocked;
    if (unlocked) { try{ playAchievement(); }catch{} toast('🎉 Combo Drink Seven activo'); }
    else { toast('Combo Drink Seven desactivado'); }
  }
  for (const l of cart){
    if (l?.type === 'drink'){
      l.meta = l.meta || {};
      l.meta.pricingMode = unlocked ? 'combo' : 'solo';
      l.lineTotal = target * (l.qty||1);
      l.hhDisc = 0;
    }
  }
}

function findDrinkFlexible(key=''){
  const list = state.menu?.drinks || [];
  const k = String(key).toLowerCase();
  let d = list.find(x => String(x.id||'').toLowerCase() === k);
  if (d) return d;
  d = list.find(x => String(x.name||'').toLowerCase().includes(k));
  return d || null;
}
function addDrinkToCart(drink){
  if (!drink) return;
  const comboOn = isDrinkComboUnlocked();
  const price = comboOn ? DRINK_PRICE.combo : DRINK_PRICE.solo;
  state.cart.push({
    id: drink.id,
    name: drink.name,
    type:'drink',
    qty:1,
    unitPrice: Number(drink.price||price),
    baseIngredients:[],
    extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
    notes:'',
    lineTotal: price,
    hhDisc: 0,
    meta:{ pricingMode: comboOn ? 'combo' : 'solo' }
  });
  ensureDrinkPrices();
  updateCartBar();
  beep(); toast(`${drink.name} agregado`);
}
function addDrinkByKey(key){
  const d = findDrinkFlexible(key);
  if (!d) { toast('Bebida no disponible'); return; }
  addDrinkToCart(d);
}

// ======================= Happy Hour ===========================
function hhInfo(){
  const hh = state.menu?.happyHour || {};
  const enabled = !!hh.enabled;
  const pct = Math.max(0, Math.min(100, Number(hh.discountPercent||0))) / 100;
  const eligibleOnly = hh.applyEligibleOnly !== false;
  return { enabled, pct, eligibleOnly };
}
function hhDiscountPerUnit(item){
  const { enabled, pct, eligibleOnly } = hhInfo();
  if (!enabled || pct<=0) return 0;
  if (!item) return 0;
  if (item.type === 'drink' || item.type === 'combo') return 0;
  const isEligible = eligibleOnly ? (item.hhEligible !== false) : true;
  if (!isEligible) return 0;
  const unit = Number(item.price || 0);
  return unit * pct;
}

// ======================= Iconos ================================
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
  try { return new URL(rel, window.location.origin + base).toString(); }
  catch { return null; }
}

// ======================= Tema watcher =========================
function readThemeNameFromDOM(){
  const root = document.documentElement;
  const dataAttr = root.getAttribute('data-theme-name')
    || root.getAttribute('data-theme')
    || root.dataset?.themeName
    || root.dataset?.theme
    || '';
  if (dataAttr) return String(dataAttr).trim();
  const cssVar = getComputedStyle(root).getPropertyValue('--theme-name') || '';
  return String(cssVar).trim().replace(/^"|"$/g,'');
}
function startThemeWatcher(){
  state.themeName = readThemeNameFromDOM();
  const mo = new MutationObserver(()=>{
    const newName = readThemeNameFromDOM();
    if (newName !== state.themeName){
      state.themeName = newName;
      renderCards();
    }
  });
  mo.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme','data-theme-name'] });
  window.addEventListener('theme:changed', ()=>{
    const newName = readThemeNameFromDOM();
    if (newName !== state.themeName){
      state.themeName = newName;
      renderCards();
    }
  });
}

// ======================= Audio SFX ============================
let achievementAudio = null;
try{
  // si agregas archivo real, ponlo:
  // achievementAudio = new Audio('../shared/sfx/achievement.mp3');
}catch{}
async function playAchievement(){
  try{
    if (achievementAudio){ await achievementAudio.play(); return; }
  }catch{}
  beep();
}
let giftAudio = null;
try{
  if (state.gift.sound) giftAudio = new Audio(state.gift.sound);
}catch{}
async function playGiftSfx(){
  try{
    if (giftAudio){ await giftAudio.play(); return; }
  }catch{}
  beep();
}

// ======================= Tabs ================================
document.getElementById('btnMinis')?.addEventListener('click', ()=> setMode('mini'));
document.getElementById('btnBig')?.addEventListener('click',  ()=> setMode('big'));
document.getElementById('btnPapas')?.addEventListener('click',()=> setMode('papas'));
document.getElementById('btnDrinks')?.addEventListener('click',()=> setMode('drinks'));

function setMode(mode){
  state.mode = mode;
  renderCards();
  setActiveTab(mode);
}

function setActiveTab(mode=state.mode){
  const btnMinis  = document.getElementById('btnMinis');
  const btnBig    = document.getElementById('btnBig');
  const btnPapas  = document.getElementById('btnPapas');
  const btnDrinks = document.getElementById('btnDrinks');
  const all = [btnMinis,btnBig,btnPapas,btnDrinks].filter(Boolean);
  const on  = el => { el.classList.add('is-active'); el.setAttribute('aria-selected','true'); };
  const off = el => { el.classList.remove('is-active'); el.setAttribute('aria-selected','false'); };
  all.forEach(off);
  if (mode==='mini') on(btnMinis);
  else if (mode==='big') on(btnBig);
  else if (mode==='papas') on(btnPapas);
  else if (mode==='drinks') on(btnDrinks);
}

function enablePapasTab(){
  if (!Array.isArray(state.menu?.sides) || !state.menu.sides.length) return;
  if (document.getElementById('btnPapas')) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar) return;
  const btn = document.createElement('button');
  btn.id = 'btnPapas';
  btn.className = 'btn tab';
  btn.textContent = 'Papas';
  btn.addEventListener('click', ()=> setMode('papas'));
  bar.appendChild(btn);
}

function enableDrinksTab(){
  if (!Array.isArray(state.menu?.drinks) || !state.menu.drinks.length) return;
  if (document.getElementById('btnDrinks')) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar) return;
  const btn = document.createElement('button');
  btn.id = 'btnDrinks';
  btn.className = 'btn tab';
  btn.textContent = 'Bebidas';
  btn.addEventListener('click', ()=> setMode('drinks'));
  bar.appendChild(btn);
}

// ======================= Render tarjetas ======================
function qtyInCart(id){
  return state.cart
    .filter(l => l && l.id === id && !l.isGift)
    .reduce((a,l)=> a + (l.qty||1), 0);
}

function renderCards(){
  const grid = document.getElementById('cards');
  if (!grid || !state.menu) return;
  grid.innerHTML = '';

  let items;
  if (state.mode === 'mini')        items = state.menu?.minis || [];
  else if (state.mode === 'big')    items = state.menu?.burgers || [];
  else if (state.mode === 'papas')  items = state.menu?.sides || [];
  else if (state.mode === 'drinks') items = state.menu?.drinks || [];
  else                              items = state.menu?.minis || [];

  items.forEach(it=>{
    const base   = baseOfItem(it);
    const rawId  = it.id || '';
    const baseId = (base?.id)
      || (it.mini && /-mini$/i.test(rawId) ? rawId.replace(/-mini$/i,'') : rawId);

    const mxOn   = /independencia|méx|mex|patria|viva/i.test(String(state.themeName||''));
    const themedSrc = getThemeIconFor(baseId);
    const iconSrc = it.icon
      || themedSrc
      || ((mxOn && ICONS_MEX[baseId]) ? ICONS_MEX[baseId] : (ICONS[baseId] || null));

    const card = document.createElement('div');
    card.className = 'card';

    const isCombo = it.type === 'combo';
    const isDrink = it.type === 'drink' || (state.mode==='drinks');
    const isSideItem = isSide(it);

    const disc = (!isDrink && !isCombo) ? hhDiscountPerUnit(it) : 0;
    const eff  = (!isDrink && !isCombo)
      ? Math.max(0, Number(it.price || 0) - disc)
      : Number(it.price ?? DRINK_PRICE.solo);

    const qSel = qtyInCart(it.id);
    const selectedBadge = qSel > 0 ? `<span class="tag" data-sel>×${qSel} en pedido</span>` : '';

    const showPrice = isCombo ? Number(it.price || eff) : eff;

    const priceHtml = (!isDrink && !isCombo && disc > 0)
      ? `<div class="price"><s>${money(it.price)}</s> <span class="tag">${money(eff)}</span> ${selectedBadge}</div>`
      : `<div class="price">${money(showPrice)} ${selectedBadge}</div>`;

    const actionsHtml = isDrink
      ? `<button class="btn small" data-a="drinkAdd">Agregar</button>`
      : `<button class="btn small ghost" data-a="custom">Personalizar</button>
         <button class="btn small" data-a="quick">Ordenar rápido</button>`;

    const mediaImg = iconSrc
      ? `<img src="${iconSrc}" alt="${escapeHtml(it.name)}" class="icon-img" loading="lazy"/>`
      : `<div class="icon" aria-hidden="true"></div>`;

    card.innerHTML = `
      <h3>${escapeHtml(it.name)}</h3>
      <div class="media">${mediaImg}</div>
      ${buildAccordionForItem(it, base)}
      <div class="row">
        ${priceHtml}
        <div class="row">
          ${actionsHtml}
        </div>
      </div>
    `;
    grid.appendChild(card);

    if (qSel > 0) {
      card.classList.add('is-selected');
      const fill = card.querySelector('.power-fill');
      if (fill) fill.style.width = '100%';
    }

    card.querySelector('[data-more]')?.addEventListener('click', (ev)=>{
      ev.preventDefault();
      openItemModal(it, base);
    });

    if (isDrink){
      card.querySelector('[data-a="drinkAdd"]')?.addEventListener('click', async ()=>{
        const okId = await ensureCustomerIdentified(state.orderMeta.type);
        if (!okId) return;
        addDrinkToCart(it);
      });
    } else {
      card.querySelector('[data-a="custom"]')?.addEventListener('click', async ()=>{
        if (!state.identified) { await ensureCustomerIdentified(state.orderMeta.type); }
        openItemModal(it, base);
      });
      card.querySelector('[data-a="quick"]')?.addEventListener('click', async ()=>{
        const okId = await ensureCustomerIdentified(state.orderMeta.type);
        if (!okId) return;
        addQuickItem(it, base);
      });
    }
  });

  bindAccordionBehavior(grid);
  enablePapasTab();
  enableDrinksTab();
}

// ======================= Ordenar rápido =======================
async function addQuickItem(item, base){
  const okId = await ensureCustomerIdentified(state.orderMeta.type);
  if (!okId) return;

  const d = hhDiscountPerUnit(item);
  const unit = Math.max(0, Number(item.price||0) - d);
  let seasoning = null;
  if (isSide(item)) seasoning = defaultSeasoning(item);

  state.cart.push({
    id: item.id,
    name: item.name,
    mini: !!item.mini,
    qty: 1,
    unitPrice: Number(item.price||0),
    baseIngredients: formatIngredientsFor(item, base),
    ingredients:     formatIngredientsFor(item, base),
    extras: { sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null, seasoning },
    notes: '',
    lineTotal: unit,
    hhDisc: d,
    type: isSide(item) ? 'side' : undefined
  });

  ensureDrinkPrices();
  updateCartBar();
  beep(); toast(`${item.name} agregado`);
  smartDrinkNudge();
}

function smartDrinkNudge(){
  const priceTxt = isDrinkComboUnlocked()?DRINK_PRICE.combo:DRINK_PRICE.solo;
  const box = document.getElementById('__drinkNudge') || document.createElement('div');
  box.id='__drinkNudge';
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:1000;background:#0f182a;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;display:flex;gap:8px;align-items:center';
  box.innerHTML = `
    <span class="muted small" style="white-space:nowrap">¿Bebida?</span>
    <button class="btn tiny" data-k="7up">Limonada $${priceTxt}</button>
    <button class="btn tiny" data-k="pepsi">Cola $${priceTxt}</button>
    <button class="btn ghost tiny" data-k="x">No</button>`;
  document.body.appendChild(box);
  box.onclick = (e)=>{
    const b = e.target.closest('button[data-k]');
    if(!b) return;
    const k = b.getAttribute('data-k');
    if (k==='x') { box.remove(); return; }
    addDrinkByKey(k);
    box.remove();
  };
  setTimeout(()=>{ try{ box.remove(); }catch{} }, 5000);
}

// ======================= Modal custom =========================
// Implementación sencilla compatible; usa #modal, #modalBody, etc si existen.
function openItemModal(item, base){
  const modal = document.getElementById('modal');
  const body  = document.getElementById('modalBody') || modal?.querySelector('.modal-body');
  const title = document.getElementById('modalTitle') || modal?.querySelector('.modal-title');
  if (!modal || !body) { addQuickItem(item, base); return; }

  const inc = formatIngredientsFor(item, base);
  const seasoningList = isSide(item) ? normalizeSeasonings(item) : [];

  if (title) title.textContent = item.name;
  body.innerHTML = `
    <div class="field">
      <label>Incluye</label>
      <div class="k-chips">
        ${inc.map(s=>`<span class="k-chip">${escapeHtml(s)}</span>`).join('') || '<span class="muted small">Configurable en cocina</span>'}
      </div>
    </div>

    ${seasoningList.length ? `
    <div class="field">
      <label>Sazonador (gratis)</label>
      <div id="seasonings">
        ${seasoningList.map((s,i)=>`
        <label>
          <input type="radio" name="seasoning" value="${escapeHtml(s.kitchen)}" ${i===0?'checked':''}/>
          <span>${escapeHtml(s.name)}</span>
        </label>`).join('')}
      </div>
    </div>`:''}

    <div class="field">
      <label>Cantidad</label>
      <input type="number" id="qty" min="1" value="1" />
    </div>

    <div class="field">
      <label>Comentarios a cocina</label>
      <textarea id="notes" placeholder="Sin jitomate, poco picante…"></textarea>
    </div>
  `;

  const foot = modal.querySelector('.modal-foot') || document.getElementById('modalFoot');
  if (foot){
    foot.innerHTML = `
      <div class="total-bar">
        <div>Total <span id="modalTotal">${money(item.price)}</span></div>
        <button class="btn" id="btnAddToCart">Agregar al carrito</button>
      </div>`;
  }

  const qtyInput = body.querySelector('#qty');
  const totalEl  = body.querySelector('#modalTotal') || foot?.querySelector('#modalTotal');

  const recompute = ()=>{
    const q = Math.max(1, Number(qtyInput.value||1));
    const d = hhDiscountPerUnit(item);
    const unit = Math.max(0, Number(item.price||0) - d);
    const total = unit * q;
    if (totalEl) totalEl.textContent = money(total);
  };
  qtyInput?.addEventListener('input', recompute);
  recompute();

  const addBtn = foot?.querySelector('#btnAddToCart');
  addBtn?.addEventListener('click', async ()=>{
    const okId = await ensureCustomerIdentified(state.orderMeta.type);
    if (!okId) return;
    const q = Math.max(1, Number(qtyInput.value||1));
    const d = hhDiscountPerUnit(item);
    const unit = Math.max(0, Number(item.price||0) - d);
    const notes = (body.querySelector('#notes')?.value || '').trim();
    let seasoning = null;
    if (isSide(item)){
      const r = body.querySelector('input[name="seasoning"]:checked');
      seasoning = r?.value || defaultSeasoning(item);
    }

    state.cart.push({
      id: item.id,
      name: item.name,
      mini: !!item.mini,
      qty: q,
      unitPrice: Number(item.price||0),
      baseIngredients: inc,
      ingredients: inc,
      extras: { sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null, seasoning },
      notes,
      lineTotal: unit * q,
      hhDisc: d * q,
      type: isSide(item)?'side':undefined
    });
    ensureDrinkPrices();
    updateCartBar();
    beep(); toast(`${item.name} agregado`);
    closeModal(modal);
  });

  openModal(modal);
}

function openModal(modal){
  modal.classList.add('open');
  modal.removeAttribute('aria-hidden');
}
function closeModal(modal){
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
}
document.querySelectorAll('[data-close-modal], .modal [data-x], #modalClose')
  .forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const m = btn.closest('.modal');
      if (m) closeModal(m);
    });
  });

// ======================= Carrito ==============================
const cartBar = document.getElementById('cartBar');
document.getElementById('openCart')?.addEventListener('click', openCartModal);

function recomputeLine(l){
  if (!l) return;
  if (l.type === 'drink'){
    // precios ya se manejan en ensureDrinkPrices
    return;
  }
  if (!l.unitPrice){
    const ref = findItemById(l.id);
    l.unitPrice = Number(ref?.price || 0);
  }
  const qty = l.qty || 1;
  const base = l.unitPrice * qty;
  const hhDisc = l.hhDisc || 0;
  l.lineTotal = Math.max(0, base - hhDisc);
}

function recomputeAllLines(){
  state.cart.forEach(recomputeLine);
}

function computeBreakdown(){
  let total = 0; let hh = 0;
  for (const l of state.cart){
    total += Number(l.lineTotal||0);
    hh    += Number(l.hhDisc||0);
  }
  const subtotal = total + hh;
  return { subtotal, hh, total };
}

function paintBreakdown(){
  ensureDrinkPrices();
  recomputeAllLines();
  const { total } = computeBreakdown();
  const totFooter = document.getElementById('cartTotalFooter');
  if (totFooter) totFooter.textContent = money(total);
  const totConf = document.getElementById('cartTotalConfirm');
  if (totConf) totConf.textContent = money(total);
}

function paintIdentityBadge(){
  let b = document.getElementById('idBadge');
  if (!b){
    b = document.createElement('div');
    b.id = 'idBadge';
    b.className = 'tag';
    b.style.cssText = 'position:fixed;right:10px;bottom:56px;z-index:1000;';
    document.body.appendChild(b);
  }
  b.textContent = 'Cliente reconocido';
  b.style.display = state.identified ? 'inline-flex' : 'none';
}

function updateCartBar(){
  ensureDrinkPrices();
  recomputeAllLines();
  const count = state.cart.reduce((a,l)=>a + (l.qty||1), 0);
  const total = state.cart.reduce((a,l)=>a + (l.lineTotal||0), 0);
  const countEl = document.getElementById('cartCount');
  if (countEl) countEl.textContent = String(count);
  const totalEl = document.getElementById('cartBarTotal');
  if (totalEl) totalEl.textContent = money(total);
  if (cartBar) cartBar.style.display = count>0 ? 'flex' : 'none';
  document.body.classList.toggle('has-cart', count>0);
  checkGiftUnlock(!state.gift.shownThisSession);
  paintIdentityBadge();
}

function openCartModal(){
  const modal = document.getElementById('cartModal');
  const body  = document.getElementById('cartBody') || modal?.querySelector('.modal-body');
  if (!modal || !body) return;
  body.innerHTML = '';

  if (!state.cart.length){
    body.innerHTML = '<p class="muted">Tu carrito está vacío.</p>';
  } else {
    state.cart.forEach((l,idx)=>{
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="ellipsis">${escapeHtml(l.name)} ×${l.qty||1}</div>
        <div class="muted small">${l.notes ? escapeHtml(l.notes) : ''}</div>
        <div class="right" style="margin-left:auto">${money(l.lineTotal||0)}</div>
        <button class="btn tiny ghost" data-a="del" data-i="${idx}">✕</button>
      `;
      body.appendChild(row);
    });
  }

  paintBreakdown();
  openModal(modal);

  body.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-a="del"]');
    if (!b) return;
    const i = Number(b.getAttribute('data-i')||-1);
    if (i>=0) {
      state.cart.splice(i,1);
      updateCartBar();
      openCartModal();
    }
  }, { once:true });
}

document.getElementById('cartClose')?.addEventListener('click', ()=>{
  const modal = document.getElementById('cartModal');
  if (modal) closeModal(modal);
});

// === Hook global para botón Confirmar pedido ==================
// Soporta múltiples posibles IDs/clases para ser compatible.
document.addEventListener('click', (e)=>{
  const btn = e.target.closest(
    '#btnConfirmOrder, #confirmOrderBtn, [data-confirm-order], .js-confirm-order'
  );
  if (!btn) return;
  e.preventDefault();
  submitOrder();
});

// ======================= Gift (simple, opcional) ==============
function checkGiftUnlock(autoOpen){
  if (!state.menu) return;
  if (state.gift.shownThisSession) return;
  const { total } = computeBreakdown();
  if (total >= state.gift.threshold){
    state.gift.shownThisSession = true;
    if (autoOpen) {
      try{ playGiftSfx(); }catch{}
      toast('🎁 Pedido con regalo disponible');
    }
  }
}
function ensureGiftModal(){ /* stub seguro: tu HTML puede sobreescribirlo */ }

// ======================= Happy Hour / ETA stubs ===============
function bindHappyHour(){ /* opcional: usa HH desde DB si ya lo tienes */ }
function bindETA(){ /* opcional: ETA en vivo */ }
function startOrdersAnalytics(){ /* opcional */ }

// ======================= Tracking =============================
function buildTrackUrl(orderId){
  const base = `${location.origin}${__root}kiosk/track.html`;
  const u = new URL(base);
  u.searchParams.set('oid', orderId);
  u.searchParams.set('gamify','1');
  u.searchParams.set('autostart','1');
  return u.toString();
}
function ensureTrackPrompt(url){
  // Si tienes modal propio, úsalo; si no, usamos toast.
  const linkEl = document.getElementById('trackLink');
  const btnEl  = document.getElementById('trackNow');
  if (linkEl) linkEl.value = url;
  if (btnEl)  btnEl.onclick = ()=>{ window.open(url, '_blank'); };
  if (!linkEl && !btnEl){
    toast('Puedes seguir tu pedido aquí: ' + url);
  }
}

// ======================= Identidad ============================
async function ensureCustomerIdentified(type){
  // Reglas simples: sólo pedimos una vez por sesión.
  if (state.identified && state.orderMeta.phone) return true;

  try{
    const storedName = localStorage.getItem('kiosk:name') || '';
    const storedPhone = localStorage.getItem('kiosk:phone') || '';
    if (storedPhone){
      state.customerName = storedName;
      state.orderMeta.phone = storedPhone;
      state.identified = true;
      paintIdentityBadge();
      return true;
    }
  }catch{}

  // Si tienes un modal de identidad en el HTML, úsalo.
  const modal = document.getElementById('idModal');
  const inputName = document.getElementById('idName');
  const inputPhone = document.getElementById('idPhone');
  const btnOk = document.getElementById('idOk');

  if (!modal || !inputPhone || !btnOk){
    // fallback: dejar pasar como anónimo
    state.identified = true;
    return true;
  }

  return new Promise(resolve=>{
    openModal(modal);
    btnOk.onclick = ()=>{
      const name = (inputName.value || '').trim();
      const phone = (inputPhone.value || '').trim();
      if (!phone){
        toast('Pon un teléfono para avisarte cuando esté listo');
        return;
      }
      state.customerName = name;
      state.orderMeta.phone = phone;
      state.identified = true;
      state.identifiedAt = Date.now();
      try{
        localStorage.setItem('kiosk:name', name);
        localStorage.setItem('kiosk:phone', phone);
      }catch{}
      paintIdentityBadge();
      closeModal(modal);
      resolve(true);
    };
  });
}

// ======================= Crear pedido =========================
async function submitOrder(){
  if (!state.cart.length){
    toast('Tu carrito está vacío');
    return;
  }
  if (state.isSubmittingOrder) return;

  const okId = await ensureCustomerIdentified(state.orderMeta.type);
  if (!okId) return;

  state.isSubmittingOrder = true;

  try{
    ensureDrinkPrices();
    recomputeAllLines();
    const { subtotal, hh, total } = computeBreakdown();

    const order = {
      createdAt: Date.now(),
      status: 'pending',
      source: 'kiosk-v2',
      mode: state.orderMeta.type,
      customerName: state.customerName || state.lastKnownName || '',
      phone: state.orderMeta.phone || state.lastKnownPhone || '',
      payMethodPref: state.orderMeta.payMethodPref || 'efectivo',
      items: state.cart.map(l=>({
        id: l.id,
        name: l.name,
        qty: l.qty || 1,
        type: l.type || (l.mini?'mini':(isSide(l)?'side':'burger')),
        unitPrice: l.unitPrice || 0,
        lineTotal: l.lineTotal || 0,
        notes: l.notes || '',
        extras: l.extras || {},
        meta: l.meta || {}
      })),
      subtotal,
      hhDiscount: hh,
      total,
    };

    const orderId = await DB.createOrder(order); // debe existir en tu db.js v2
    console.info('[kiosk] order created', orderId);

    state.lastOrderId = orderId;
    const trackUrl = buildTrackUrl(orderId);
    state.lastTrackUrl = trackUrl;

    state.cart = [];
    updateCartBar();

    const cartModal = document.getElementById('cartModal');
    if (cartModal) closeModal(cartModal);

    beep();
    toast('✅ Pedido enviado');
    ensureTrackPrompt(trackUrl);
  }catch(err){
    console.error('[kiosk] submitOrder error', err);
    toast('No se pudo enviar el pedido. Intenta de nuevo.');
  }finally{
    state.isSubmittingOrder = false;
  }
}

// ======================= Init ================================
init();
async function init(){
  // modo por query: ?mode=online / ?mode=offline
  const url = new URL(location.href);
  const mode = (url.searchParams.get('mode') || '').toLowerCase();
  if (mode === 'offline') state.orderMeta.type = 'pickup';
  else if (mode === 'online') state.orderMeta.type = 'online';

  try { await ensureAuth(); } catch (e) { console.warn('anon auth fail', e); }

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

  if (state.unsubTheme) { try{ state.unsubTheme(); }catch{} state.unsubTheme = null; }
  state.unsubTheme = initThemeFromSettings({ defaultName: 'Base' });

  ensureGiftModal();
  paintIdentityBadge();

  if (sessionStorage.getItem('kioskAdmin') === '1') { state.adminMode = true; }

  console.info('[kiosk] listo');
}

// ======================= Miscelánea ===========================
window.addEventListener('beforeunload', ()=>{
  try{
    state.unsubHH?.();
    state.unsubETA?.();
    state.unsubTheme?.();
    state.unsubReady?.();
    state.unsubAnalytics?.();
  }catch{}
});
