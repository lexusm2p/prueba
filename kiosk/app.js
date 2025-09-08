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

import { beep, toast } from '../shared/notify.js';
import * as DB from '../shared/db.js';
// Temas (🎨): aplica en vivo desde Firestore y permite probar local
import { initThemeFromSettings, listThemes, applyThemeLocal } from '../shared/theme.js';

/* ======================= Estado global ======================= */
const state = {
  menu: null,
  mode: 'mini',
  cart: [],
  customerName: '',
  orderMeta: { type: 'pickup', table: '', phone: '', payMethodPref: 'efectivo' },

  // Suscripciones
  unsubReady: null,
  unsubAnalytics: null,
  unsubHH: null,
  unsubETA: null,
  unsubTheme: null,    // ← suscripción a settings/theme

  // Analytics UI
  etaText: '7–10 min',
  etaSource: 'fallback', // 'settings' si viene de subscribeETA
  topToday: [],

  comboUnlocked: false,

  // Promoción seguimiento
  followCtaShown: false,  // evita spam de CTA al cerrar carrito sin confirmar

  // Happy Hour countdown (solo UI)
  hhLeftText: '' // "mm:ss" cuando haya endsAt
};

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

let achievementAudio = null;
try { achievementAudio = new Audio('../shared/sfx/achievement.mp3'); } catch {}
async function playAchievement(){
  try { if (achievementAudio) { await achievementAudio.play(); return; } beep(); }
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
  state.menu = await DB.fetchCatalogWithFallback();
  renderCards();
  setActiveTab('mini');
  updateCartBar();
  setupSidebars();
  renderMobileInfo();

  // Asegura que existan los elementos para seguimiento (modal + CTA)
  ensureFollowModal();
  ensureFollowCta();

  bindHappyHour();       // HH en vivo + countdown + refresh
  bindETA();             // ETA (settings) si existe; si no, fallback por analytics
  setupReadyFeed();      // feed “Listos”
  startOrdersAnalytics();// top “Más vendidos hoy” + fallback de ETA si no hay settings

  // 🎨 THEME: suscripción en vivo a /settings/theme + panel flotante SOLO local
  if (state.unsubTheme) { try{ state.unsubTheme(); }catch{} state.unsubTheme = null; }
  state.unsubTheme = initThemeFromSettings({ defaultName: 'Independencia' });
  mountThemePanel(); // ocúltalo en prod si no lo quieres visible
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

// Normaliza ingredientes mostrando gramos correctos según mini/grande
function formatIngredientsFor(item, base){
  const meatDefaultBig  = Number(state.menu?.appSettings?.meatGrams ?? 85);
  const meatDefaultMini = Number(state.menu?.appSettings?.miniMeatGrams ?? 45);
  const grams = Number(item?.meatGrams ?? (item?.mini ? meatDefaultMini : meatDefaultBig));
  const src = (Array.isArray(item?.ingredients) && item.ingredients.length)
    ? item.ingredients
    : (base?.ingredients || []);
  // Reemplaza cualquier "Carne ..." por "Carne {grams} g"
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

/* ========= Seguimiento: helpers URL + modal + CTA flotante ========= */

// Normaliza a dígitos (hasta 15 por compatibilidad)
function normalizePhone(raw=''){ return String(raw).replace(/\D+/g,'').slice(0,15); }

// Construye URL de track con autostart si hay phone
function buildTrackUrl(phone){
  const u = new URL('./track.html', location.href);
  const clean = normalizePhone(phone || '');
  if (clean) u.searchParams.set('phone', clean);
  if (clean) u.searchParams.set('autostart', '1');
  return u.toString();
}

// Inyecta modal si no existe
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

  // Cerrar por botón
  wrap.querySelector('#trackClose')?.addEventListener('click', closeFollowModal);
  wrap.querySelector('#trackClose2')?.addEventListener('click', closeFollowModal);
  // Cerrar por fondo (si hace click fuera de la tarjeta)
  wrap.addEventListener('click', (e)=>{ if (e.target === wrap) closeFollowModal(); });
}

function closeFollowModal(){
  const m = document.getElementById('trackAskModal');
  if (m) m.style.display = 'none';
}

function openFollowModal({ phone } = {}){
  ensureFollowModal();
  const m = document.getElementById('trackAskModal'); if (!m) return;

  const url = buildTrackUrl(phone || '');
  const qr = m.querySelector('#trackQrImg');
  const linkEl = m.querySelector('#trackUrl');
  const copyBtn = m.querySelector('#trackCopy');
  const openNow = m.querySelector('#trackOpenNow');

  // Generar QR
  const size = 200;
  const api = 'https://api.qrserver.com/v1/create-qr-code/';
  const src = `${api}?size=${size}x${size}&qzone=2&data=${encodeURIComponent(url)}`;
  if (qr) qr.src = src;
  if (linkEl) linkEl.value = url;

  // Botones
  if (openNow){
    const hasPhone = !!normalizePhone(phone || '');
    openNow.disabled = !hasPhone;
    openNow.title = hasPhone ? '' : 'Requiere teléfono (también puedes usar el QR o enlace)';
    openNow.onclick = ()=> { window.location.href = url; };
  }
  copyBtn.onclick = async ()=>{
    try{
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = '¡Copiado!';
      setTimeout(()=> copyBtn.textContent = 'Copiar enlace', 1200);
    }catch{
      alert('No pude copiar. Selecciona el texto y copia manualmente.');
    }
  };

  m.style.display = 'grid';
  setTimeout(()=> openNow?.focus(), 0);
}

// CTA flotante (se crea una vez y se puede mostrar/ocultar)
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
    openFollowModal({ phone: (state.orderMeta?.type==='pickup' ? state.orderMeta?.phone : '') || '' });
  });
}
function showFollowCta(){
  ensureFollowCta();
  const cta = document.getElementById('followCta');
  if (cta) cta.style.display = 'block';
}
function hideFollowCta(){
  const cta = document.getElementById('followCta');
  if (cta) cta.style.display = 'none';
}

