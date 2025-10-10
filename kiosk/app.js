// /kiosk/app.js
// Kiosko con carrito, edición de líneas, metas de pedido y laterales.
// Happy Hour aplicado SOLO al precio base (no extras/DLC) + resumen por pedido.
// Suscripción en vivo a settings/happyHour (y a settings/eta si existe).
// Vista móvil “dashboard” (HH, ETA, Promos, Más vendidos) + feed READY.
// Logro: “Combo 3 minis”, aderezo sorpresa gratis al elegir extras.
// + Modal de seguimiento (QR + “Seguir ahora”) tras confirmar.
// + CTA flotante para promover seguimiento al cerrar carrito sin confirmar.
// + Cuenta regresiva HH con auto-refresh al terminar.
// + Sistema de temas festivos mexicanos (local/global) — requiere /shared/theme.js y /shared/db.js
// + Lealtad: registro sencillo + tarjeta coleccionable con chance Dorado (cupón -30%)

import { beep, toast } from '../shared/notify.js';
import * as DB from '../shared/db.js';
// agrega esta línea a tus imports de /shared/*
import { ensureAuth } from '../shared/firebase.js';
import { initThemeFromSettings, listThemes, applyThemeLocal } from '../shared/theme.js';
import { setTheme } from '../shared/db.js';


// === Feature flags seguros (apaga si algo falla) ===
const FEATURES = {
  combosUI: true,          // pestaña y tarjetas de combos
  comboSauceAsLine: false  // si false: dip incluido se anota en notes de Papas
};
/* ======================= Estado global ======================= */
const state = {
  menu: null,
  mode: 'mini',
  cart: [],
  customerName: '',
  orderMeta: { type: 'pickup', table: '', phone: '', payMethodPref: 'efectivo' },
// Evita dobles envíos
isSubmittingOrder: false,
  // Suscripciones
  unsubReady: null,
  unsubAnalytics: null,
  unsubHH: null,
  unsubETA: null,
  unsubTheme: null,

  // Analytics UI
  etaText: '7–10 min',
  etaSource: 'fallback',
  topToday: [],

  comboUnlocked: false,

  // Promoción seguimiento
  followCtaShown: false,

  // Happy Hour countdown (solo UI)
  hhLeftText: '',

  // Admin local
  adminMode: false,

  // Tema activo
  themeName: '',

  // Última orden creada (para seguimiento sin teléfono / CTA mesa)
  lastOrderId: null,

  // ===== Lealtad / coleccionables =====
  loyaltyEnabled: true,
  loyaltyAskShown: false,
  loyaltyOptIn: false,
  lastCollectible: null,   // {rarity, name, title, palette, meta}
lastVoucher: null,       // {code, pct, expiresAt}
  // ===== Combo Drink Seven =====
  drinkComboActive: false, // UI/sonido controlado por ensureDrinkPrices()
  
  gift: {
    threshold: 117,
    productId: 'powerdog-mini',
    sound: '../shared/sfx/combo-unlocked.mp3', // coloca tu mp3 aquí
    autoPrompt: true,
    shownThisSession: false
  },
};
/* ======================= Bebidas: precios + maridajes ======================= */
/** Precio sugerido para lata 355 ml */
const DRINK_PRICE = { solo: 20, combo: 17 };
/** Detección flexible por id o por nombre (por si cambian ids en catálogo) */
function findDrinkFlexible(key=''){
  const list = state.menu?.drinks || [];
  const k = String(key).toLowerCase();
  // 1) por id exacto
  let d = list.find(x => String(x.id||'').toLowerCase() === k);
  if (d) return d;
  // 2) por nombre contiene
  d = list.find(x => String(x.name||'').toLowerCase().includes(k));
  return d || null;
}

/** Sugerencias de maridaje por producto base (id base o nombre) */
const PAIRING_BY_BURGER = {
  // pon los ids base que ya usas (starter, koopa, fatality, mega…)
  starter: [
    { key: '7up',         line: '✨ Resalta frescura y notas verdes' },
    { key: 'agua',        line: 'Ligero y limpia paladar' }
  ],
  koopa: [
    { key: 'pepsi',       line: 'Equilibra el umami especiado' },
    { key: 'canada',      line: 'Ginger + picor: maridaje top' }
  ],
  fatality: [
    { key: 'canada',      line: 'Jengibre + sabores intensos = ❤️' },
    { key: '7up',         line: 'Cítrico para refrescar el picor' }
  ],
  mega: [
    { key: 'pepsi',       line: 'Cuerpo y caramelo con carne 85g' },
    { key: 'agua',        line: 'Para quien busca ligereza' }
  ]
};
/** Texto por defecto si no hay un mapeo explícito */
const PAIRING_FALLBACK = [
  { key: '7up',   line: 'Cítrico y crujiente: realza los verdes' },
  { key: 'pepsi', line: 'Clásico con carnes + queso' }
];

