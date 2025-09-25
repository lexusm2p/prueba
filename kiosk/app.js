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
import { initThemeFromSettings, listThemes, applyThemeLocal } from '../shared/theme.js';
import { setTheme } from '../shared/db.js';

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

  // ===== Regalo: PowerDog Mini por ticket >= $117 =====
  gift: {
    threshold: 117,
    productId: 'powerdog-mini',
    sound: '../shared/sfx/combo-unlocked.mp3', // coloca tu mp3 aquí
    autoPrompt: true,
    shownThisSession: false
  },
};

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
  const on  = el => { el?.classList.add('is-active'); el?.setAttribute('aria-selected','true'); };
  const off = el => { el?.classList.remove('is-active'); el?.setAttribute('aria-selected','false'); };
  if(mode==='mini'){ on(btnMinis); off(btnBig); } else { on(btnBig); off(btnMinis); }
}

/* ======================= Init ======================= */
init();
async function init(){
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
  renderCards();
  setActiveTab('mini');
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
}
function normalizeExtraIngredients(){
  const raw = state.menu?.extras?.ingredients ?? [];
  const defaultPrice = Number(state.menu?.extras?.ingredientPrice ?? 0);
  return raw.map(x=>{
    if (typeof x === 'string') return { id: slug(x), name: x, price: defaultPrice };
    return { id: x.id || slug(x.name), name: x.name, price: Number(x.price ?? defaultPrice) };
  });
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

/* ======================= Tarjetas ======================= */
function renderCards(){
  const grid = document.getElementById('cards');
  if(!grid) return;
  grid.innerHTML = '';
  const items = state.mode==='mini' ? (state.menu?.minis||[]) : (state.menu?.burgers||[]);
  items.forEach(it=>{
    const base = baseOfItem(it);
    const baseId = base?.id || it.id;
    const mxThemeOn = /independencia|méx|mex|patria|viva/i.test(String(state.themeName || ''));
    const iconSrc = (mxThemeOn && ICONS_MEX[baseId]) ? ICONS_MEX[baseId] : (ICONS[baseId] || null);
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `
      <h3>${it.name}</h3>
      <div class="media">
        ${iconSrc
          ? `<img src="${iconSrc}" alt="${it.name}" class="icon-img" loading="lazy"/>`
          : `<div class="icon" aria-hidden="true"></div>`}
      </div>
      <div class="row">
        ${(()=>{
          const disc = hhDiscountPerUnit(it);
          const eff  = Math.max(0, Number(it.price||0) - disc);
          return disc>0
            ? `<div class="price"><s style="opacity:.7">${money(it.price)}</s> <span class="tag">${money(eff)}</span></div>`
            : `<div class="price">${money(it.price)}</div>`;
        })()}
        <div class="row" style="gap:8px">
          <button class="btn ghost small" data-a="ing">Ingredientes</button>
          <button class="btn small" data-a="order">Ordenar</button>
        </div>
      </div>`;
    grid.appendChild(card);
    card.querySelector('[data-a="ing"]')?.addEventListener('click', ()=>{
      alert(`${it.name}\n\nIngredientes:\n- ${formatIngredientsFor(it, base).join('\n- ')}`);
    });
    card.querySelector('[data-a="order"]')?.addEventListener('click', ()=> openItemModal(it, base));
  });
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
    <div class="field"><label>Potenciar sabor (cambio sin costo)</label>
      <select id="swapSauce"><option value="">Dejar salsa por defecto</option>
        ${((base?.salsasSugeridas || [base?.suggested]).filter(Boolean) || [])
           .map(s=>`<option value="${s}" ${swapVal===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <div class="muted small">* Extras se cobran aparte.</div>
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
        baseIngredients: formatIngredientsFor(item,