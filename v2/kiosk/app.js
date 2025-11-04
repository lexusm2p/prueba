// /kiosk/app.js — V2 LEAN (compat + optimización + Power Bar en modal)
// - Ordenar rápido (sin modal) + personalizar opcional
// - Nudge de bebida (2 botones) tras agregar
// - Mantiene HH/ETA, regalos, lealtad y seguimiento
// - Acordeón con barra de poder + highlights por producto
// - Modal con Barra de Poder (sticky) por pasos de personalización
// - COMPAT: único Total visible (footer). Sin Subtotal/HH en cuerpo.

const __parts = location.pathname.split('/').filter(Boolean);
const __first = __parts[0] ? `/${__parts[0]}/` : '/';
export const DATA_MENU_URL = `${__first}data/menu.json`;
console.info('[kiosk] DATA_MENU_URL =', DATA_MENU_URL);

const el = document.getElementById('app');
if (el) el.textContent = 'App.js cargado — iniciando módulos…';

/* ======================= Imports ======================= */
import { beep, toast } from '../shared/notify.js?v=20251104a';
import * as DB from '../shared/db.js?v=20251104a';
import { ensureAuth } from '../shared/firebase.js?v=20251104a';
import { initThemeFromSettings } from '../shared/theme.js?v=20251104a';

/* ======================= Estado global ======================= */
const state = {
  menu: null,
  mode: 'mini',
  cart: [],
  customerName: '',
  orderMeta: { type:'pickup', table:'', phone:'', payMethodPref:'efectivo' },
  unsubHH:null, unsubETA:null, unsubTheme:null, unsubReady:null, unsubAnalytics:null,
  etaText: '7–10 min',
  etaSource: 'fallback',
  hhLeftText: '',
  topToday: [],
  drinkComboActive: false,
  rewards: { type:null, discountCents:0, miniDog:false, decided:false },
  gift: {
    threshold: 117,
    productId: 'powerdog-mini',
    sound: '../shared/sfx/combo-unlocked.mp3',
    autoPrompt: true,
    shownThisSession: false
  },
  themeName: '',
  lastOrderId: null,
  isSubmittingOrder: false,
  adminMode: false,
  loyaltyEnabled: true,
  loyaltyAskShown: false
};

/* ======================= Helpers base ======================= */
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);

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
    document.getElementById('__debugMenu')?.remove();
    return cat;
  }catch(e){
    console.error('[kiosk] error catálogo', e);
    const fallback = { burgers:[{id:'starter',name:'Starter Burger',price:47}], minis:[], drinks:[], sides:[] };
    window.__CATALOG = fallback;
    document.getElementById('__debugMenu')?.remove();
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
      || null;
}
function baseOfItem(item){
  return item?.baseOf ? state.menu?.burgers?.find?.(b=>b.id===item.baseOf) : item;
}
function formatIngredientsFor(item, base){
  const meatDefaultBig  = Number(state.menu?.appSettings?.meatGrams ?? 85);
  const meatDefaultMini = Number(state.menu?.appSettings?.miniMeatGrams ?? 45);
  const grams = Number(item?.meatGrams ?? (item?.mini ? meatDefaultMini : meatDefaultBig));
  const src = (Array.isArray(item?.ingredients) && item.ingredients.length)
    ? item.ingredients
    : (base?.ingredients || []);
  return src.map(s =>
    /^Carne(\b|\s|$)/i.test(String(s)) ? `Carne ${grams} g` : s
  );
}
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/* ======================= Highlights ======================= */
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