/* ======================= Happy Hour ======================= */

// Countdown HH + refresh
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
  const eligibleOnly = hh.applyEligibleOnly !== false; // default true
  return { enabled, pct, eligibleOnly };
}
function hhDiscountPerUnit(item){
  const { enabled, pct, eligibleOnly } = hhInfo();
  if (!enabled || pct<=0) return 0;
  const isEligible = eligibleOnly ? (item?.hhEligible !== false) : true;
  if (!isEligible) return 0;
  const unit = Number(item?.price || 0);
  return unit * pct; // SOLO al precio base
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
      // Evita loops de recarga
      const token = String(end);
      const guard = sessionStorage.getItem(HH_REFRESH_GUARD_KEY);
      if (guard !== token){
        sessionStorage.setItem(HH_REFRESH_GUARD_KEY, token);
        // pinta 00:00 un instante
        state.hhLeftText = '00:00';
        updateHHPill(hh, state.hhLeftText);
        renderMobileInfo();
        setTimeout(()=> location.reload(), 300);
        return;
      }
      // si ya recargamos una vez, mostrar OFF local
      updateHHPill({ ...hh, enabled:false });
      state.hhLeftText = '';
      renderMobileInfo();
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
      // countdown + UI
      startHHCountdown(state.menu.happyHour);

      // precios y UI dependientes
      renderCards();
      state.cart.forEach(recomputeLine);
      updateCartBar();
      renderMobileInfo();
    });
  }else{
    // sin backend HH: muestra estado actual del catálogo
    updateHHPill(state.menu?.happyHour || {enabled:false, discountPercent:0});
  }
}