/** Subtotal de líneas NO-bebida (excluye regalos) */
function subtotalSinBebidas(cart = state.cart){
  return cart.reduce((a,l)=>{
    if (!l || l.isGift) return a;
    if (l.type === 'drink') return a;
    return a + Number(l.lineTotal||0);
  }, 0);
}
/** Regla: Combo Seven activo si subtotal sin bebidas ≥ $77 */
function isDrinkComboUnlocked(cart = state.cart){
  return subtotalSinBebidas(cart) >= 77;
}
/** Recalcula precios de las bebidas según contexto combo/solo */
function ensureDrinkPrices(cart = state.cart){
  const unlocked = isDrinkComboUnlocked(cart);
  const target   = unlocked ? DRINK_PRICE.combo : DRINK_PRICE.solo;

  // Si cambia el estado del combo, avisamos 1 vez (sonido solo al desbloquear).
  if (unlocked !== state.drinkComboActive){
    state.drinkComboActive = unlocked;
    if (unlocked) {
      try { playAchievement(); } catch {}
      toast('🎉 ¡Desbloqueaste Combo Drink Seven! Bebidas y obtienes un descuento');
    } else {
      toast('Combo Drink Seven desactivado — bebidas a $20');
    }
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

/** Agrega una bebida al carrito aplicando el precio correcto en ese momento */
function addDrinkToCart(drink){
  if (!drink) return;
  const comboOn = isDrinkComboUnlocked();           // <— antes usaba cartHasFood()
  const price = comboOn ? DRINK_PRICE.combo : DRINK_PRICE.solo;
  state.cart.push({
    id: drink.id,
    type: 'drink',
    name: drink.name,
    qty: 1,
    unitPrice: Number(drink.price||0),
    baseIngredients: [],
    salsaDefault: null,
    salsaCambiada: null,
    extras: { sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
    notes: '',
    lineTotal: price,
    hhDisc: 0,
    meta: { pricingMode: comboOn ? 'combo' : 'solo' }
  });
  updateCartBar(); beep(); toast(`${drink.name} agregado`);
}
/** Helper: invocar por clave flexible (id o nombre) */
function addDrinkByKey(key){
  const d = findDrinkFlexible(key);
  if (!d) { toast('Bebida no disponible'); return; }
  addDrinkToCart(d);
}
/* ====== ETA tuning ====== */
let etaSmoothed = null;
const ETA_MAX_SAMPLES = 30;
const ETA_ALPHA = 0.4;
const ETA_MIN = 5, ETA_MAX = 25;

/* ======================= Recursos visuales ======================= */
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

/* ======================= Tema: leer nombre activo ======================= */
function readThemeNameFromDOM(){
  const root = document.documentElement;
  const dataAttr =
    root.getAttribute('data-theme-name') ||
    root.getAttribute('data-theme') ||
    root.dataset?.themeName ||
    root.dataset?.theme || '';
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

  // Listener opcional si alguien dispara theme:changed manualmente
  window.addEventListener('theme:changed', ()=>{
    const newName = readThemeNameFromDOM();
    if (newName !== state.themeName){ state.themeName = newName; renderCards(); }
  });

  // Chequeos extra por si el tema llega asíncrono
  let ticks = 0;
  const id = setInterval(()=>{
    const newName = readThemeNameFromDOM();
    if (newName !== state.themeName){ state.themeName = newName; renderCards(); }
    if (++ticks > 40) clearInterval(id);
  }, 500);
}

/* ======================= SFX logro ======================= */
let achievementAudio = null;
try { achievementAudio = new Audio('../shared/sfx/achievement.mp3'); } catch {}
async function playAchievement(){
  try { if (achievementAudio) { await achievementAudio.play(); return; } beep(); }
  catch { beep(); }
}

/* ======================= SFX regalo (Combo Unlocked) ======================= */
let giftAudio = null;
try { giftAudio = new Audio(state.gift.sound); } catch {}
async function playGiftSfx(){
  try { if (giftAudio) { await giftAudio.play(); return; } beep(); }
  catch { beep(); }
}

/* ======================= Login oculto (PIN) ======================= */
const brand = document.getElementById('brandTap');
let tapCount = 0, tapTimer = null;
brand?.addEventListener('click', ()=>{
  if (tapTimer) clearTimeout(tapTimer);
  tapCount++;
  tapTimer = setTimeout(()=> tapCount = 0, 2000);
  if (tapCount >= 7) { tapCount = 0; openPinModal(); }
});
function openPinModal(){
  const pinModal = document.getElementById('pinModal');
  const pinInput = document.getElementById('pinInput');
  const pinGo    = document.getElementById('pinGo');
  const pinClose = document.getElementById('pinClose');
  const map = {
    '1111':'../mesero/index.html',
    '2222':'../cocina/index.html',
    '9999':'../admin/index.html'
  };
  const show = ()=>{ if(pinModal){ pinModal.style.display='grid'; setTimeout(()=>pinInput?.focus(),0); } };
  const hide = ()=>{ if(pinModal){ pinModal.style.display='none'; if(pinInput) pinInput.value=''; } };
  const enter = ()=>{
    const pin = (pinInput?.value||'').trim();
    if (pin === '7777') {
      state.adminMode = true;
      sessionStorage.setItem('kioskAdmin','1');
      mountThemePanel();
      toast('Modo admin local habilitado (Temas GLOBAL disponibles)');
      hide();
      return;
    }
    const route = map[pin];
    if (!route){ toast('PIN incorrecto'); return; }
    hide(); location.href = route;
  };
  show(); if(pinGo) pinGo.onclick = enter; if(pinClose) pinClose.onclick = hide;
  if(pinInput) pinInput.onkeydown = e=>{ if(e.key==='Enter') enter(); };
}

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

/* ======================= Init ======================= */
init();
async function init(){
  // ✅ Garantiza sesión anónima desde el arranque del kiosko
  try { await ensureAuth(); } catch (e) { console.warn('anon auth fail', e); }
  // Intenta Firestore/DB; si falla, usa el JSON local de /data
  try {
    state.menu = await DB.fetchCatalogWithFallback();
    if (!state.menu || (!state.menu.minis && !state.menu.burgers)) {
      throw new Error('fetchCatalogWithFallback devolvió vacío');
    }
  } catch (e) {
    console.warn('[kiosk] Catálogo via DB falló o vino vacío:', e);
    try {
      const res = await fetch('../data/menu.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.menu = await res.json();
      console.log('[kiosk] Cargado menú desde /data/menu.json');
    } catch (e2) {
      console.error('[kiosk] También falló el menú local:', e2);
      alert('No pude cargar el menú. Revisa /data/menu.json y la consola.');
      state.menu = { minis: [], burgers: [], drinks: [], sides: [], extras:{} };
    }
  }

  startThemeWatcher();
  ensureDrinkPrices();
  renderCards();
  setActiveTab('mini');
  enableCombosTab();    // 👈 aquí, ya hay menú y tabs
  updateCartBar();
  setupSidebars();
  renderMobileInfo();

  ensureFollowModal();
  ensureFollowCta();
  ensureGiftModal(); // pre-carga modal de regalo para evitar primer “lag”
  bindHappyHour();
  bindETA();
  setupReadyFeed();
  startOrdersAnalytics();

  if (state.unsubTheme) { try{ state.unsubTheme(); }catch{} state.unsubTheme = null; }

  // Aplica tema de settings/localStorage
  state.unsubTheme = initThemeFromSettings({ defaultName: 'Independencia' });

  // Si el backend publica un tema dedicado, lo aplicamos de inmediato
  if (typeof DB.subscribeTheme === 'function') {
    try {
      DB.subscribeTheme((t)=>{
        const name = (t?.name || '').trim();
        if (name) {
          applyThemeLocal(name);
          state.themeName = name;
          renderCards();
          try { window.dispatchEvent(new CustomEvent('theme:changed',{ detail:{ name } })); } catch {}
        }
      });
    } catch {}
  }

  if (sessionStorage.getItem('kioskAdmin') === '1') {
    state.adminMode = true;
    mountThemePanel();
  }

  // Montar modal de lealtad
  ensureLoyaltyModal();
}

/* ======================= Utilidades base ======================= */
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);
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
  return src.map(s => /^Carne(\b|\s|$)/i.test(String(s)) ? `Carne ${grams} g` : s);
}
function slug(s){
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}function normalizeExtraIngredients(){
  const raw = state.menu?.extras?.ingredients ?? [];
  const defaultPrice = Number(state.menu?.extras?.ingredientPrice ?? 0);

  // Regex para nombres tipo "Carne 85g", "Carne 80 g", etc.
  const isCarneGrande = (name='') => /^carne\s*(8[0-9]|9[0-9]|100)\s*g$/i.test(
    String(name).replace(/\s+/g,' ').trim()
  );

  return raw
    .map(x=>{
      if (typeof x === 'string') return { id: slug(x), name: x, price: defaultPrice };
      return { id: x.id || slug(x.name), name: x.name, price: Number(x.price ?? defaultPrice) };
    })
    // ⛔️ Oculta "Carne 85g/90g/100g..." para no duplicar con el DLC de minis
    .filter(obj => !isCarneGrande(obj?.name));
}
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
function randomPick(weighted){
  // weighted: [{value, w}]
  const sum = weighted.reduce((a,x)=>a+(x.w||0),0);
  let r = Math.random() * sum;
  for (const x of weighted){
    r -= (x.w||0);
    if (r <= 0) return x.value;
  }
  return weighted[weighted.length-1]?.value;
}

/* ======================= Utilidades base ======================= */
// … money, findItemById, baseOfItem, formatIngredientsFor, slug,
// normalizeExtraIngredients, escapeHtml, randomPick, etc.

/** Sanitizador: quita `undefined` de forma segura para Firestore.
 *  - Convierte `undefined` → `null`
 *  - Mantiene fechas (Date) intactas
 *  - Normaliza números no finitos (NaN/±Infinity) → null
 *  - Recorre arrays y objetos recursivamente
 */
function sanitize(value){
  if (value === undefined) return null;
  if (value === null) return null;

  if (typeof value === 'number' && !Number.isFinite(value)) return null;

  if (Array.isArray(value)) return value.map(sanitize);

  if (value && typeof value === 'object'){
    if (value instanceof Date) return value; // por si en algún punto envías fechas
    const clean = {};
    for (const k of Object.keys(value)) clean[k] = sanitize(value[k]);
    return clean;
  }

  return value;
}
/* ========= Seguimiento ========= */
function normalizePhone(raw=''){ return String(raw).replace(/\D+/g,'').slice(0,15); }

/** Construye URL de tracking. Ahora soporta teléfono o orderId (para “Mesa”). */
function buildTrackUrl({ phone='', orderId=null } = {}){
  const u = new URL('./track.html', location.href);
  const clean = normalizePhone(phone || '');
  if (orderId) u.searchParams.set('oid', String(orderId));
  if (clean)   u.searchParams.set('phone', clean);
  u.searchParams.set('autostart', '1');
  u.searchParams.set('gamify', '1'); // activa tamagochi/coleccionable en track.js
  return u.toString();
}

/* ========= WhatsApp ========= */
async function sendWaOrderCreated({ phone, name, orderId, subtotal, etaText, hhTotalDiscount=0 }) {
  if (!phone) return;
  try {
    const trackUrl = buildTrackUrl({ phone, orderId });
    const etaLine = etaText ? `ETA: ${etaText}\n` : '';
    const hhLine  = (Number(hhTotalDiscount||0) > 0) ? `Promo HH: -$${Number(hhTotalDiscount||0).toFixed(0)}\n` : '';
    const text =
      `¡Hola ${name || ''}! Recibimos tu pedido en Seven de Burgers 🍔.\n` +
      etaLine + hhLine +
      `Total estimado: $${Number(subtotal||0).toFixed(0)}\n` +
      `Sigue tu pedido aquí: ${trackUrl}`;
    const res = await DB.sendWhatsAppMessage({
      to: `52${phone}`,
      text,
      meta: { kind: 'order_created', orderId }
    });
    if (!res?.ok) console.warn('WA not sent:', res);
  } catch (e) { console.warn('WA error:', e); }
}

/* ===== Modal de seguimiento ===== */
function ensureFollowModal(){
  if (document.getElementById('trackAskModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'trackAskModal';
  wrap.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;place-items:center;background:rgba(0,0,0,.4);backdrop-filter:saturate(120%) blur(2px)';
  wrap.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="trackTtl"
         style="max-width:760px;width:calc(100% - 24px);background:#0f182a;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px">
      <div class="modal-head" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <h3 id="trackTtl" style="margin:0">¿Quieres seguir tu pedido?</h3>
        <button id="trackClose" class="btn ghost" aria-label="Cerrar">✕</button>
      </div>
      <p class="muted" style="margin:6px 0 10px">Puedes verlo aquí mismo o abrirlo en tu teléfono escaneando el QR.</p>

      <div class="grid" style="display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:center">
        <div class="qr-box"
             style="width:200px;height:200px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#0b1424;display:grid;place-items:center;overflow:hidden">
          <img id="trackQrImg" alt="QR para abrir seguimiento"
               style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated"/>
        </div>
        <div>
          <div class="row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <input id="trackUrl" type="url" readonly style="flex:1 1 auto;min-width:200px" />
            <button class="btn ghost" id="trackCopy">Copiar enlace</button>
          </div>
          <div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="btn" id="trackOpenNow">Seguir ahora</button>
            <button class="btn ghost" id="trackClose2">No, gracias</button>
          </div>
          <div class="muted small" style="margin-top:8px">
            Tip: pega este enlace en un mensaje o WhatsApp si el cliente quiere verlo después.
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('#trackClose')?.addEventListener('click', closeFollowModal);
  wrap.querySelector('#trackClose2')?.addEventListener('click', closeFollowModal);
  wrap.addEventListener('click', (e)=>{ if (e.target === wrap) closeFollowModal(); });
}
function closeFollowModal(){ const m = document.getElementById('trackAskModal'); if (m) m.style.display = 'none'; }
function openFollowModal({ phone, orderId } = {}){
  ensureFollowModal();
  const m = document.getElementById('trackAskModal'); if (!m) return;

  const url = buildTrackUrl({ phone: phone || '', orderId: orderId || state.lastOrderId || null });
  const qr = m.querySelector('#trackQrImg');
  const linkEl = m.querySelector('#trackUrl');
  const copyBtn = m.querySelector('#trackCopy');
  const openNow = m.querySelector('#trackOpenNow');

  const size = 200;
  const api = 'https://api.qrserver.com/v1/create-qr-code/';
  const src = `${api}?size=${size}x${size}&qzone=2&data=${encodeURIComponent(url)}`;
  if (qr) qr.src = src;
  if (linkEl) linkEl.value = url;

  if (openNow){
    const hasKey = !!normalizePhone(phone || '') || !!(orderId || state.lastOrderId);
    openNow.disabled = !hasKey;
    openNow.title = hasKey ? '' : 'No tengo teléfono ni ID de pedido';
    openNow.onclick = ()=> { window.location.href = url; };
  }
  if (copyBtn){
    copyBtn.onclick = async ()=>{
      try{
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = '¡Copiado!';
        setTimeout(()=> copyBtn.textContent = 'Copiar enlace', 1200);
      }catch{ alert('No pude copiar. Selecciona el texto y copia manualmente.'); }
    };
  }
  m.style.display = 'grid';
  setTimeout(()=> openNow?.focus(), 0);
}

/* ======================= Modal regalo PowerDog ======================= */
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
    addGiftLine();
    close();
    toast('🎁 PowerDog Mini agregado (Regalo)');
  });
}
function openGiftModal(){ ensureGiftModal(); const m=document.getElementById('giftModal'); if(m) m.style.display='grid'; }

/* ======================= CTA flotante ======================= */
function ensureFollowCta(){
  if (document.getElementById('followCta')) return;
  const cta = document.createElement('div');
  cta.id = 'followCta';
  cta.style.cssText = `
    position:fixed;right:12px;bottom:12px;z-index:9998;display:none;
    background:#0f182a;border:1px solid rgba(255,255,255,.08);border-radius:12px;
    padding:10px;box-shadow:0 10px 24px rgba(0,0,0,.25);max-width:84vw;`;
  cta.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="min-width:0">
        <div style="font-weight:700">¿Quieres seguir tu pedido?</div>
        <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          Ábrelo en tu teléfono con un QR o enlace.
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-left:auto">
        <button class="btn" id="ctaFollowOpen">Abrir</button>
        <button class="btn ghost" id="ctaFollowClose">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(cta);
  cta.querySelector('#ctaFollowClose')?.addEventListener('click', ()=> hideFollowCta());
  cta.querySelector('#ctaFollowOpen')?.addEventListener('click', ()=>{
    hideFollowCta();
    openFollowModal({
      phone: (state.orderMeta?.type==='pickup' ? state.orderMeta?.phone : '') || '',
      orderId: (state.orderMeta?.type==='dinein' ? state.lastOrderId : null)
    });
  });
}
function showFollowCta(){ ensureFollowCta(); const c = document.getElementById('followCta'); if (c) c.style.display='block'; }
function hideFollowCta(){ const c = document.getElementById('followCta'); if (c) c.style.display='none'; }

/* ======================= Happy Hour ======================= */
let hhTimer = null;
const HH_REFRESH_GUARD_KEY = 'hhRefreshGuard-app';
const fmtMMSS = (ms)=>{
  const s = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(s/60);
  const ss = s%60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
};
function stopHHTimer(){ if(hhTimer){ clearInterval(hhTimer); hhTimer=null; } }
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
function updateHHPill(hh, extraText=''){
  const pill = document.getElementById('hhPill');
  const txt  = document.getElementById('hhText');
  const msg  = document.getElementById('hhMsg');
  if (!pill || !txt) return;
  pill.classList.toggle('on', !!hh.enabled);
  txt.textContent = hh.enabled
    ? `Happy Hour – ${Number(hh.discountPercent||0)}%${extraText ? ' · ' + extraText : ''}`
    : 'HH OFF';
  if (msg) msg.textContent = hh.bannerText || (hh.enabled ? 'Promos activas por tiempo limitado' : '');
}
function startHHCountdown(hh){
  stopHHTimer();
  state.hhLeftText = '';
  updateHHPill(hh);
  const end = Number(hh?.endsAt || 0);
  if (!hh.enabled || !end) { renderMobileInfo(); return; }
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
        renderMobileInfo();
        setTimeout(()=> { try{ location.reload(); }catch{} }, 250);
      } else {
        updateHHPill({ ...hh, enabled:false });
        state.hhLeftText = '';
        renderMobileInfo();
      }
      return;
    }
    state.hhLeftText = fmtMMSS(left);
    updateHHPill(hh, state.hhLeftText);
    renderMobileInfo();
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
      renderMobileInfo();
    });
  }else{
    updateHHPill(state.menu?.happyHour || {enabled:false, discountPercent:0});
  }
}