/* ======================= Acordeón + Barra de poder ======================= */
function powerBarHtml(icon='🍔'){
  return `
    <div class="power-bar" aria-hidden="true"
         style="display:flex;align-items:center;gap:6px;margin-top:6px">
      <div class="power-icon" role="img" aria-label="icon"
           style="font-size:16px;line-height:1">${icon}</div>
      <div class="power-track" style="flex:1;height:8px;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.08);">
        <div class="power-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#ffd34d,#ff9f0a);transition:width .35s ease;"></div>
      </div>
    </div>
  `;
}
function buildAccordionForItem(item, base){
  if (item?.type === 'combo' && Array.isArray(item.items) && item.items.length){
    const subs = item.items.map(it=>{
      const ref = findItemById(it.id);
      const qty = it.qty && it.qty>1 ? ` ×${it.qty}` : '';
      const inc = ref ? formatIngredientsFor(ref, baseOfItem(ref)) : [];
      return `
        <li>
          <strong>${escapeHtml(ref?.name || it.id)}${qty}</strong>
          ${inc?.length ? `<ul style="margin:4px 0 0 14px">${inc.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
        </li>
      `;
    }).join('');
    const short = item.items.slice(0,3).map(it=>{
      const ref = findItemById(it.id);
      const qty = it.qty && it.qty>1 ? ` ×${it.qty}` : '';
      return `${escapeHtml(ref?.name || it.id)}${qty}`;
    });
    const extra = Math.max(0, item.items.length - short.length);

    return `
      <details class="ing-acc" data-acc data-id="${escapeHtml(item.id)}">
        <summary class="ing-head">
          <div class="k-chips">
            ${short.map(s=>`<span class="k-chip">${s}</span>`).join('')}
            ${extra>0 ? `<span class="k-chip chip-more" data-more>+${extra}</span>` : ``}
          </div>
          ${getHighlight(item, base) ? `<div class="muted small" style="margin-top:4px">${escapeHtml(getHighlight(item, base))}</div>`:''}
          ${powerBarHtml('⭐')}
        </summary>
        <ul class="ing-list" style="margin:8px 0 0 18px">${subs}</ul>
      </details>
    `;
  }

  const inc = formatIngredientsFor(item, base).filter(Boolean);
  if (!inc.length) return getHighlight(item, base)
    ? `<div class="muted small" style="margin-top:4px">${escapeHtml(getHighlight(item, base))}</div>`
    : '';

  const shown = inc.slice(0,3);
  const extra = Math.max(0, inc.length - shown.length);
  return `
    <details class="ing-acc" data-acc data-id="${escapeHtml(item.id)}">
      <summary class="ing-head">
        <div class="k-chips" aria-label="Incluye">
          ${shown.map(s=>`<span class="k-chip">${escapeHtml(s)}</span>`).join('')}
          ${extra>0 ? `<span class="k-chip chip-more" data-more>+${extra}</span>` : ``}
        </div>
        ${getHighlight(item, base) ? `<div class="muted small" style="margin-top:4px">${escapeHtml(getHighlight(item, base))}</div>`:''}
        ${powerBarHtml('🍔')}
      </summary>
      <ul class="ing-list" style="margin:8px 0 0 18px">
        ${inc.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    </details>
  `;
}
function bindAccordionBehavior(container){
  container.addEventListener('toggle', (e)=>{
    const d = e.target;
    if (!d?.matches?.('details.ing-acc')) return;
    const fill = d.querySelector('.power-fill');
    if (!fill) return;
    if (d.open){
      fill.style.width = '100%';   // al abrir, llena (feedback inmediato)
      try{ beep(); }catch{}
    } else {
      fill.style.width = '0%';     // al cerrar, resetea
      try{ beep(); }catch{}
    }
  });
}

/* ======================= Bebidas / Combo Drink ======================= */
const DRINK_PRICE = { solo: 20, combo: 17 };

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
    if (unlocked) { try{ playAchievement(); }catch{} toast('🎉 ¡Combo Drink Seven! Bebidas a precio combo'); }
    else { toast('Combo Drink Seven desactivado — bebidas a $20'); }
  }
  for (const l of cart){
    if (l?.type === 'drink'){
      l.meta = l.meta || {};
      l.meta.pricingMode = unlocked ? 'combo' : 'solo';
      l.lineTotal = target * (l.qty||1);
      l.hhDisc = 0; // HH no aplica a bebidas
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
    id: drink.id, type:'drink', name: drink.name, qty:1,
    unitPrice: Number(drink.price||0),
    baseIngredients:[], salsaDefault:null, salsaCambiada:null,
    extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
    notes:'', lineTotal: price, hhDisc: 0,
    meta:{ pricingMode: comboOn ? 'combo' : 'solo' }
  });
  updateCartBar(); beep(); toast(`${drink.name} agregado`);
}
function addDrinkByKey(key){
  const d = findDrinkFlexible(key);
  if (!d) { toast('Bebida no disponible'); return; }
  addDrinkToCart(d);
}

/* ======================= Happy Hour ======================= */
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
  const isEligible = eligibleOnly ? (item?.hhEligible !== false) : true;
  if (!isEligible) return 0;
  const unit = Number(item?.price || 0);
  return unit * pct;
}

/* ======================= Iconos base (fallback) ======================= */
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

/* ======================= Tema: watcher ======================= */
function readThemeNameFromDOM(){
  const root = document.documentElement;
  const dataAttr = root.getAttribute('data-theme-name') || root.getAttribute('data-theme') || root.dataset?.themeName || root.dataset?.theme || '';
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
    if (newName !== state.themeName){ state.themeName = newName; renderCards(); }
  });
}

/* ======================= Audio SFX ======================= */
let achievementAudio = null;
try { achievementAudio = new Audio('../shared/sfx/achievement.mp3'); } catch {}
async function playAchievement(){ try { if (achievementAudio) { await achievementAudio.play(); return; } beep(); } catch { beep(); } }

let giftAudio = null;
try { giftAudio = new Audio(state.gift.sound); } catch {}
async function playGiftSfx(){ try { if (giftAudio) { await giftAudio.play(); return; } beep(); } catch { beep(); } }

/* ======================= Tabs ======================= */
document.getElementById('btnMinis')?.addEventListener('click', ()=> setMode('mini'));
document.getElementById('btnBig')?.addEventListener('click', ()=> setMode('big'));
function setMode(mode){ state.mode = mode; renderCards(); setActiveTab(mode); }
function setActiveTab(mode=state.mode){
  const btnMinis = document.getElementById('btnMinis');
  const btnBig   = document.getElementById('btnBig');
  const btnCombos= document.getElementById('btnCombos');
  const on  = el => { el?.classList.add('is-active'); el?.setAttribute('aria-selected','true'); };
  const off = el => { el?.classList.remove('is-active'); el?.setAttribute('aria-selected','false'); };
  off(btnMinis); off(btnBig); off(btnCombos);
  if (mode==='mini') on(btnMinis);
  else if (mode==='big') on(btnBig);
  else if (mode==='combos') on(btnCombos);
}

/* ======================= Render tarjetas ======================= */
function enableCombosTab(){
  const hasCombos = Array.isArray(state.menu?.combos) && state.menu.combos.length > 0;
  if (!hasCombos) return;
  const bar = document.getElementById('tabsBar') || document.querySelector('.tabs');
  if (!bar || document.getElementById('btnCombos')) return;
  const btn = document.createElement('button');
  btn.id = 'btnCombos';
  btn.className = 'tab';
  btn.textContent = 'Combos';
  btn.addEventListener('click', ()=> setMode('combos'));
  bar.appendChild(btn);
}

function renderCards(){
  const grid = document.getElementById('cards');
  if (!grid) return;
  grid.innerHTML = '';

  let items;
  if (state.mode === 'mini')      items = state.menu?.minis || [];
  else if (state.mode === 'big')  items = state.menu?.burgers || [];
  else if (state.mode === 'combos') items = state.menu?.combos || [];
  else                            items = state.menu?.minis || [];

  items.forEach(it=>{
    const base   = baseOfItem(it);
    const baseId = base?.id || it.id;
    const mxOn   = /independencia|méx|mex|patria|viva/i.test(String(state.themeName||''));
    const themedSrc = getThemeIconFor(baseId);
    const iconSrc = themedSrc || ((mxOn && ICONS_MEX[baseId]) ? ICONS_MEX[baseId] : (ICONS[baseId] || null));

    const card = document.createElement('div');
    card.className = 'card';

    const disc = hhDiscountPerUnit(it);
    const eff  = Math.max(0, Number(it.price || 0) - disc);
    const priceHtml = disc > 0
      ? `<div class="price"><s style="opacity:.7">${money(it.price)}</s> <span class="tag">${money(eff)}</span></div>`
      : `<div class="price">${money(it.price)}</div>`;

    const isCombo = it.type === 'combo';
    card.innerHTML = `
      <h3>${it.name}</h3>
      <div class="media">
        ${iconSrc ? `<img src="${iconSrc}" alt="${it.name}" class="icon-img" loading="lazy"/>`
                  : `<div class="icon" aria-hidden="true"></div>`}
      </div>

      ${buildAccordionForItem(it, base)}

      <div class="row">
        ${priceHtml}
        <div class="row" style="gap:8px">
          ${isCombo ? '' : `<button class="btn ghost small" data-a="custom">Personalizar</button>`}
          <button class="btn small" data-a="${isCombo?'order':'quick'}">
            ${isCombo ? 'Ordenar combo' : 'Ordenar rápido'}
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);

    card.querySelector('[data-more]')?.addEventListener('click', (ev)=>{
      ev.preventDefault();
      openItemModal(it, base);
    });

    if (isCombo){
      card.querySelector('[data-a="order"]')?.addEventListener('click', ()=> addComboToCart(it));
    } else {
      card.querySelector('[data-a="custom"]')?.addEventListener('click', ()=> openItemModal(it, base));
      card.querySelector('[data-a="quick"]')?.addEventListener('click', ()=> addQuickItem(it, base));
    }
  });

  bindAccordionBehavior(grid);
  enableCombosTab();
}

/* ======================= Ordenar rápido + Nudge bebida ======================= */
function addQuickItem(item, base){
  const d = hhDiscountPerUnit(item);
  const unit = Math.max(0, Number(item.price||0) - d);
  state.cart.push({
    id: item.id,
    name: item.name,
    mini: !!item.mini,
    qty: 1,
    unitPrice: Number(item.price||0),
    baseIngredients: formatIngredientsFor(item, base),
    ingredients:     formatIngredientsFor(item, base),
    salsaDefault: base?.salsaDefault || base?.suggested || null,
    salsaCambiada: null,
    extras: { sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
    notes: '',
    lineTotal: unit,
    hhDisc: d
  });
  ensureDrinkPrices();
  updateCartBar(); beep(); toast(`${item.name} agregado`);
  smartDrinkNudge();
}
function smartDrinkNudge(){
  const priceTxt = isDrinkComboUnlocked()?DRINK_PRICE.combo:DRINK_PRICE.solo;
  const box = document.getElementById('__drinkNudge') || document.createElement('div');
  box.id='__drinkNudge';
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:1000;background:#0f182a;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;display:flex;gap:8px;align-items:center';
  box.innerHTML = `
    <span class="muted small" style="white-space:nowrap">¿Bebida?</span>
    <button class="btn tiny" data-k="7up">7up $${priceTxt}</button>
    <button class="btn tiny" data-k="pepsi">Pepsi $${priceTxt}</button>
    <button class="btn ghost tiny" data-k="x">No</button>
  `;
  document.body.appendChild(box);
  box.onclick = (e)=>{
    const b = e.target.closest('button[data-k]'); if(!b) return;
    const k = b.getAttribute('data-k');
    if (k==='x') { box.remove(); return; }
    addDrinkByKey(k); box.remove();
  };
  setTimeout(()=>{ try{ box.remove(); }catch{} }, 5000);
}

/* ======================= Combos ======================= */
function addComboToCart(combo){
  try{
    (combo.items||[]).filter(i=>i.kind==='burger').forEach(i=>{
      const it = findItemById(i.id); if(!it) return;
      const base = baseOfItem(it);
      const d = hhDiscountPerUnit(it);
      const unit = Math.max(0, Number(it.price||0) - d);
      state.cart.push({
        id: it.id, name: it.name, mini: !!it.mini, qty: i.qty||1,
        unitPrice: Number(it.price||0),
        baseIngredients: formatIngredientsFor(it, base),
        ingredients:     formatIngredientsFor(it, base),
        extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
        notes: '',
        lineTotal: unit*(i.qty||1),
        hhDisc: d*(i.qty||1)
      });
    });
    ensureDrinkPrices();
    updateCartBar(); beep(); toast(`${combo.name} agregado`);
  } catch(e){
    console.warn('addComboToCart fail', e);
    toast('No pude agregar el combo');
  }
}

/* ======================= Modal Personalizar ======================= */
function normalizeExtraIngredients(){
  const raw = state.menu?.extras?.ingredients ?? [];
  const defaultPrice = Number(state.menu?.extras?.ingredientPrice ?? 0);
  const isCarneGrande = (name='') => /^carne\s*(8[0-9]|9[0-9]|100)\s*g$/i.test(
    String(name).replace(/\s+/g,' ').trim()
  );
  return raw
    .map(x=> (typeof x === 'string')
      ? { id: slug(x), name: x, price: defaultPrice }
      : { id: x.id || slug(x.name), name: x.name, price: Number(x.price ?? defaultPrice) })
    .filter(obj => !isCarneGrande(obj?.name));
}

// Crea (si no existe) la barra sticky de progreso del modal
function ensureModalPowerBar(){
  const modal = document.getElementById('modal');
  if (!modal) return null;
  let bar = modal.querySelector('#mPower');
  if (bar) return bar;
  const head = modal.querySelector('.modal-head') || modal;
  bar = document.createElement('div');
  bar.id = 'mPower';
  bar.setAttribute('aria-hidden','true');
  bar.style.cssText = 'position:sticky;top:0;z-index:2;margin:-8px -8px 8px -8px;padding:8px;background:linear-gradient(0deg,rgba(0,0,0,.35),rgba(0,0,0,.35));backdrop-filter:blur(2px)';
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:16px">⚡</div>
      <div style="flex:1;height:10px;border-radius:10px;overflow:hidden;background:rgba(255,255,255,.12)">
        <div id="mPowerFill" style="width:0%;height:100%;background:linear-gradient(90deg,#ffd34d,#ff9f0a);transition:width .25s ease"></div>
      </div>
      <div id="mPowerPct" class="muted small" style="width:40px;text-align:right">0%</div>
    </div>
  `;
  const mBody = document.getElementById('mBody');
  if (mBody) mBody.prepend(bar);
  return bar;
}

function openItemModal(item, base, existingIndex=null){
  const modal = document.getElementById('modal'); modal?.classList.add('open');
  const body  = document.getElementById('mBody');
  const ttl   = document.getElementById('mTitle');
  const xBtn  = document.getElementById('mClose');

  if(ttl) ttl.textContent = `${item.name} · ${money(item.price)}`;
  if(xBtn) xBtn.onclick = ()=> modal?.classList.remove('open');

  // ----- PowerBar (sticky) -----
  ensureModalPowerBar();
  const setPower = (pct)=>{
    const fill = document.getElementById('mPowerFill');
    const pctEl= document.getElementById('mPowerPct');
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    if (fill) fill.style.width = v + '%';
    if (pctEl) pctEl.textContent = v + '%';
  };

  const sauces = state.menu?.extras?.sauces ?? [];
  const extrasIngr = normalizeExtraIngredients();
  const SP  = Number(state.menu?.extras?.saucePrice ?? 0);
  const DLC = Number(state.menu?.extras?.dlcCarneMini ?? 12);

  const editing = (existingIndex !== null);
  const line    = editing ? state.cart[existingIndex] : null;
  const hasSauce = s => editing && line?.extras?.sauces?.includes(s);
  const hasIngr  = s => editing && line?.extras?.ingredients?.includes(s);
  const dlcOn    = editing ? !!line?.extras?.dlcCarne : false;
  const qtyVal   = editing ? (line?.qty||1) : 1;
  const notesVal = editing ? (line?.notes||'') : '';
  const swapVal  = editing ? (line?.salsaCambiada||'') : '';

  if (!body) return;
  const includeList = formatIngredientsFor(item, base).filter(Boolean);

  body.innerHTML = `
    <div class="field"><label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required value="${state.customerName||''}"/></div>

    ${ includeList.length ? `
    <div class="field"><label>Incluye</label>
      <div class="k-chips">
        ${includeList.map(s=>`<span class="k-chip is-inc">${escapeHtml(s)}</span>`).join('')}
      </div>
    </div>` : '' }

    ${ item.mini && (DLC > 0) ? `
    <div class="field"><label>DLC de Carne grande</label>
      <label class="ul-clean" style="display:flex;gap:8px;align-items:center">
        <input type="checkbox" id="dlcCarne" ${dlcOn?'checked':''}/>
        <span>Cambia a carne 85g</span>
        <span class="tag">(+${money(DLC)})</span>
      </label>
    </div>` : '' }

    <div class="hr"></div>

    <div class="field"><label>Cambia la salsa base (sin costo)</label>
      <select id="swapSauce"><option value="">Dejar salsa por defecto</option>
        ${((base?.salsasSugeridas || [base?.suggested]).filter(Boolean) || [])
           .map(s=>`<option value="${s}" ${swapVal===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>

    <details id="detSauces" class="field"><summary class="muted">+ Aderezos extra</summary>
      <div class="ul-clean" id="sauces" style="margin-top:6px">
        ${sauces.map((s,i)=>`
          <label style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" id="s${i}" ${hasSauce(s)?'checked':''}/>
            <span>${s}</span>
            <span class="tag">(+${money(SP)})</span>
          </label>`).join('')}
      </div>
    </details>

    <details id="detIngrs" class="field"><summary class="muted">+ Ingredientes extra</summary>
      <div class="ul-clean" id="ingrs" style="margin-top:6px">
        ${extrasIngr.map((obj,i)=>`
          <label style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" id="e${i}" ${hasIngr(obj.name)?'checked':''}/>
            <span>${obj.name}</span>
            <span class="tag">(+${money(obj.price)})</span>
          </label>`).join('')}
      </div>
    </details>

    <div class="field"><label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="${qtyVal}"/>
    </div>

    <div class="field"><label>Comentarios a cocina</label>
      <textarea id="notes" placeholder="sin jitomate, poco picante…">${notesVal}</textarea>
    </div>
  `;

  const addBtn  = document.getElementById('mAdd');
  const totalEl = document.getElementById('mTotal');
  const qtyEl   = document.getElementById('qty');

  // ----- Progreso por pasos -----
  const steps = {
    name:false,     // escribir nombre
    sauce:false,    // tocar/seleccionar salsa
    saucesSec:false,// abrir sección aderezos extra
    ingSec:false,   // abrir sección ingredientes extra
    qty:false,      // modificar cantidad
    notes:false     // escribir notas
  };
  const STEP_COUNT = Object.keys(steps).length;
  const recomputeProgress = ()=>{
    const done = Object.values(steps).filter(Boolean).length;
    setPower((done/STEP_COUNT)*100);
  };

  const mark = (k)=>{ if (!steps[k]) { steps[k]=true; recomputeProgress(); } };

  const inputs  = body.querySelectorAll('input[type=checkbox]');
  const swapSel = document.getElementById('swapSauce');
  const detSau  = document.getElementById('detSauces');
  const detIng  = document.getElementById('detIngrs');
  const nameEl  = document.getElementById('cName');
  const notesEl = document.getElementById('notes');

  // Inicial por edición
  if ((nameEl?.value||'').trim().length>0) steps.name=true;
  if ((swapSel?.value||'')!=='') steps.sauce=true;
  if (Number(qtyEl?.value||1)!==1) steps.qty=true;
  if ((notesEl?.value||'').trim().length>0) steps.notes=true;
  recomputeProgress();

  nameEl?.addEventListener('input', ()=>{ if ((nameEl.value||'').trim().length>0) mark('name'); });
  swapSel?.addEventListener('focus', ()=> mark('sauce'));
  swapSel?.addEventListener('change', ()=> mark('sauce'));
  detSau?.addEventListener('toggle', ()=>{ if (detSau.open) mark('saucesSec'); });
  detIng?.addEventListener('toggle', ()=>{ if (detIng.open) mark('ingSec'); });
  qtyEl?.addEventListener('change', ()=>{ if (Number(qtyEl.value||1)!==1) mark('qty'); });
  notesEl?.addEventListener('input', ()=>{ if ((notesEl.value||'').trim().length>0) mark('notes'); });

  // Precio dinámico
  const calc = ()=>{
    const qty     = parseInt(qtyEl?.value||'1', 10);
    const saucesChecked = [...body.querySelectorAll('#sauces input:checked')].length;
    const ingrChecked   = [...body.querySelectorAll('#ingrs input:checked')].map(el=>{
      const idx = Number(el.id.slice(1));
      return extrasIngr[idx]?.price || 0;
    });
    const costS = saucesChecked * SP;
    const costI = ingrChecked.reduce((a,n)=>a+Number(n||0),0);
    const dlcChk  = item.mini && body.querySelector('#dlcCarne')?.checked;
    const extraDlc = dlcChk ? DLC : 0;
    const hhDiscPerUnit = hhDiscountPerUnit(item);
    const unitBaseAfterHH = Math.max(0, Number(item.price||0) - hhDiscPerUnit);
    const subtotal = (unitBaseAfterHH + extraDlc)*qty + (costS + costI)*qty;
    if(totalEl) totalEl.textContent = money(subtotal);
    return { qty, subtotal, dlcChk, hhDiscTotal: hhDiscPerUnit * qty };
  };
  inputs.forEach(i=> i.addEventListener('change', calc)); calc();

  if(addBtn){
    addBtn.textContent = (existingIndex!==null) ? 'Guardar cambios' : 'Agregar al pedido';
    addBtn.onclick = ()=>{
      const name = (document.getElementById('cName')?.value||'').trim();
      if(!name){ alert('Por favor escribe tu nombre.'); return; }
      state.customerName = name;
      try { localStorage.setItem('kiosk:name', name); } catch {}

      const { qty, subtotal, dlcChk, hhDiscTotal } = calc();
      const saucesSel = [...body.querySelectorAll('#sauces input')].map((el,i)=> el.checked? sauces[i]: null).filter(Boolean);
      const extrasIngrN = normalizeExtraIngredients();
      const ingrSel   = [...body.querySelectorAll('#ingrs input')].map((el,i)=> el.checked? extrasIngrN[i].name: null).filter(Boolean);
      const salsaSwap = (document.getElementById('swapSauce')?.value || '') || null;
      const notes     = (document.getElementById('notes')?.value || '').trim();

      const newLine = {
        id: item.id, name: item.name, mini: !!item.mini, qty,
        unitPrice: Number(item.price||0),
        baseIngredients: formatIngredientsFor(item, base),
        ingredients: formatIngredientsFor(item, base),
        salsaDefault: base?.salsaDefault || base?.suggested || null,
        salsaCambiada: salsaSwap,
        extras: { sauces: saucesSel, ingredients: ingrSel, dlcCarne: !!dlcChk, surpriseSauce: null },
        notes, lineTotal: subtotal, hhDisc: hhDiscTotal
      };

      // efecto “100% completado” antes de cerrar
      setPower(100);

      if (existingIndex!==null){
        state.cart[existingIndex] = newLine;
        toast('Línea actualizada');
      } else {
        state.cart.push(newLine);
        toast('Agregado al pedido');
      }
      setTimeout(()=>{ document.getElementById('modal')?.classList.remove('open'); }, 120);
      updateCartBar(); beep();
    };
  }
}

/* ======================= Carrito ======================= */
const cartBar = document.getElementById('cartBar');
document.getElementById('openCart')?.addEventListener('click', openCartModal);

function recomputeAllLines() {
  state.cart.forEach(l => { if (l?.type !== 'drink') recomputeLine(l); });
}

// Desglose lógico (para Total del footer)
function computeBreakdown() {
  let total = 0;
  let hh = 0;
  for (const l of state.cart) {
    total += Number(l.lineTotal || 0);
    hh    += Number(l.hhDisc    || 0);
  }
  const subtotal = total + hh; // previo a HH
  return { subtotal, hh, total };
}
function paintBreakdown() {
  const { subtotal, hh, total } = computeBreakdown();
  // Footer único (preferido)
  const totFooter = document.getElementById('cartTotalFooter');
  if (totFooter) totFooter.textContent = money(total);
  // Compat opcional si existen:
  const subEl = document.getElementById('cartSub');
  const hhEl  = document.getElementById('cartHH');
  const totEl = document.getElementById('cartTotal');
  if (subEl) subEl.textContent = money(subtotal);
  if (hhEl)  hhEl.textContent  = (hh>0?'-':'') + money(hh);
  if (totEl) totEl.textContent = money(total);
}

function updateCartBar(){
  const count = state.cart.reduce((a,l)=>a + (l.qty||1), 0);
  const total = state.cart.reduce((a,l)=>a + (l.lineTotal||0), 0);
  const countEl = document.getElementById('cartCount');
  const totalEl = document.getElementById('cartBarTotal');
  if (countEl) countEl.textContent = String(count);
  if (totalEl) totalEl.textContent = money(total);
  if (cartBar) cartBar.style.display = count>0 ? 'flex' : 'none';
  document.body.classList.toggle('has-cart', count>0);
  checkGiftUnlock(!state.gift.shownThisSession);
}

function checkGiftUnlock(autoOpen=true){
  const total = state.cart.reduce((a,l)=> a + Number(l.lineTotal||0), 0);
  const hasGift = state.cart.some(l => l.isGift && l.id === state.gift.productId);
  if (total >= Number(state.gift.threshold) && !hasGift){
    if (state.gift.autoPrompt && autoOpen){
      try{ playGiftSfx(); }catch{}
      openGiftModal();
      state.gift.shownThisSession = true;
    }
  } else {
    if (total < Number(state.gift.threshold)) state.gift.shownThisSession = false;
    if (total < Number(state.gift.threshold) && hasGift){
      state.cart = state.cart.filter(l => !(l.isGift && l.id===state.gift.productId));
      updateCartBar();
      toast('Regalo removido (bajaste del umbral)');
    }
  }
}
function ensureGiftModal(){
  if (document.getElementById('giftModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'giftModal';
  wrap.style.cssText = 'display:none;position:fixed;inset:0;z-index:10001;place-items:center;background:rgba(0,0,0,.5);backdrop-filter:blur(2px)';
  wrap.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="giftTtl"
         style="max-width:520px;width:calc(100% - 24px);background:#0f182a;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px">
      <div class="modal-head" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <h3 id="giftTtl" style="margin:0">🎉 ¡Logro desbloqueado!</h3>
        <button id="giftClose" class="btn ghost" aria-label="Cerrar">✕</button>
      </div>
      <p class="muted" style="margin:6px 0 12px">
        Superaste <b>$${Number(state.gift.threshold).toFixed(0)}</b>. ¿Quieres reclamar tu <b>PowerDog Mini</b> gratis?
      </p>
      <div class="row" style="gap:8px;justify-content:flex-end">
        <button class="btn" id="giftAccept">✅ Sí, agregar</button>
        <button class="btn ghost" id="giftReject">❌ No, gracias</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = ()=> wrap.style.display='none';
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap) close(); });
  wrap.querySelector('#giftClose')?.addEventListener('click', close);
  wrap.querySelector('#giftReject')?.addEventListener('click', close);
  wrap.querySelector('#giftAccept')?.addEventListener('click', ()=>{
    state.cart.push({
      id: state.gift.productId, name:'PowerDog Mini (Regalo)', mini:true, isGift:true,
      qty:1, unitPrice:0, baseIngredients:[], extras:{sauces:[],ingredients:[],dlcCarne:false,surpriseSauce:null},
      notes:'', lineTotal:0, hhDisc:0
    });
    close(); toast('🎁 Regalo agregado'); updateCartBar();
  });
}
function openGiftModal(){ ensureGiftModal(); const m=document.getElementById('giftModal'); if(m) m.style.display='grid'; }

function recomputeLine(line){
  if (line?.type === 'drink') return;
  const DLC = Number(state.menu?.extras?.dlcCarneMini ?? 12);
  const SP  = Number(state.menu?.extras?.saucePrice ?? 0);
  const extrasIngr = normalizeExtraIngredients();
  const priceByName = new Map(extrasIngr.map(x=>[x.name, x.price]));
  const costI = (line.extras?.ingredients||[]).reduce((sum, name)=>{
    return sum + Number(priceByName.get(name) ?? state.menu?.extras?.ingredientPrice ?? 0);
  }, 0);
  const costS = (line.extras?.sauces?.length || 0) * SP;
  const dlcOn = !!(line.extras?.dlcCarne);
  const extraDlc = dlcOn ? DLC : 0;
  const item = findItemById(line.id);
  const hhDiscPerUnit = hhDiscountPerUnit(item);
  const unitBaseAfterHH = Math.max(0, Number(line.unitPrice||0) - hhDiscPerUnit);
  const unitTotal = (unitBaseAfterHH + extraDlc) + costS + costI;
  line.lineTotal = unitTotal * (line.qty||1);
  line.hhDisc = hhDiscPerUnit * (line.qty||1);
}

function openCartModal(){
  const m = document.getElementById('cartModal');
  const body = document.getElementById('cartBody');
  const close = ()=> { if(m) m.style.display='none'; };
  document.getElementById('cartClose')?.addEventListener('click', close, { once:true });
  if(m) m.style.display='grid';

  const confirmBtn = document.getElementById('cartConfirm');

  if(state.cart.length===0){
    if(body) body.innerHTML = '<div class="muted">Tu carrito está vacío.</div>';
    if (confirmBtn) confirmBtn.style.display = 'none';
    return;
  }
  if (confirmBtn) confirmBtn.style.display = '';

  // Cuerpo del modal (SIN Subtotal/HH; el total va solo en el footer)
  if (body) body.innerHTML = `
    <div class="field"><label>Nombre del cliente</label>
      <input id="cartName" type="text" required value="${state.customerName||localStorage.getItem('kiosk:name')||''}" /></div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px">
      <div class="field">
        <label>Tipo de pedido</label>
        <select id="orderType">
          <option value="pickup" ${state.orderMeta.type!=='dinein'?'selected':''}>Pickup</option>
          <option value="dinein"  ${state.orderMeta.type==='dinein'?'selected':''}>Mesa</option>
        </select>
      </div>

      <div class="field" id="phoneField" style="${state.orderMeta.type==='pickup'?'':'display:none'}">
        <label>Teléfono (Pickup)</label>
        <input id="phoneNum" type="tel" inputmode="numeric" autocomplete="tel" maxlength="10"
               placeholder="10 dígitos" pattern="[0-9]{10}" value="${state.orderMeta.phone||localStorage.getItem('kiosk:phone')||''}" />
        <div class="muted small">Sólo para avisarte cuando esté listo.</div>
      </div>

      <div class="field" id="mesaField" style="${state.orderMeta.type==='dinein'?'':'display:none'}">
        <label>Número de mesa</label>
        <input id="tableNum" type="text" placeholder="Ej. 4" value="${state.orderMeta.table||''}" />
      </div>

      <div class="field">
        <label>Método de pago</label>
        <select id="payMethod">
          <option value="efectivo" ${state.orderMeta.payMethodPref==='efectivo'?'selected':''}>Efectivo</option>
          <option value="tarjeta" ${state.orderMeta.payMethodPref==='tarjeta'?'selected':''}>Tarjeta</option>
          <option value="transferencia" ${state.orderMeta.payMethodPref==='transferencia'?'selected':''}>Transferencia</option>
        </select>
      </div>
    </div>

    <div class="field">
      ${state.cart.map((l,idx)=>{
        const extrasTxt = [
          (l.extras?.dlcCarne ? 'DLC carne 85g' : ''),
          ...(l.extras?.sauces||[]).map(s=>'Aderezo: '+s),
          ...(l.extras?.ingredients||[]).map(s=>'Extra: '+s)
        ].filter(Boolean).join(', ');
        return `
        <div class="k-card" style="margin:8px 0" data-i="${idx}">
          <h4>${l.name} · x${l.qty}</h4>
          ${l.salsaCambiada ? `<div class="muted small">Cambio de salsa: ${l.salsaCambiada}</div>`:''}
          ${extrasTxt? `<div class="muted small">${extrasTxt}</div>`:''}
          ${l.notes ? `<div class="muted small">Notas: ${escapeHtml(l.notes)}</div>`:''}
          <div class="k-actions" style="gap:6px">
            <button class="btn small ghost" data-a="less">-</button>
            <button class="btn small ghost" data-a="more">+</button>
            <button class="btn small" data-a="edit">Editar</button>
            <button class="btn small danger" data-a="remove">Eliminar</button>
            <div style="margin-left:auto" class="price">${money(l.lineTotal)}</div>
          </div>
        </div>`;}).join('')}
    </div>`;

  const typeSel    = document.getElementById('orderType');
  const mesaField  = document.getElementById('mesaField');
  const phoneField = document.getElementById('phoneField');
  const phoneInput = document.getElementById('phoneNum');
  const paySel     = document.getElementById('payMethod');

  if (phoneInput){
    phoneInput.addEventListener('input', ()=>{
      const pos = phoneInput.selectionStart ?? phoneInput.value.length;
      phoneInput.value = String(phoneInput.value).replace(/\D+/g,'').slice(0,10);
      try { phoneInput.setSelectionRange(pos, pos); } catch {}
    });
    phoneInput.addEventListener('change', ()=>{
      const p = String(phoneInput.value).replace(/\D+/g,'').slice(0,10);
      try { localStorage.setItem('kiosk:phone', p); } catch {}
    });
  }
  typeSel?.addEventListener('change', ()=>{
    state.orderMeta.type = (typeSel?.value||'pickup');
    if(mesaField)  mesaField.style.display  = (state.orderMeta.type==='dinein') ? '' : 'none';
    if(phoneField) phoneField.style.display = (state.orderMeta.type==='pickup') ? '' : 'none';
  });
  paySel?.addEventListener('change', ()=>{
    state.orderMeta.payMethodPref = (paySel?.value || 'efectivo');
  });

  // acciones en líneas
  body.onclick = (e)=>{
    const btn = e.target.closest('button[data-a]'); if (!btn) return;
    const card = btn.closest('[data-i]'); if (!card) return;
    const i = parseInt(card.dataset.i, 10);
    const line = state.cart[i]; if (!line) return;
    const act = btn.dataset.a;

    if (act === 'remove') {
      state.cart.splice(i, 1);
      recomputeAllLines();
      updateCartBar();
      openCartModal(); // re-render
      return;
    }
    if (act === 'more') {
      line.qty = Math.min(99, (line.qty || 1) + 1);
      if (line?.type !== 'drink') recomputeLine(line);
      recomputeAllLines();
      updateCartBar();
      openCartModal();
      return;
    }
    if (act === 'less') {
      line.qty = Math.max(1, (line.qty || 1) - 1);
      if (line?.type !== 'drink') recomputeLine(line);
      recomputeAllLines();
      updateCartBar();
      openCartModal();
      return;
    }
    if (act === 'edit') {
      const item = findItemById(line.id);
      const base = baseOfItem(item);
      const m2 = document.getElementById('cartModal'); if(m2) m2.style.display='none';
      openItemModal(item, base, i);
      return;
    }
  };

  // Recalcula y pinta SOLO el footer
  recomputeAllLines();
  paintBreakdown();

  // confirmar
  if (confirmBtn){
    confirmBtn.onclick = null;
    confirmBtn.onclick = async ()=>{
      if (state.isSubmittingOrder) return;
      state.isSubmittingOrder = true;

      recomputeAllLines();
      paintBreakdown();

      const prevLabel = confirmBtn.textContent;
      confirmBtn.disabled = true; confirmBtn.setAttribute('aria-busy','true');
      confirmBtn.textContent = 'Enviando…';

      try {
        const name = (document.getElementById('cartName')?.value||'').trim();
        if(!name){ alert('Escribe tu nombre'); return; }
        state.customerName = name;
        try { localStorage.setItem('kiosk:name', name); } catch {}

        state.orderMeta.type  = (document.getElementById('orderType')?.value||'pickup');
        state.orderMeta.payMethodPref = (document.getElementById('payMethod')?.value || 'efectivo');

        if(state.orderMeta.type==='dinein'){
          state.orderMeta.table = (document.getElementById('tableNum')?.value||'').trim();
          if(!state.orderMeta.table){ alert('Indica el número de mesa.'); return; }
          state.orderMeta.phone = '';
        } else {
          const raw = (document.getElementById('phoneNum')?.value || '');
          const norm = String(raw).replace(/\D+/g,'').slice(0,10);
          if(norm.length < 10){ alert('Para Pickup, teléfono de 10 dígitos.'); return; }
          state.orderMeta.phone = norm; state.orderMeta.table = '';
        }

        const itemsForDB = state.cart
          .map(l => ({
            id: l.id, name: l.name, mini: l.mini, qty: l.qty, unitPrice: l.unitPrice,
            baseIngredients: l.baseIngredients, ingredients: l.ingredients || l.baseIngredients || [],
            salsaDefault: l.salsaDefault, salsaCambiada: l.salsaCambiada,
            extras: l.extras, notes: l.notes || null, lineTotal: l.lineTotal, hhDisc: Number(l.hhDisc || 0),
            isGift: !!l.isGift
          }))
          .filter(l => !l.isGift);

        const subtotalBase = itemsForDB.reduce((a, l) => a + (l.lineTotal || 0), 0);
        const hhTotalDiscount = itemsForDB.reduce((a, l) => a + Number(l.hhDisc || 0), 0);
        const subtotal = Math.max(0, subtotalBase);
        const hh = state.menu?.happyHour || { enabled:false, discountPercent:0, applyEligibleOnly:true };

        const orderBase = {
          clientId: `c_${Date.now()}_${Math.floor(Math.random()*1e6)}`,
          customer: state.customerName,
          orderType: state.orderMeta.type,
          table: state.orderMeta.type === 'dinein' ? state.orderMeta.table : null,
          phone: state.orderMeta.type === 'pickup' ? state.orderMeta.phone : null,
          payMethodPref: state.orderMeta.payMethodPref || 'efectivo',
          items: itemsForDB,
          subtotal,
          notes: null,
          hh: {
            enabled: !!hh.enabled,
            discountPercent: Number(hh.discountPercent || 0),
            applyEligibleOnly: hh.applyEligibleOnly !== false,
            totalDiscount: Number(hhTotalDiscount || 0)
          },
          rewards: { type:null, discount:0, discountCents:0, miniDog:false, decided:false },
          createdAt: Date.now()
        };

        let orderId = null;
        try {
          const created = await DB.createOrder?.(orderBase);
          orderId = (typeof created === 'string') ? created : created?.id;
        } catch (e) {
          console.warn('createOrder error', e);
        }
        if (!orderId) orderId = `O-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        state.lastOrderId = orderId;

        if (orderBase.phone) {
          await DB.upsertCustomerFromOrder?.({ ...orderBase, id: orderId }).catch(()=>{});
          await DB.attachLastOrderRef?.(orderBase.phone, orderId).catch(()=>{});
          const trackUrl = new URL('./track.html', location.href);
          trackUrl.searchParams.set('phone', '52'+orderBase.phone);
          trackUrl.searchParams.set('autostart','1');
          trackUrl.searchParams.set('gamify','1');
          const etaLine = state.etaText ? `ETA: ${state.etaText}\n` : '';
          const text =
            `¡Hola ${orderBase.customer || ''}! Recibimos tu pedido en Seven de Burgers 🍔.\n` +
            etaLine +
            `Total estimado: $${Number(orderBase.subtotal||0).toFixed(0)}\n` +
            `Sigue tu pedido aquí: ${trackUrl.toString()}`;
          await DB.sendWhatsAppMessage?.({ to: `52${orderBase.phone}`, text, meta:{kind:'order_created', orderId} }).catch(()=>{});
        }

        beep();
        toast(`Gracias ${state.customerName}, te avisaremos cuando esté listo 🛎️`);

        state.cart = [];
        updateCartBar();
        const mm = document.getElementById('cartModal'); if(mm) mm.style.display='none';

        setTimeout(()=>{
          const u = new URL('./track.html', location.href);
          if (orderBase.phone) u.searchParams.set('phone', orderBase.phone);
          u.searchParams.set('oid', orderId);
          u.searchParams.set('autostart','1');
          u.searchParams.set('gamify','1');
          window.location.href = u.toString();
        }, 250);
      } finally {
        state.isSubmittingOrder = false;
        confirmBtn.disabled = false;
        confirmBtn.removeAttribute('aria-busy');
        confirmBtn.textContent = prevLabel;
      }
    };
  }
}

/* ======================= HH y ETA ======================= */
let hhTimer = null;
const HH_REFRESH_GUARD_KEY = 'hhRefreshGuard-app';
const fmtMMSS = (ms)=>{
  const s = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(s/60);
  const ss = s%60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
};
function stopHHTimer(){ if(hhTimer){ clearInterval(hhTimer); hhTimer=null; } }
function updateHHPill(hh, extraText=''){
  const pill = document.getElementById('hhPill');
  const txt  = document.getElementById('hhText');
  const msg  = document.getElementById('hhMsg');
  if (!pill || !txt) return;
  pill.classList.toggle('on', !!hh.enabled);
  txt.textContent = hh.enabled
    ? `Happy Hour – ${Number(hh.discountPercent||0)}%${extraText ? ' · ' + extraText : ''}`
    : 'HH OFF';
  if (msg) msg.textContent = hh.bannerText || (hh.enabled ? 'Promos activas' : '');
}
function startHHCountdown(hh){
  stopHHTimer();
  state.hhLeftText = '';
  updateHHPill(hh);
  const end = Number(hh?.endsAt || 0);
  if (!hh.enabled || !end) return;
  const tick = ()=>{
    const left = end - Date.now();
    if (left <= 0){
      stopHHTimer();
      const token = String(end);
      const guard = sessionStorage.getItem(HH_REFRESH_GUARD_KEY);
      if (guard !== token){
        sessionStorage.setItem(HH_REFRESH_GUARD_KEY, token);
        state.hhLeftText = '00:00';
        updateHHPill({ ...hh, enabled:false }, state.hhLeftText);
        setTimeout(()=> { try{ location.reload(); }catch{} }, 250);
      } else {
        updateHHPill({ ...hh, enabled:false });
        state.hhLeftText = '';
      }
      return;
    }
    state.hhLeftText = fmtMMSS(left);
    updateHHPill(hh, state.hhLeftText);
  };
  tick();
  hhTimer = setInterval(tick, 1000);
}
function bindHappyHour(){
  if (state.unsubHH) { state.unsubHH(); state.unsubHH = null; }
  if (typeof DB.subscribeHappyHour === 'function'){
    state.unsubHH = DB.subscribeHappyHour(hh=>{
      state.menu = state.menu || {};
      state.menu.happyHour = {
        enabled: !!hh.enabled,
        discountPercent: Number(hh.discountPercent||0),
        bannerText: hh.bannerText || '',
        applyEligibleOnly: hh.applyEligibleOnly!==false,
        endsAt: hh?.endsAt!=null ? Number(hh.endsAt) : null
      };
      startHHCountdown(state.menu.happyHour);
      renderCards();
      state.cart.forEach(recomputeLine);
      updateCartBar();
    });
  } else {
    updateHHPill(state.menu?.happyHour || {enabled:false, discountPercent:0});
  }
}
function bindETA(){
  if (state.unsubETA){ state.unsubETA(); state.unsubETA = null; }
  if (typeof DB.subscribeETA === 'function'){
    state.unsubETA = DB.subscribeETA((text)=>{
      if (text == null) return;
      state.etaText = String(text || '7–10 min');
      state.etaSource = 'settings';
      document.querySelectorAll('[data-eta-text]').forEach(el=> el.textContent = state.etaText);
    });
  }
}

/* ======================= Ready feed / Analytics mínimos ======================= */
function subscribeOrdersShim(cb){
  if (typeof DB.subscribeOrders === 'function') return DB.subscribeOrders(cb);
  if (typeof DB.onOrdersSnapshot === 'function') return DB.onOrdersSnapshot(cb);
  if (typeof DB.subscribeActiveOrders === 'function') return DB.subscribeActiveOrders(cb);
  console.warn('No hay método de suscripción a órdenes en DB'); return ()=>{};
}
function startOrdersAnalytics(){
  if (state.unsubAnalytics){ state.unsubAnalytics(); state.unsubAnalytics=null; }
  state.unsubAnalytics = subscribeOrdersShim(()=>{
    // aquí podrías calcular topToday/ETA con tus utilidades existentes
  });
}

/* ======================= Init ======================= */
init();
async function init(){
  try { await ensureAuth(); } catch (e) { console.warn('anon auth fail', e); }
  try {
    state.customerName = localStorage.getItem('kiosk:name') || '';
    state.orderMeta.phone = localStorage.getItem('kiosk:phone') || '';
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

  if (sessionStorage.getItem('kioskAdmin') === '1') {
    state.adminMode = true;
  }
}

/* ======================= Miscelánea ======================= */
window.addEventListener('beforeunload', ()=>{
  try{ state.unsubHH?.(); state.unsubETA?.(); state.unsubTheme?.(); state.unsubReady?.(); state.unsubAnalytics?.(); }catch{}
});