/* ======================= ETA (settings + fallback) ======================= */
function bindETA(){
  if (state.unsubETA){ state.unsubETA(); state.unsubETA = null; }
  if (typeof DB.subscribeETA === 'function'){
    // subscribeETA emite un STRING (ver shared/db.js)
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

/* ======================= Tarjetas ======================= */
function renderCards(){
  const grid = document.getElementById('cards');
  if(!grid) return;
  grid.innerHTML = '';

  const items = state.mode==='mini' ? (state.menu?.minis||[]) : (state.menu?.burgers||[]);

  items.forEach(it=>{
    const base = baseOfItem(it);
    const baseId = base?.id || it.id;
    const iconSrc = ICONS[baseId] || null;

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

    // ← Ajustado para usar gramos correctos según mini/grande
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
      const idx = Number(el.id.slice(1)); // e0, e1...
      return extrasIngr[idx]?.price || 0;
    });
    const costS = saucesChecked * SP;
    const costI = ingrChecked.reduce((a,n)=>a+Number(n||0),0);

    const dlcChk  = item.mini && body.querySelector('#dlcCarne')?.checked;
    const extraDlc = dlcChk ? DLC : 0;

    // HH: descuento SOLO sobre el precio base del producto
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

      // Aderezo sorpresa (gratis) si eligió algún extra
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
        // ← Ajustado para incluir ingredientes con gramos correctos
        baseIngredients: formatIngredientsFor(item, base),
        salsaDefault: base?.salsaDefault || base?.suggested || null,
        salsaCambiada: salsaSwap,
        extras: { sauces: saucesSel, ingredients: ingrSel, dlcCarne: !!dlcChk, surpriseSauce: surpriseSauce || null },
        notes,
        lineTotal: subtotal,
        hhDisc: hhDiscTotal
      };

      if (existingIndex!==null){ state.cart[existingIndex] = newLine; toast('Línea actualizada'); }
      else { state.cart.push(newLine); toast('Agregado al pedido'); }

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
}

function openCartModal(){
  const m = document.getElementById('cartModal');
  const body = document.getElementById('cartBody');
  const close = ()=> { if(m) m.style.display='none'; /* Promover seguimiento si cierra sin confirmar */ if(!state.followCtaShown){ showFollowCta(); state.followCtaShown = true; } };
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

  if (phoneInput){
    phoneInput.addEventListener('input', ()=>{
      const pos = phoneInput.selectionStart ?? phoneInput.value.length;
      phoneInput.value = normalizePhone(phoneInput.value);
      try { phoneInput.setSelectionRange(pos, pos); } catch {}
    });
    // Autocomplete por teléfono
    phoneInput.addEventListener('change', async ()=>{
      const p = normalizePhone(phoneInput.value);
      if (p.length >= 10){
        const c = await DB.fetchCustomer(p);
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
      const btn = e.target.closest('button[data-a]');
      if (!btn) return;

      const card = btn.closest('[data-i]');
      if (!card) return;
      const i = parseInt(card.dataset.i, 10);
      const line = state.cart[i];
      if (!line) return;

      const act = btn.dataset.a;

      if (act === 'remove') {
        state.cart.splice(i, 1);
        updateCartBar(); openCartModal();
        return;
      }
      if (act === 'more') {
        line.qty = Math.min(99, (line.qty || 1) + 1);
        recomputeLine(line);
        updateCartBar(); openCartModal();
        checkComboAchievement();
        return;
      }
      if (act === 'less') {
        line.qty = Math.max(1, (line.qty || 1) - 1);
        recomputeLine(line);
        updateCartBar(); openCartModal();
        return;
      }
      if (act === 'edit') {
        const item = findItemById(line.id);
        const base = baseOfItem(item);
        if(m) m.style.display='none';
        openItemModal(item, base, i);
        return;
      }
    };
  }

  document.getElementById('cartConfirm')?.addEventListener('click', async ()=>{
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

    const generalNotes = (document.getElementById('cartNotes')?.value||'').trim();

    const subtotal = state.cart.reduce((a,l)=> a + (l.lineTotal||0), 0);
    const hhTotalDiscount = state.cart.reduce((a,l)=> a + (Number(l.hhDisc||0)), 0);
    const hh = state.menu?.happyHour || { enabled:false, discountPercent:0, applyEligibleOnly:true };
    const hhSummary = {
      enabled: !!hh.enabled,
      discountPercent: Number(hh.discountPercent||0),
      applyEligibleOnly: hh.applyEligibleOnly!==false,
      totalDiscount: Number(hhTotalDiscount||0)
    };

    const order = {
      customer: state.customerName,
      orderType: state.orderMeta.type,
      table: state.orderMeta.type==='dinein' ? state.orderMeta.table : null,
      phone: state.orderMeta.type==='pickup' ? state.orderMeta.phone : null,
      payMethodPref: state.orderMeta.payMethodPref || 'efectivo',
      items: state.cart.map(l=>({
        id:l.id, name:l.name, mini:l.mini, qty:l.qty, unitPrice:l.unitPrice,
        baseIngredients:l.baseIngredients, salsaDefault:l.salsaDefault,
        salsaCambiada:l.salsaCambiada, extras:l.extras, notes:l.notes||null,
        lineTotal:l.lineTotal, hhDisc: Number(l.hhDisc||0)
      })),
      subtotal,
      notes: generalNotes,
      hh: hhSummary
    };

    const orderId = await DB.createOrder(order);
    if (order.phone) {
      await DB.upsertCustomerFromOrder?.(order);
      await DB.attachLastOrderRef?.(order.phone, orderId);
    }

    beep();
    toast(`Gracias ${state.customerName}, te avisaremos cuando esté listo 🛎️`);
    state.cart = []; updateCartBar();
    if(m) m.style.display='none';

    // ==== Modal de seguimiento tras confirmar ====
    setTimeout(()=>{
      openFollowModal({ phone: order.phone || state.orderMeta.phone || '' });
    }, 200);
  }, { once:true });
}

function recomputeLine(line){
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
    upsell.innerHTML = picks.map(p => `
      <li>
        <div style="flex:1 1 auto;min-width:0">
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div class="muted small">${(p.type||'').toUpperCase()}</div>
        </div>
        <div class="price">${money(p.price||0)}</div>
        <button class="btn tiny" data-add="${p.id}">Agregar</button>
      </li>`).join('');
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
  const box = document.getElementById('mobileInfo');
  if(!box) return;

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

/* ======================= “Más vendidos hoy” + ETA fallback ======================= */
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
  const acc = new Map(); // name -> count
  for (const o of (orders||[])){
    const created = tsToMs(o.createdAt);
    if (!isToday(created)) continue;
    const s = (o.status||'').toUpperCase();
    if (s==='CANCELED') continue;
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
  if (state.etaSource === 'settings') return; // ya viene de settings/eta
  const base = {min:7, max:10};

  const samples = [];
  for (const o of (orders||[])){
    const created = tsToMs(o.createdAt);
    const ready   = tsToMs(o.readyAt || o.doneAt || (o.timestamps?.readyAt) || (o.timestamps?.doneAt));
    if (!created || !ready) continue;
    if (!isToday(ready)) continue;
    const s = (o.status||'').toUpperCase();
    if (s!=='READY' && s!=='DONE') continue;
    const mins = (ready - created)/60000;
    if (mins>0 && mins<120) samples.push(mins);
  }
  if (samples.length >= 3){
    samples.sort((a,b)=>a-b);
    const cut = Math.max(1, Math.floor(samples.length*0.1));
    const trimmed = samples.slice(cut, samples.length-cut);
    const avg = trimmed.reduce((a,n)=>a+n,0)/trimmed.length;
    const lo = Math.max(5, Math.round(avg-2));
    const hi = Math.min(25, Math.round(avg+2));
    state.etaText = `${lo}–${hi} min`;
  } else {
    const q = (orders||[]).filter(o=>{
      const s = (o.status||'').toUpperCase();
      return s==='PENDING' || s==='RECEIVED' || s==='PREPARING' || s==='TAKEN';
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

// 👇 Compatibilidad: si tu DB no tiene subscribeOrders, usamos onOrdersSnapshot o subscribeActiveOrders
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
  if (state.unsubReady) { state.unsubReady(); state.unsubReady = null; }
  const container = document.getElementById('readyFeed'); if (!container) return;
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
function oTime(o){
  return o.createdAt?.toMillis?.() ?? new Date(o.createdAt||0).getTime();
}

/* ======================= Upsell: agregar rápido ======================= */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-add]'); if(!btn) return;
  const id = btn.getAttribute('data-add');
  const all = [
    ...(state.menu?.drinks||[]), ...(state.menu?.sides||[]),
    ...(state.menu?.minis||[]),  ...(state.menu?.burgers||[])
  ];
  const item = all.find(x=>x.id===id); if(!item) return;

  if (item.type==='drink' || item.type==='side'){
    const hhDiscPerUnit = hhDiscountPerUnit(item);
    const unitBaseAfterHH = Math.max(0, Number(item.price||0) - hhDiscPerUnit);

    state.cart.push({
      id:item.id, name:item.name, mini:false, qty:1,
      unitPrice:Number(item.price||0),
      baseIngredients:[], salsaDefault:null, salsaCambiada:null,
      extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
      notes:'',
      lineTotal: unitBaseAfterHH,
      hhDisc: hhDiscPerUnit
    });
    updateCartBar(); beep(); toast(`${item.name} agregado`);
  } else {
    openItemModal(item, item.baseOf ? state.menu?.burgers?.find(b=>b.id===item.baseOf) : item);
  }
}, false);

/* ======================= THEME: panel flotante (solo tester local) ======================= */
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
  row2.style.display = 'grid'; row2.style.gridTemplateColumns = '1fr'; row2.style.gap = '6px';
  const btnLocal = document.createElement('button');
  btnLocal.textContent = 'Probar local';
  Object.assign(btnLocal.style, {
    padding:'8px', borderRadius:'10px', border:'1px solid rgba(255,255,255,.2)', background:'var(--accent)', cursor:'pointer'
  });

  const msg = document.createElement('div'); msg.style.marginTop = '6px'; msg.style.opacity = '.9';

  btnLocal.addEventListener('click', ()=>{
    applyThemeLocal(select.value);
    setMsg('Tema aplicado localmente.', 'ok');
  });

  function setMsg(text, kind='ok'){
    msg.textContent = text;
    msg.style.color = (kind==='ok'?'#A7F3D0': kind==='warn'?'#FFE082':'#FFABAB');
  }

  head.appendChild(title); head.appendChild(toggle);
  row1.appendChild(labelSel); row1.appendChild(select);
  row2.appendChild(btnLocal);
  body.appendChild(row1); body.appendChild(row2); body.appendChild(msg);
  box.appendChild(head); box.appendChild(body);
  document.body.appendChild(box);
}

/* ======================= Miscelánea ======================= */
// Limpia suscripciones y timers al abandonar la página
window.addEventListener('beforeunload', ()=>{
  try{ state.unsubReady && state.unsubReady(); }catch{}
  try{ state.unsubAnalytics && state.unsubAnalytics(); }catch{}
  try{ state.unsubHH && state.unsubHH(); }catch{}
  try{ state.unsubETA && state.unsubETA(); }catch{}
  try{ state.unsubTheme && state.unsubTheme(); }catch{}
  try{ if(hhTimer) clearInterval(hhTimer); }catch{}
});