/* ======================= ETA (settings + fallback) ======================= */
function bindETA(){
  if (state.unsubETA){ state.unsubETA(); state.unsubETA = null; }
  if (typeof DB.subscribeETA === 'function'){
    state.unsubETA = DB.subscribeETA((text)=>{
      if (text == null) return;
      state.etaText = String(text || '7–10 min');
      state.etaSource = 'settings';
      document.querySelectorAll('[data-eta-text]').forEach(el=> el.textContent = state.etaText);
      renderMobileInfo();
    });
  }
}

/* ======================= Carrito / logro ======================= */
function miniCount(cart=state.cart){
  return cart.reduce((sum, l)=> sum + ((l.mini ? l.qty||1 : 0)), 0);
}
function checkComboAchievement(){
  if (!state.comboUnlocked && miniCount() >= 3){
    state.comboUnlocked = true;
    playAchievement();
    toast('🎉 ¡Combo de 3 minis logrado!');
  }
}

/* ======================= Desbloqueo de regalo por ticket ======================= */
function hasGiftInCart(){
  return state.cart.some(l => l.isGift && l.id === state.gift.productId);
}
function cartTotal(){
  return state.cart.reduce((a,l)=> a + Number(l.lineTotal||0), 0);
}
function addGiftLine(){
  // Busca plantilla desde el catálogo si existe (GIFT_TEMPLATES) o crea una línea simple
  const tpl = (state.menu?.giftTemplates && state.menu.giftTemplates[state.gift.productId]) || null;
  const line = tpl ? {
    ...tpl,
    qty: 1,
    unitPrice: 0,
    lineTotal: 0,
    hhDisc: 0
  } : {
    id: state.gift.productId,
    name: 'PowerDog Mini (Regalo)',
    mini: true,
    isGift: true,
    qty: 1,
    unitPrice: 0,
    lineTotal: 0,
    baseIngredients: ['Pan mini','Salchicha','Queso blanco','Aderezo cheddar','Cebolla blanca','Salsa chimichurri'],
    extras: { sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
    notes: '',
    hhDisc: 0
  };
  state.cart.push(line);
  // Asegura precios actualizados antes de renderizar el contenido del carrito
  ensureDrinkPrices();
  updateCartBar();
  // Checar desbloqueo de regalo cada vez que cambia el carrito
  checkGiftUnlock(!state.gift.shownThisSession);
}

function checkGiftUnlock(autoOpen=true){
  const total = cartTotal();
  const already = hasGiftInCart();
  if (total >= Number(state.gift.threshold) && !already){
    // Modal solo una vez por sesión de carrito, hasta que el usuario cambie el total
    if (state.gift.autoPrompt && autoOpen){
      playGiftSfx();
      openGiftModal();
      state.gift.shownThisSession = true;
    }
  } else {
    // Si bajó del umbral, resetea el flag para volver a mostrar cuando suba otra vez
    if (total < Number(state.gift.threshold)) state.gift.shownThisSession = false;
    // Si el total bajó y había regalo, lo retiramos automáticamente
    if (total < Number(state.gift.threshold) && already){
      state.cart = state.cart.filter(l => !(l.isGift && l.id===state.gift.productId));
      updateCartBar();
      toast('Regalo removido (bajaste de $' + Number(state.gift.threshold).toFixed(0) + ')');
    }
  }
}

function getThemeIconFor(baseId){
  const preset = window.__lastThemePreset || {};
  const base   = preset.packBaseUrl || '';
  const map    = preset.icons || {};
  const rel    = map?.[baseId];
  if (!rel || !base) return null;
  try {
    return new URL(rel, window.location.origin + base).toString();
  } catch {
    return null;
  }
}
/* ======================= Tarjetas ======================= */

/* ======================= Combos (modo seguro) ======================= */
function addComboToCart(combo){
  try{
    // Meta por defecto para papas
    const sideTpl = findItemById('papasgajo');
    const defMeta = {
      grams: Number(sideTpl?.grams ?? 150),
      seasoningId: sideTpl?.seasoningId || 'ajo-gamer',
      seasoningGrams: Number(sideTpl?.seasoningGrams ?? 1.0),
      sauce: sideTpl?.sauce || 'Aderezo Cheddar 2oz'
    };

    // 1) Burgers/minis del combo
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

    // 2) Papas gajo con meta (y nota para cocina)
    (combo.items||[]).filter(i=>i.kind==='side' && i.id==='papasgajo').forEach(i=>{
      const side = sideTpl || { id:'papasgajo', name:'Papas Gajo', price:27 };
      const d = hhDiscountPerUnit(side);
      const eff = Math.max(0, Number(side.price||0) - d);
      const meta = {
        grams: Number(i.grams ?? defMeta.grams),
        seasoningId: i.seasoningId || defMeta.seasoningId,
        seasoningGrams: Number(i.seasoningGrams ?? defMeta.seasoningGrams),
        sauce: defMeta.sauce
      };
      const metaTxt = `PAPAS META: ${meta.grams}g · ${meta.seasoningId} (${meta.seasoningGrams}g) · ${meta.sauce}`;
      state.cart.push({
        id:'papasgajo', type:'side', name: side.name, qty: i.qty||1,
        unitPrice: Number(side.price||0),
        baseIngredients:[],
        extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
        meta,
        notes: metaTxt,
        lineTotal: eff*(i.qty||1),
        hhDisc: d*(i.qty||1)
      });
    });

    // 3) Dip incluido (no como línea, lo anotamos en la nota de papas)
    (combo.items||[]).filter(i=>i.kind==='sauce').forEach(i=>{
      if (FEATURES.comboSauceAsLine){
        state.cart.push({
          id:'combo-sauce', type:'sauce', name:`${i.name} (incluido)`, qty:i.qty||1,
          unitPrice:0, lineTotal:0, hhDisc:0, isGift:true,
          extras:{sauces:[],ingredients:[],dlcCarne:false,surpriseSauce:null}, notes:''
        });
      } else {
        const papas = state.cart.find(l=>l.type==='side' && l.id==='papasgajo');
        if (papas) papas.notes = (papas.notes ? papas.notes+' · ' : '') + `Dip incluido: ${i.name} (2oz)`;
      }
    });

    // 4) Bebida por defecto
    if (combo.includesDrink && combo.defaultDrinkId){
      const d = (state.menu?.drinks||[]).find(x=>x.id===combo.defaultDrinkId);
      if (d) addDrinkToCart(d);
    }

    ensureDrinkPrices();
    updateCartBar(); beep(); toast(`${combo.name} agregado`);
  } catch(e){
    console.warn('addComboToCart fail', e);
    toast('No pude agregar el combo');
  }
}
function renderCards(){
  const grid = document.getElementById('cards');
  if (!grid) return;
  grid.innerHTML = '';

  let items;
  if (state.mode === 'mini') {
    items = state.menu?.minis || [];
  } else if (state.mode === 'big') {
    items = state.menu?.burgers || [];
  } else if (state.mode === 'combos') {
    items = state.menu?.combos || [];
  } else {
    items = state.menu?.minis || [];
  }

  items.forEach(it => {
    const base   = baseOfItem(it);
    const baseId = base?.id || it.id;
    const mxThemeOn = /independencia|méx|mex|patria|viva/i.test(String(state.themeName || ''));
    const themedSrc = getThemeIconFor(baseId);
    const iconSrc = themedSrc
      || ((mxThemeOn && ICONS_MEX[baseId]) ? ICONS_MEX[baseId] : (ICONS[baseId] || null));

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
        ${iconSrc 
          ? `<img src="${iconSrc}" alt="${it.name}" class="icon-img" loading="lazy"/>`
          : `<div class="icon" aria-hidden="true"></div>`}
      </div>
      <div class="row">
        ${priceHtml}
        <div class="row" style="gap:8px">
          ${isCombo ? '' : `<button class="btn ghost small" data-a="ing">Ingredientes</button>`}
          <button class="btn small" data-a="order">${isCombo ? 'Ordenar combo' : 'Ordenar'}</button>
        </div>
      </div>
    `;
    grid.appendChild(card);

    if (isCombo) {
      card.querySelector('[data-a="order"]')
        ?.addEventListener('click', () => addComboToCart(it));
    } else {
      card.querySelector('[data-a="ing"]')
        ?.addEventListener('click', () => {
          alert(`${it.name}\n\nIngredientes:\n- ${formatIngredientsFor(it, base).join('\n- ')}`);
        });
      card.querySelector('[data-a="order"]')
        ?.addEventListener('click', () => openItemModal(it, base));
    }
  });

  // 👇 Agrega o actualiza la pestaña "Combos" si hay combos en el menú
  enableCombosTab();
}// Botón opcional de Combos si hay combos en el menú
function enableCombosTab(){
  if (!FEATURES.combosUI) return;
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
/* ======================= Modal producto ======================= */
function openItemModal(item, base, existingIndex=null){
  const modal = document.getElementById('modal'); modal?.classList.add('open');
  const body  = document.getElementById('mBody');
  const ttl   = document.getElementById('mTitle');
  const xBtn  = document.getElementById('mClose');
  if(ttl) ttl.textContent = `${item.name} · ${money(item.price)}`;
  if(xBtn) xBtn.onclick = ()=> modal?.classList.remove('open');

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
  body.innerHTML = `
    <div class="field"><label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required value="${state.customerName||''}"/></div>
    ${ item.mini && (DLC > 0) ? `
    <div class="field"><label>DLC de Carne grande</label>
      <div class="ul-clean">
        <input type="checkbox" id="dlcCarne" ${dlcOn?'checked':''}/>
        <label for="dlcCarne">Cambia a carne 85g</label>
        <span class="tag">(+${money(DLC)})</span>
      </div>
    </div>` : '' }
    <div class="hr"></div>
    <div class="field"><label>Cambia la salsa base (sin costo)</label>
      <select id="swapSauce"><option value="">Dejar salsa por defecto</option>
        ${((base?.salsasSugeridas || [base?.suggested]).filter(Boolean) || [])
           .map(s=>`<option value="${s}" ${swapVal===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <div class="muted small">* Los aderezos de abajo se cobran aparte.</div>
    </div>
    <div class="field"><label>Aderezos extra</label>
      <div class="ul-clean" id="sauces">
        ${sauces.map((s,i)=>`
          <input type="checkbox" id="s${i}" ${hasSauce(s)?'checked':''}/>
          <label for="s${i}">${s}</label>
          <span class="tag">(+${money(SP)})</span>`).join('')}
      </div>
    </div>
    <div class="field"><label>Ingredientes extra</label>
      <div class="ul-clean" id="ingrs">
        ${extrasIngr.map((obj,i)=>`
          <input type="checkbox" id="e${i}" ${hasIngr(obj.name)?'checked':''}/>
          <label for="e${i}">${obj.name}</label>
          <span class="tag">(+${money(obj.price)})</span>`).join('')}
      </div>
    </div>
    <div class="field"><label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="${qtyVal}"/>
    </div>
    <div class="field"><label>Comentarios a cocina</label>
      <textarea id="notes" placeholder="sin jitomate, poco picante…">${notesVal}</textarea>
    </div>`;
/* ======== Bloque de maridaje (bebidas) ======== */
/* ======== Bloque de maridaje (bebidas) ======== */
try {
  const holder = document.createElement('div');
  holder.className = 'field';
  holder.innerHTML = `
    <label>Maridaje sugerido</label>
    <div class="muted small" style="margin:.25rem 0 .5rem">
      Bebida recomendada para mejorar la experiencia de sabor (opcional).
    </div>
    <div id="pairBox" class="ul-clean" style="gap:6px;flex-wrap:wrap"></div>

    <div class="row" style="gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
      <button class="btn tiny ghost" id="toggleAllDrinks" type="button">
        …o elegir cualquier bebida
      </button>
      <div id="allDrinksWrap" style="display:none;align-items:center;gap:6px;flex-wrap:wrap">
        <select id="allDrinksSel" style="min-width:180px"></select>
        <button class="btn tiny" id="addSelectedDrink" type="button">Agregar</button>
      </div>
    </div>
  `;

  const notesField = body.querySelector('#notes')?.closest('.field');
  if (notesField) body.insertBefore(holder, notesField); else body.appendChild(holder);

  const baseId   = (base?.id || item?.baseOf || item?.id || '').toString().toLowerCase();
  const pairDefs = PAIRING_BY_BURGER[baseId] || PAIRING_FALLBACK;

  const box       = holder.querySelector('#pairBox');
  const wrapAll   = holder.querySelector('#allDrinksWrap');
  const btnToggle = holder.querySelector('#toggleAllDrinks');
  const selAll    = holder.querySelector('#allDrinksSel');
  const btnAddSel = holder.querySelector('#addSelectedDrink');

  // Render botones de maridaje
  function updatePairButtons(){
    const comboOn = isDrinkComboUnlocked();
    box.innerHTML = '';
    pairDefs.forEach(p => {
      const d = findDrinkFlexible(p.key);
      if (!d) return;
      const btn = document.createElement('button');
      btn.className = 'btn tiny';
      btn.type = 'button';
      btn.setAttribute('data-add-drink', String(p.key));
      btn.textContent = `${d.name} · $${comboOn ? DRINK_PRICE.combo : DRINK_PRICE.solo}`;
      btn.title = p.line || '';
      box.appendChild(btn);
    });
  }

  // Render select con TODAS las bebidas
  function updateAllDrinksSelect(){
    const all = state.menu?.drinks || [];
    const comboOn = isDrinkComboUnlocked();
    selAll.innerHTML = all.map(d =>
      `<option value="${d.id}">${d.name} · $${comboOn ? DRINK_PRICE.combo : DRINK_PRICE.solo}</option>`
    ).join('');
  }

  updatePairButtons();
  updateAllDrinksSelect();

  // Toggle del selector “todas las bebidas”
  btnToggle?.addEventListener('click', ()=>{
    wrapAll.style.display = (wrapAll.style.display === 'none' || !wrapAll.style.display) ? 'flex' : 'none';
    if (wrapAll.style.display === 'flex') updateAllDrinksSelect();
  });

  // Click en botones de maridaje
  holder.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-add-drink]');
    if(!b) return;
    addDrinkByKey(b.getAttribute('data-add-drink'));
    // Después de agregar, refrescamos precios visibles por si el combo se activó
    updatePairButtons();
    updateAllDrinksSelect();
  });

  // Agregar bebida desde el selector general
  btnAddSel?.addEventListener('click', ()=>{
    const id = selAll?.value;
    const d = (state.menu?.drinks || []).find(x => x.id === id);
    if (!d) { toast('Bebida no disponible'); return; }
    addDrinkToCart(d);
    updatePairButtons();
    updateAllDrinksSelect();
  });

} catch {} 
  const addBtn = document.getElementById('mAdd');
  if (addBtn) addBtn.textContent = editing ? 'Guardar cambios' : 'Agregar al pedido';

  const totalEl = document.getElementById('mTotal');
  const qtyEl   = document.getElementById('qty');
  const inputs  = body.querySelectorAll('input[type=checkbox], #qty, #swapSauce');

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
    addBtn.onclick = ()=>{
      const name = (document.getElementById('cName')?.value||'').trim();
      if(!name){ alert('Por favor escribe tu nombre.'); return; }
      state.customerName = name;

      const { qty, subtotal, dlcChk, hhDiscTotal } = calc();
      const saucesSel = [...body.querySelectorAll('#sauces input')].map((el,i)=> el.checked? sauces[i]: null).filter(Boolean);
      const ingrSel   = [...body.querySelectorAll('#ingrs input')].map((el,i)=> el.checked? extrasIngr[i].name: null).filter(Boolean);
      const salsaSwap = (document.getElementById('swapSauce')?.value || '') || null;
      const notes     = (document.getElementById('notes')?.value || '').trim();

      let surpriseSauce = null;
      if ((saucesSel.length + ingrSel.length) > 0){
        const pool = (state.menu?.extras?.sauces || []).filter(s => !saucesSel.includes(s));
        if (pool.length) {
          const idx = (state.cart.length + qty) % pool.length;
          surpriseSauce = pool[idx];
        }
      }

      const newLine = {
  id: item.id, name: item.name, mini: !!item.mini, qty,
  unitPrice: Number(item.price||0),

  // Base para cocina y tablet
  baseIngredients: formatIngredientsFor(item, base),

  // 👇 Alias que la tablet también entiende
  ingredients: formatIngredientsFor(item, base), // duplicado por compat
  adds: ingrSel,                                 // agregados visibles
  removes: [],                                   // si luego das opción de quitar, pon aquí

  // Salsas
  salsaDefault: base?.salsaDefault || base?.suggested || null,
  salsaCambiada: salsaSwap,

  // Extras (mantenemos los campos actuales, pero añadimos adds/removes como alias)
  extras: {
    sauces: saucesSel,
    ingredients: ingrSel,
    adds: ingrSel,       // 👈 alias para legacy
    removes: [],         // 👈 alias para legacy
    dlcCarne: !!dlcChk,
    surpriseSauce: surpriseSauce || null
  },

  notes,
  lineTotal: subtotal,
  hhDisc: hhDiscTotal
};

      if (existingIndex!==null){
  state.cart[existingIndex] = newLine;
  ensureDrinkPrices();          // ← ajusta bebidas
  toast('Línea actualizada');
} else {
  state.cart.push(newLine);
  ensureDrinkPrices();          // ← ajusta bebidas
  toast('Agregado al pedido');
}

      checkComboAchievement();
      document.getElementById('modal')?.classList.remove('open');
      updateCartBar(); beep();
    };
  }
}

/* ======================= Carrito ======================= */
const cartBar = document.getElementById('cartBar');
document.getElementById('openCart')?.addEventListener('click', openCartModal);

function updateCartBar(){
  const count = state.cart.reduce((a,l)=>a + (l.qty||1), 0);
  const total = state.cart.reduce((a,l)=>a + (l.lineTotal||0), 0);
  const countEl = document.getElementById('cartCount');
  const totalEl = document.getElementById('cartBarTotal');
  if (countEl) countEl.textContent = `${count} producto${count!==1?'s':''}`;
  if (totalEl) totalEl.textContent = money(total);
  if (cartBar) cartBar.style.display = count>0 ? 'flex' : 'none';

  // Revisa si toca desbloquear o retirar el regalo al cambiar el carrito
  checkGiftUnlock(!state.gift.shownThisSession);
}

function openCartModal(){
  ensureDrinkPrices();
  const m = document.getElementById('cartModal');
  const body = document.getElementById('cartBody');
  const close = ()=> { if(m) m.style.display='none'; if(!state.followCtaShown){ showFollowCta(); state.followCtaShown = true; } };
  document.getElementById('cartClose')?.addEventListener('click', close, { once:true });
  if(m) m.style.display='grid';

  const confirmBtn = document.getElementById('cartConfirm');
  const totalEl    = document.getElementById('cartTotal');

  if(state.cart.length===0){
    if(body) body.innerHTML = '<div class="muted">Tu carrito está vacío, elige un personaje de sabor.</div>';
    if (confirmBtn) confirmBtn.style.display = 'none';
    if (totalEl) totalEl.style.display = 'none';
    return;
  }

  if (confirmBtn) confirmBtn.style.display = '';
  if (totalEl) totalEl.style.display = '';

  if(body) body.innerHTML = `
    <div class="field"><label>Nombre del cliente</label>
      <input id="cartName" type="text" required value="${state.customerName||''}" /></div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px">
      <div class="field">
        <label>Tipo de pedido</label>
        <select id="orderType">
          <option value="pickup" ${state.orderMeta.type!=='dinein'?'selected':''}>Pickup (para llevar)</option>
          <option value="dinein"  ${state.orderMeta.type==='dinein'?'selected':''}>Mesa</option>
        </select>
      </div>

      <div class="field" id="phoneField" style="${state.orderMeta.type==='pickup'?'':'display:none'}">
        <label>Teléfono de contacto (Pickup)</label>
        <input id="phoneNum" type="tel" inputmode="numeric" autocomplete="tel" maxlength="10"
               placeholder="10 dígitos" pattern="[0-9]{10}" value="${state.orderMeta.phone||''}" />
        <div class="muted small">Lo usamos solo para avisarte cuando tu pedido esté listo.</div>
        <div class="muted small" style="margin-top:6px">
          <label style="display:flex;gap:8px;align-items:center">
            <input id="loyaltyOpt" type="checkbox" ${state.loyaltyOptIn?'checked':''}/>
            <span>Quiero guardar mi tarjeta y participar por premios</span>
          </label>
        </div>
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
          ...(l.extras?.ingredients||[]).map(s=>'Extra: '+s),
          (l.extras?.surpriseSauce ? 'Sorpresa 🎁: '+l.extras.surpriseSauce : '')
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
    </div>

    <div class="field"><label>Comentarios generales</label>
      <textarea id="cartNotes" placeholder="comentarios para todo el pedido"></textarea></div>`;

  const typeSel    = document.getElementById('orderType');
  const mesaField  = document.getElementById('mesaField');
  const phoneField = document.getElementById('phoneField');
  const phoneInput = document.getElementById('phoneNum');
  const paySel     = document.getElementById('payMethod');
  const loyaltyOpt = document.getElementById('loyaltyOpt');

  if (loyaltyOpt){
    loyaltyOpt.addEventListener('change', ()=>{
      state.loyaltyOptIn = !!loyaltyOpt.checked;
    });
  }

  if (phoneInput){
    phoneInput.addEventListener('input', ()=>{
      const pos = phoneInput.selectionStart ?? phoneInput.value.length;
      phoneInput.value = normalizePhone(phoneInput.value);
      try { phoneInput.setSelectionRange(pos, pos); } catch {}
    });
    phoneInput.addEventListener('change', async ()=>{
      const p = normalizePhone(phoneInput.value);
      if (p.length >= 10){
        const c = await DB.fetchCustomer?.(p);
        if (c?.name){
          const nameEl = document.getElementById('cartName');
          if (nameEl && !nameEl.value) nameEl.value = c.name;
        }
      }
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

  refreshCartTotals();

  if (body){
    body.onclick = (e)=>{
      const btn = e.target.closest('button[data-a]'); if (!btn) return;
      const card = btn.closest('[data-i]'); if (!card) return;
      const i = parseInt(card.dataset.i, 10);
      const line = state.cart[i]; if (!line) return;
      const act = btn.dataset.a;

 if (act === 'remove') {
  state.cart.splice(i, 1);
  ensureDrinkPrices();                  // si quitaste la última comida, bebidas vuelven a “solo”
  updateCartBar(); openCartModal();
  return;
}

if (act === 'more') {
  line.qty = Math.min(99, (line.qty || 1) + 1);
  if (line?.type === 'drink') {         // bebidas: su precio lo maneja ensureDrinkPrices
    ensureDrinkPrices();
    updateCartBar(); openCartModal();
    return;
  }
  recomputeLine(line);
  ensureDrinkPrices();                  // por si este “+” activa combo para bebidas
  updateCartBar(); openCartModal();
  checkComboAchievement();
  return;
}

if (act === 'less') {
  line.qty = Math.max(1, (line.qty || 1) - 1);
  if (line?.type === 'drink') {
    ensureDrinkPrices();
    updateCartBar(); openCartModal();
    return;
  }
  recomputeLine(line);
  ensureDrinkPrices();                  // por si este “-” desactiva combo
  updateCartBar(); openCartModal();
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
  }

  // ⚠️ Importante: evitar listeners acumulados en "Confirmar pedido"
  if (confirmBtn) {
    confirmBtn.onclick = null; // limpia cualquier handler anterior
    confirmBtn.onclick = async ()=>{
  // 👉 anti‑doble‑tap
  if (state.isSubmittingOrder) return;
  state.isSubmittingOrder = true;
// Asegura precios actualizados antes de renderizar el contenido del carrito
  ensureDrinkPrices();
  // feedback UI
  const prevLabel = confirmBtn.textContent;
  confirmBtn.disabled = true;
  confirmBtn.setAttribute('aria-busy','true');
  confirmBtn.textContent = 'Enviando…';

  try {
    const name = (document.getElementById('cartName')?.value||'').trim();
    if(!name){ alert('Escribe tu nombre'); return; }
    state.customerName = name;

    state.orderMeta.type  = (document.getElementById('orderType')?.value||'pickup');
    state.orderMeta.payMethodPref = (document.getElementById('payMethod')?.value || 'efectivo');

    if(state.orderMeta.type==='dinein'){
      state.orderMeta.table = (document.getElementById('tableNum')?.value||'').trim();
      if(!state.orderMeta.table){ alert('Indica el número de mesa.'); return; }
      state.orderMeta.phone = '';
    } else {
      const raw = (document.getElementById('phoneNum')?.value || '');
      const norm = normalizePhone(raw);
      if(norm.length < 10){
        alert('Para Pickup, ingresa un teléfono de 10 dígitos.');
        return;
      }
      state.orderMeta.phone = norm;
      state.orderMeta.table = '';
    }

   // === Notas generales ingresadas en el carrito
const generalNotes = (document.getElementById('cartNotes')?.value || '').trim();

// === Filtrar líneas: no mandar regalos al backend y sumar una nota para cocina
const giftNotes = [];
    const itemsForDB = state.cart.map(l => ({
  id: l.id,
  name: l.name,
  mini: l.mini,
  qty: l.qty,
  unitPrice: l.unitPrice,

  // Base + alias
  baseIngredients: l.baseIngredients,
  ingredients: l.ingredients || l.baseIngredients || [], // 👈 alias para tablet

  // Salsas
  salsaDefault: l.salsaDefault,
  salsaCambiada: l.salsaCambiada,

  // Extras + alias agregados/removidos
  extras: l.extras,
  adds: l.adds || l.extras?.adds || l.extras?.ingredients || [],   // 👈 alias
  removes: l.removes || l.extras?.removes || [],                    // 👈 alias

  notes: l.notes || null,
  lineTotal: l.lineTotal,
  hhDisc: Number(l.hhDisc || 0),
  isGift: !!l.isGift
})).filter(l => {
  if (l.isGift) {
    giftNotes.push(`• ${l.name} x${l.qty}`);
    return false;
  }
  return true;
});

// === Nota compuesta para cocina (incluye los regalos)
const notesForKitchen = [
  generalNotes,
  giftNotes.length ? `REGALO: agregar sin costo:\n${giftNotes.join('\n')}` : ''
].filter(Boolean).join('\n');

// === Totales SOLO con líneas no-regalo
const subtotal = itemsForDB.reduce((a, l) => a + (l.lineTotal || 0), 0);
const hhTotalDiscount = itemsForDB.reduce((a, l) => a + Number(l.hhDisc || 0), 0);

// === Resumen HH
const hh = state.menu?.happyHour || { enabled:false, discountPercent:0, applyEligibleOnly:true };
const hhSummary = {
  enabled: !!hh.enabled,
  discountPercent: Number(hh.discountPercent || 0),
  applyEligibleOnly: hh.applyEligibleOnly !== false,
  totalDiscount: Number(hhTotalDiscount || 0)
};

// ID idempotente desde cliente
const clientId = `c_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
const provisionalId = `O-${Date.now()}-${Math.floor(Math.random()*1000)}`;

// === Pedido a persistir (sin regalos)
const orderBase = {
  clientId,
  customer: state.customerName,
  orderType: state.orderMeta.type,
  table: state.orderMeta.type === 'dinein' ? state.orderMeta.table : null,
  phone: state.orderMeta.type === 'pickup' ? state.orderMeta.phone : null,
  payMethodPref: state.orderMeta.payMethodPref || 'efectivo',
  items: itemsForDB,
  subtotal,
  notes: notesForKitchen,           // ⬅️ cocina verá aquí el/los regalos
  hh: hhSummary,
  createdAt: Date.now()
};
    let orderId = null;
    try {
      const created = await DB.createOrder(sanitize(orderBase));
      orderId = (typeof created === 'string') ? created : created?.id;
    } catch (e) {
      console.warn('createOrder error, usando provisional:', e);
    }
    if (!orderId) orderId = provisionalId;

    state.lastOrderId = orderId;

    try { localStorage.setItem(`prepMetrics:${orderId}`, JSON.stringify({ createdAt: orderBase.createdAt })); } catch {}

    if (orderBase.phone) {
      await DB.upsertCustomerFromOrder?.({ ...orderBase, id: orderId }).catch(()=>{});
      await DB.attachLastOrderRef?.(orderBase.phone, orderId).catch(()=>{});
      sendWaOrderCreated({
        phone: orderBase.phone,
        name: orderBase.customer,
        orderId,
        subtotal: orderBase.subtotal,
        etaText: state.etaText || '7–10 min',
        hhTotalDiscount: orderBase?.hh?.totalDiscount || 0
      });
    }

    beep();
    toast(`Gracias ${state.customerName}, te avisaremos cuando esté listo 🛎️`);
    state.cart = []; updateCartBar();
    const mm = document.getElementById('cartModal'); if(mm) mm.style.display='none';

    setTimeout(()=>{
      openFollowModal({
        phone: orderBase.phone || state.orderMeta.phone || '',
        orderId
      });
    }, 200);

    if (state.loyaltyEnabled && !state.loyaltyAskShown) {
      state.loyaltyAskShown = true;
      setTimeout(()=>{
        openLoyaltyModal({
          name: orderBase.customer || '',
          phone: orderBase.phone || '',
          orderId
        });
      }, 500);
    }
  } finally {
    // 🧹 reactivar UI solo si aún está abierto (si cerraste, da igual)
    state.isSubmittingOrder = false;
    confirmBtn.disabled = false;
    confirmBtn.removeAttribute('aria-busy');
    confirmBtn.textContent = prevLabel;
  }
};
  }
}
function recomputeLine(line){
  if (line?.type === 'drink') return;  // ← bebidas: su total lo calcula ensureDrinkPrices()

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
function refreshCartTotals(){
  const total = state.cart.reduce((a,l)=> a + (l.lineTotal||0), 0);
  const totalEl = document.getElementById('cartTotal');
  if (totalEl){
    totalEl.textContent = money(total);
    totalEl.style.display = state.cart.length ? '' : 'none';
  }
}

/* ======================= Laterales ======================= */
function setupSidebars(){
  const hh = state.menu?.happyHour || { enabled:false, discountPercent:0, bannerText:'' };
  const pill = document.getElementById('hhPill');
  const txt  = document.getElementById('hhText');
  const msg  = document.getElementById('hhMsg');
  if (pill && txt){
    pill.classList.toggle('on', !!hh.enabled);
    txt.textContent = hh.enabled
      ? `Happy Hour – ${hh.discountPercent}%${state.hhLeftText ? ' · ' + state.hhLeftText : ''}`
      : 'HH OFF';
    if (msg) msg.textContent = hh.bannerText || (hh.enabled ? 'Promos activas por tiempo limitado' : '');
  }
  const eta = document.getElementById('etaTime');
  if (eta) eta.textContent = state.etaText || '7–10 min';
  renderMobileInfo();

  const upsell = document.getElementById('upsellList');
  if (upsell){
    const picks = [];
    if (state.menu?.drinks?.length) picks.push(...state.menu.drinks.slice(0,2));
    if (state.menu?.sides?.length)  picks.push(...state.menu.sides.slice(0,2));
    if (!picks.length) picks.push(...(state.menu?.minis||[]).slice(0,3));
    upsell.innerHTML = picks.map(p => {
  // 👇 Mostrar base $20 para bebidas; lo demás queda igual
  const displayPrice = (p.type === 'drink')
    ? DRINK_PRICE.solo            // => 20
    : Number(p.price || 0);

  return `
    <li>
      <div style="flex:1 1 auto;min-width:0">
        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div class="muted small">${(p.type||'').toUpperCase()}</div>
      </div>
      <div class="price">${money(displayPrice)}</div>
      <button class="btn tiny" data-add="${p.id}">Agregar</button>
    </li>`;
}).join('');
  }

  const promo = document.getElementById('promoList');
  if (promo){
    promo.innerHTML = hh.enabled
      ? `<li><div style="flex:1">Combos con descuento</div><div class="price">-${hh.discountPercent}%</div></li>`
      : `<li><div style="flex:1">Prueba nuestras minis ⭐</div><div class="price">Desde ${money((state.menu?.minis?.[0]?.price)||0)}</div></li>`;
  }

  const rank = document.getElementById('rankToday');
  if (rank){
    const rows = (state.topToday.length
        ? state.topToday.map(t=>`<li><div style="flex:1">${t.name}</div><div class="muted small">🔥 ${t.count}</div></li>`)
        : (state.menu?.minis||[]).slice(0,3).concat((state.menu?.burgers||[]).slice(0,2))
            .map(p=>`<li><div style="flex:1">${p.name}</div><div class="muted small">🔥</div></li>`))
      .join('');
    rank.innerHTML = rows;
  }
}

/* ======================= Dashboard móvil ======================= */
function renderMobileInfo(){
  const box = document.getElementById('mobileInfo'); if(!box) return;

  const hh = state.menu?.happyHour || { enabled:false, discountPercent:0, bannerText:'' };
  const pill = document.getElementById('miHHPill');
  const txt  = document.getElementById('miHHText');
  const msg  = document.getElementById('miHHMsg');
  pill?.classList.toggle('on', !!hh.enabled);
  if (txt) txt.textContent = hh.enabled
    ? `${hh.discountPercent}% OFF${state.hhLeftText ? ' · ' + state.hhLeftText : ''}`
    : 'OFF';
  if (msg) msg.textContent = hh.bannerText || (hh.enabled ? 'Promos activas por tiempo limitado' : '');

  const etaL = document.getElementById('etaTime'); if (etaL) etaL.textContent = state.etaText || '7–10 min';
  const etaM = document.getElementById('miEta');   if (etaM) etaM.textContent = state.etaText || '7–10 min';

  const promo = document.getElementById('miPromos');
  if (promo){
    promo.innerHTML = hh.enabled
      ? `<li style="display:flex;justify-content:space-between;gap:8px;"><span>Combos con descuento</span><span class="price">-${hh.discountPercent}%</span></li>`
      : `<li style="display:flex;justify-content:space-between;gap:8px;"><span>Prueba nuestras minis ⭐</span><span class="price">Desde ${money((state.menu?.minis?.[0]?.price)||0)}</span></li>`;
  }

  const top = document.getElementById('miTop');
  if (top){
    const chips = (state.topToday?.length ? state.topToday : [])
      .map(t=> `<span class="mi-chip">${t.name} (${t.count})</span>`).join('');
    top.innerHTML = chips || `<span class="muted small">Aún sin datos hoy</span>`;
  }
}

/* ======================= “Más vendidos hoy” + ETA ======================= */
function tsToMs(t){
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds) return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
  const d = new Date(t); const ms = d.getTime(); return Number.isFinite(ms) ? ms : 0;
}
function isToday(ms){
  if(!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
}
function computeTopToday(orders){
  const acc = new Map();
  for (const o of (orders||[])){
    const created = tsToMs(o.createdAt);
    if (!isToday(created)) continue;
    const s = (o.status||'').toUpperCase();
    if (s==='CANCELLED' || s==='CANCELED') continue;
    for (const it of (o.items||[])){
      const k = it.name || it.id || '—';
      const add = Number(it.qty||1);
      acc.set(k, (acc.get(k)||0) + add);
    }
  }
  state.topToday = [...acc.entries()]
    .map(([name,count])=>({name, count}))
    .sort((a,b)=> b.count - a.count)
    .slice(0,5);
}
function computeETA(orders){
  if (state.etaSource === 'settings') return;
  const base = {min:7, max:10};
  const samples = [];
  for (const o of (orders||[])){
    const created = tsToMs(o.createdAt);
    const ready   = tsToMs(o.readyAt || o.doneAt || (o.timestamps?.readyAt) || (o.timestamps?.doneAt));
    if (!created || !ready) continue;
    if (!isToday(ready)) continue;
    const st = (o.status||'').toUpperCase();
    if (st!=='READY' && st!=='DONE') continue;
    const mins = (ready - created)/60000;
    if (mins>0 && mins<120) samples.push(mins);
  }
  if (samples.length >= 3){
    const recent = samples.slice(-ETA_MAX_SAMPLES).sort((a,b)=>a-b);
    const cut = Math.max(1, Math.floor(recent.length*0.1));
    const trimmed = recent.slice(cut, recent.length - cut);
    const avg = trimmed.reduce((a,n)=>a+n,0)/trimmed.length;
    etaSmoothed = (etaSmoothed==null) ? avg : (ETA_ALPHA*avg + (1-ETA_ALPHA)*etaSmoothed);
    const lo = Math.max(ETA_MIN, Math.round(etaSmoothed - 2));
    const hi = Math.min(ETA_MAX, Math.round(etaSmoothed + 2));
    state.etaText = `${lo}–${hi} min`;
  } else {
    // Ajuste por carga actual
    const q = (orders||[]).filter(o=>{
      const s = (o.status||'').toUpperCase();
      return s==='PENDING' || s==='IN_PROGRESS';
    }).length;
    if (q>0){
      const bump = Math.min(12, Math.ceil(q*1.5));
      const lo = base.min + Math.floor(bump/2);
      const hi = base.max + bump;
      state.etaText = `${lo}–${hi} min`;
    } else {
      state.etaText = `${base.min}–${base.max} min`;
    }
  }
  document.querySelectorAll('[data-eta-text]').forEach(el=> el.textContent = state.etaText);
}
function subscribeOrdersShim(cb){
  if (typeof DB.subscribeOrders === 'function') return DB.subscribeOrders(cb);
  if (typeof DB.onOrdersSnapshot === 'function') return DB.onOrdersSnapshot(cb);
  if (typeof DB.subscribeActiveOrders === 'function') return DB.subscribeActiveOrders(cb);
  console.warn('No hay método de suscripción a órdenes en DB'); return ()=>{};
}
function startOrdersAnalytics(){
  if (state.unsubAnalytics){ state.unsubAnalytics(); state.unsubAnalytics=null; }
  state.unsubAnalytics = subscribeOrdersShim((orders)=>{
    computeTopToday(orders);
    computeETA(orders);
    renderMobileInfo();
  });
}

/* ======================= Feed READY ======================= */
function setupReadyFeed(){
  const container = document.getElementById('readyFeed'); if (!container) return;
  if (state.unsubReady) { state.unsubReady(); state.unsubReady = null; }
  state.unsubReady = subscribeOrdersShim(list=>{
    const ready = (list||[]).filter(o=> (o.status||'')==='READY')
      .sort((a,b)=> oTime(b) - oTime(a))
      .slice(0,6);
    const rows = ready.map(o=>{
      const items = (o.items||[]);
      const count = items.reduce((n,i)=> n + (i.qty||1), 0);
      const names = items.map(i=>i.name).slice(0,2).join(', ');
      return `<li>
        <div style="flex:1;min-width:0">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${escapeHtml(o.customer||'—')}</b> · ${count} it.</div>
          <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(names)}</div>
        </div>
        <div class="price">🛎️</div>
      </li>`;
    }).join('');
    container.innerHTML = rows || '<li><div class="muted small">—</div></li>';
  });
}
function oTime(o){ return o.createdAt?.toMillis?.() ?? new Date(o.createdAt||0).getTime(); }

/* ======================= Upsell rápido ======================= */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-add]'); if(!btn) return;
  const id = btn.getAttribute('data-add');
  const all = [
    ...(state.menu?.drinks||[]), ...(state.menu?.sides||[]),
    ...(state.menu?.minis||[]),  ...(state.menu?.burgers||[])
  ];
  const item = all.find(x=>x.id===id); if(!item) return;

  if (item.type === 'drink') {
    addDrinkToCart(item);
    return;
  }

 if (item.type === 'side') {
  const defMeta = {
    grams: Number(item.grams ?? 150),
    seasoningId: item.seasoningId || 'ajo-gamer',
    seasoningGrams: Number(item.seasoningGrams ?? 1.0),
    sauce: item.sauce || 'Aderezo Cheddar 2oz'
  };
  const hhDiscPerUnit = hhDiscountPerUnit(item);
  const unitBaseAfterHH = Math.max(0, Number(item.price||0) - hhDiscPerUnit);
  state.cart.push({
    id:item.id, type:'side', name:item.name, mini:false, qty:1,
    unitPrice:Number(item.price||0),
    baseIngredients:[], salsaDefault:null, salsaCambiada:null,
    extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
    meta: defMeta,
    notes: `PAPAS META: ${defMeta.grams}g · ${defMeta.seasoningId} (${defMeta.seasoningGrams}g) · ${defMeta.sauce}`,
    lineTotal: unitBaseAfterHH,
    hhDisc: hhDiscPerUnit
  });
  ensureDrinkPrices();
  updateCartBar(); beep(); toast(`${item.name} agregado`);
  return;
}
  // Para burgers/minis: abre modal (si quisieras “agregar directo”, usa el bloque de arriba análogo)
  openItemModal(item, item.baseOf ? state.menu?.burgers?.find(b=>b.id===item.baseOf) : item);
}, false);
/* ======================= THEME panel ======================= */
function mountThemePanel() {
  if (document.getElementById('theme-floating-panel')) return;
  const box = document.createElement('div');
  box.id = 'theme-floating-panel';
  Object.assign(box.style, {
    position: 'fixed',
    right: '12px',
    bottom: 'calc(var(--safe-bottom) + 12px)',
    background: 'rgba(0,0,0,.75)',
    backdropFilter: 'blur(4px)',
    padding: '10px',
    border: '1px solid rgba(255,255,255,.2)',
    borderRadius: '14px',
    zIndex: 9999,
    color: 'var(--text)',
    fontSize: '12px',
    maxWidth: '260px',
    boxShadow: '0 10px 30px rgba(0,0,0,.35)'
  });

  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.justifyContent = 'space-between';
  head.style.gap = '8px';
  const title = document.createElement('strong');
  title.textContent = 'Tema (MX)';
  title.style.fontSize = '12px';
  const toggle = document.createElement('button');
  toggle.textContent = '—';
  Object.assign(toggle.style, {
    background: 'transparent', border: '1px solid rgba(255,255,255,.2)',
    borderRadius: '8px', color: 'var(--text)', padding: '2px 6px', cursor: 'pointer'
  });

  const body = document.createElement('div'); body.style.marginTop = '8px';
  toggle.addEventListener('click', ()=>{ body.style.display = (body.style.display==='none') ? 'block':'none'; });

  const row1 = document.createElement('div');
  row1.style.display = 'grid'; row1.style.gridTemplateColumns = '1fr'; row1.style.gap = '6px';
  const labelSel = document.createElement('label'); labelSel.textContent = 'Selecciona tema:';
  const select = document.createElement('select');
  Object.assign(select.style, { width:'100%', padding:'6px', borderRadius:'8px', border:'1px solid rgba(255,255,255,.2)' });
  for (const name of listThemes()) {
    const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.appendChild(opt);
  }

  const row2 = document.createElement('div');
  row2.style.display = 'grid'; row2.style.gridTemplateColumns = '1fr 1fr'; row2.style.gap = '6px';

  const btnLocal = document.createElement('button');
  btnLocal.textContent = 'Probar local';
  Object.assign(btnLocal.style, {
    padding:'8px', borderRadius:'10px', border:'1px solid rgba(255,255,255,.2)', background:'var(--accent)', cursor:'pointer'
  });

  const btnGlobal = document.createElement('button');
  btnGlobal.id = 'btnThemeGlobal';
  btnGlobal.textContent = 'Aplicar GLOBAL';
  btnGlobal.title = 'Requiere modo admin (PIN 7777)';
  Object.assign(btnGlobal.style, {
    padding:'8px',
    borderRadius:'10px',
    border:'1px solid rgba(255,255,255,.2)',
    background:'var(--accent-2)',
    cursor:'pointer',
    display: state.adminMode ? '' : 'none'
  });

  const msg = document.createElement('div'); msg.style.marginTop = '6px'; msg.style.opacity = '.9';

  btnLocal.addEventListener('click', ()=>{
    const name = select.value;
    applyThemeLocal(name);
    state.themeName = name;
    renderCards();
    try { window.dispatchEvent(new CustomEvent('theme:changed',{ detail:{ name } })); } catch {}
    setMsg('Tema aplicado localmente.', 'ok');
  });

  btnGlobal.addEventListener('click', async ()=>{
    const name = select.value;
    try {
      await setTheme({ name });
      applyThemeLocal(name);
      state.themeName = name;
      renderCards();
      try { window.dispatchEvent(new CustomEvent('theme:changed',{ detail:{ name } })); } catch {}
      setMsg('Tema GLOBAL actualizado. Kioskos lo aplicarán en vivo.', 'ok');
    } catch (e) {
      console.error(e); setMsg('Error al guardar tema global.', 'err');
    }
  });

  function setMsg(text, kind='ok'){
    msg.textContent = text;
    msg.style.color = (kind==='ok'?'#A7F3D0': kind==='warn'?'#FFE082':'#FFABAB');
  }

  head.appendChild(title); head.appendChild(toggle);
  row1.appendChild(labelSel); row1.appendChild(select);
  row2.appendChild(btnLocal); row2.appendChild(btnGlobal);
  body.appendChild(row1); body.appendChild(row2); body.appendChild(msg);
  box.appendChild(head); box.appendChild(body);
  document.body.appendChild(box);

  if (state.adminMode) {
    const g = document.getElementById('btnThemeGlobal');
    if (g) g.style.display = '';
  }
}

/* ======================= Lealtad / Coleccionables ======================= */
function ensureLoyaltyModal(){
  if (document.getElementById('loyaltyModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'loyaltyModal';
  wrap.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;place-items:center;background:rgba(0,0,0,.5);backdrop-filter:blur(2px)';
  wrap.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="loyTtl"
         style="max-width:760px;width:calc(100% - 24px);background:#0f182a;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px">
      <div class="modal-head" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <h3 id="loyTtl" style="margin:0">¡Guarda tu tarjeta y destapa tu recompensa!</h3>
        <button id="loyClose" class="btn ghost" aria-label="Cerrar">✕</button>
      </div>
      <p class="muted" style="margin:6px 0 10px">Regístrate para conservar tus coleccionables y desbloquear sorpresas. Si te sale Dorado obtienes <b>30% de descuento</b> en tu siguiente visita.</p>

      <div id="loyStepForm">
        <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
          <div class="field"><label>Nombre</label><input id="loyName" type="text" placeholder="Tu nombre"/></div>
          <div class="field"><label>Teléfono</label><input id="loyPhone" type="tel" inputmode="numeric" placeholder="10 dígitos"/></div>
          <div class="field"><label>Cumpleaños</label><input id="loyBirth" type="date"/></div>
          <div class="field"><label>Picor favorito</label>
            <select id="loyHeat">
              <option value="">Elige…</option>
              <option>Suave</option><option>Medio</option><option>Picante</option><option>🔥 Brutal</option>
            </select>
          </div>
          <div class="field"><label>Salsa favorita</label>
            <select id="loySauce">
              <option value="">Elige…</option>
              ${(state.menu?.extras?.sauces||['BBQ','Chipotle','Ajo','Habanero']).map(s=>`<option>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="row" style="gap:8px;margin-top:10px">
          <button id="loyOpen" class="btn">Destapar tarjeta</button>
          <button id="loySkip" class="btn ghost">Luego</button>
        </div>
      </div>

      <div id="loyStepResult" style="display:none">
        <div id="loyCard" class="k-card" style="margin:8px 0;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.08)"></div>
        <div id="loyVoucher" class="muted" style="margin-top:8px"></div>
        <div class="row" style="gap:8px;margin-top:12px">
          <button id="loyDone" class="btn">Listo</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap) closeLoyaltyModal(); });
  wrap.querySelector('#loyClose')?.addEventListener('click', closeLoyaltyModal);
  wrap.querySelector('#loySkip')?.addEventListener('click', closeLoyaltyModal);
  wrap.querySelector('#loyDone')?.addEventListener('click', closeLoyaltyModal);

  // acciones
  wrap.querySelector('#loyOpen')?.addEventListener('click', async ()=>{
    const name  = (document.getElementById('loyName')?.value||'').trim() || state.customerName || '';
    const phone = normalizePhone((document.getElementById('loyPhone')?.value||state.orderMeta.phone||'').trim());
    const birth = (document.getElementById('loyBirth')?.value||'').trim();
    const heat  = (document.getElementById('loyHeat')?.value||'').trim();
    const sauce = (document.getElementById('loySauce')?.value||'').trim();

    if (phone.length < 10){
      alert('Para guardar tu tarjeta, ingresa un teléfono de 10 dígitos.'); return;
    }

    // Persistir perfil (best-effort)
    try{
      await DB.upsertCustomerProfile?.({ phone, name, birthday: birth || null, prefs: { heat, sauce } });
    }catch(e){ console.warn('upsertCustomerProfile fail', e); }

    // Roll coleccionable
    const roll = rollCollectible(); // {rarity, title, meta}
    state.lastCollectible = roll;

    // Guardar coleccionable (best-effort)
    try{
      await DB.saveCollectibleCard?.({
        phone, // dueño
        orderId: state.lastOrderId || null,
        rarity: roll.rarity,
        title: roll.title,
        name: roll.meta?.name,
        theme: roll.meta?.theme || 'default',
        palette: roll.meta?.palette,
        createdAt: Date.now()
      });
    }catch(e){ console.warn('saveCollectibleCard fail', e); }

    // Si Dorado => crear cupón 30%
    let voucher = null;
    if (roll.rarity === 'Dorado'){
      try{
        const expiresAt = Date.now() + 1000*60*60*24*14; // 14 días
        voucher = await DB.createVoucher?.({
          phone, pct: 30, kind: 'golden_card', expiresAt
        });
      }catch(e){ console.warn('createVoucher fail', e); }
    }
    state.lastVoucher = voucher || null;

    // Render resultado
    renderLoyaltyResult(roll, voucher);
  });
}
function openLoyaltyModal({ name='', phone='', orderId=null } = {}){
  ensureLoyaltyModal();
  const wrap = document.getElementById('loyaltyModal'); if(!wrap) return;
  // Prefill
  const nameEl = wrap.querySelector('#loyName');
  const phoneEl= wrap.querySelector('#loyPhone');
  if (nameEl && !nameEl.value) nameEl.value = name || state.customerName || '';
  if (phoneEl && !phoneEl.value) phoneEl.value = normalizePhone(phone || state.orderMeta.phone || '');
  const sf = wrap.querySelector('#loyStepForm');
  const sr = wrap.querySelector('#loyStepResult');
  if (sf) sf.style.display = 'block';
  if (sr) sr.style.display = 'none';
  wrap.style.display = 'grid';
}
function closeLoyaltyModal(){
  const m = document.getElementById('loyaltyModal');
  if (m) m.style.display = 'none';
}
function rollCollectible(){
  // Probabilidades (suman 100)
  const rarity = randomPick([
    { value: 'Dorado', w: 3 },
    { value: 'Épico',  w: 12 },
    { value: 'Raro',   w: 35 },
    { value: 'Común',  w: 50 }
  ]);
  // Elegimos familia temática simple (ej. Mexi Bun o Pixel Pal)
  const families = [
    { name:'Mexi Bun', theme:'mex', palette:['#FBBF24','#DC2626','#22C55E','#FCD34D'] },
    { name:'Pixel Pal', theme:'pixel', palette:['#F59E0B','#6B7280','#EF4444','#0EA5E9'] },
    { name:'Glitch Burger', theme:'glitch', palette:['#8B5CF6','#EC4899','#2DD4BF','#1F2937'] },
    { name:'Golden Patty', theme:'gold', palette:['#FBBF24','#FCD34D','#9CA3AF','#1F2937'] },
    { name:'Party Burger', theme:'party', palette:['#EC4899','#6EE7B7','#FBBF24','#EF4444'] }
  ];
  const fam = families[Math.floor(Math.random()*families.length)];
  const byR = {
    'Común':  `Common collectible of "${fam.name}"`,
    'Raro':   `Rare collectible of "${fam.name}"`,
    'Épico':  `Epic collectible of "${fam.name}"`,
    'Dorado': `Gold collectible of "${fam.name}"`
  }[rarity];
  const title = `${byR}`;
  return {
    rarity,
    title,
    meta: { name: fam.name, theme: fam.theme, palette: fam.palette }
  };
}
function renderLoyaltyResult(roll, voucher){
  const wrap = document.getElementById('loyaltyModal'); if(!wrap) return;
  const stepForm = wrap.querySelector('#loyStepForm');
  const stepRes  = wrap.querySelector('#loyStepResult');
  const cardBox  = wrap.querySelector('#loyCard');
  const vBox     = wrap.querySelector('#loyVoucher');
  if (stepForm) stepForm.style.display = 'none';
  if (stepRes)  stepRes.style.display  = 'block';
  if (!cardBox || !vBox) return;

  const pal = (roll.meta?.palette||[]).join(', ');
  cardBox.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:72px;height:72px;border-radius:12px;background:linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.02));
                  display:grid;place-items:center;font-size:28px">🍔</div>
      <div>
        <div style="font-weight:800">${roll.title}</div>
        <div class="muted small">Palette (${pal}) · rareza: <b>${roll.rarity}</b></div>
      </div>
    </div>
  `;

  if (roll.rarity === 'Dorado'){
    const code = voucher?.code || '(cupón generado)';
    const until = voucher?.expiresAt ? new Date(voucher.expiresAt).toLocaleDateString() : '';
    vBox.innerHTML = `
      <div class="k-card" style="margin-top:8px;padding:10px;border-radius:12px;border:1px dashed rgba(255,255,255,.25)">
        <div style="font-weight:700">🎉 ¡Tarjeta Dorada! Cupón -30%</div>
        <div class="muted small">Código: <b>${code}</b> ${until?`· vence ${until}`:''}</div>
        <div class="muted small">Canjeable 1 vez. No acumulable con otras promos.</div>
      </div>`;
  } else {
    vBox.textContent = 'Sigue coleccionando — cada visita te da otra oportunidad de ganar premios. 🙌';
  }
}

/* ======================= Miscelánea ======================= */
window.addEventListener('beforeunload', ()=>{
  try{ state.unsubReady && state.unsubReady(); }catch{}
  try{ state.unsubAnalytics && state.unsubAnalytics(); }catch{}
  try{ state.unsubHH && state.unsubHH(); }catch{}
  try{ state.unsubETA && state.unsubETA(); }catch{}
  try{ state.unsubTheme && state.unsubTheme(); }catch{}
  try{ if(hhTimer) clearInterval(hhTimer); }catch{}
});
