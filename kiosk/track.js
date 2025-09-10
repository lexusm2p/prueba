// /kiosk/track.js
// Track gamificado: huevo -> se abre -> por romperse -> mascota 🍔
// Mantiene: HH, ETA, QR, autostart, feed READY, notificaciones.
// + Coleccionables (máx 7 / cliente; 2 raros)

import * as DB from '../shared/db.js';

const $  = (s, r=document)=> r.querySelector(s);

// ----------------- UI refs (existentes + nuevos) -----------------
const hhPill = $('#hhPill');
const hhText = $('#hhText');
const etaEl  = $('#eta');

const phoneIn = $('#phone');
const goBtn   = $('#go');
const mineEl  = $('#mine');
const readyEl = $('#ready');

const ding = $('#ding'); // <audio> para READY

// Gamificación
const playBox   = $('#play');
const petEmoji  = $('#petEmoji');
const stageText = $('#stageText');
const stCap     = $('#stCap');
const payline   = $('#payline');
const totalMoney= $('#totalMoney');

// Coleccionables
const colGrid = $('#colGrid');
const colCap  = $('#colCap');

// Compartir / volver
const shareLink = $('#shareLink');
// El botón "Volver al kiosko" es solo un <a> en el HTML

// ---- Notificaciones (permiso) ----
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(()=>{});
}

/* ===================== Happy Hour ===================== */
let hhTimer = null;
const HH_REFRESH_GUARD_KEY = 'hhRefreshGuard';

function fmtMMSS(ms){
  const t = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(t/60), s = t%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function stopHHTimer(){ if(hhTimer){ clearInterval(hhTimer); hhTimer = null; } }

function renderHHPill({ enabled, discountPercent }, extraText=''){
  // Usa la clase que tu CSS espera (.on)
  hhPill?.classList.toggle('on', !!enabled);
  if (!hhText) return;
  hhText.textContent = enabled
    ? `Happy Hour – ${Number(discountPercent||0)}%${extraText? ` · ${extraText}` : ''}`
    : 'HH OFF';
}

function tickHH(hh){
  const end = Number(hh.endsAt || 0);
  const left = end - Date.now();
  if (left <= 0){
    stopHHTimer();
    const guard = sessionStorage.getItem(HH_REFRESH_GUARD_KEY);
    const token = String(end || '0');
    if (guard !== token){
      sessionStorage.setItem(HH_REFRESH_GUARD_KEY, token);
      // Apaga visualmente antes del reload preventivo
      renderHHPill({ enabled:false, discountPercent: hh.discountPercent });
      setTimeout(()=> { try{ location.reload(); }catch{} }, 300);
      return;
    }
    // Misma sesión ya refrescada: solo apagar visual sin recargar
    renderHHPill({ enabled:false, discountPercent: hh.discountPercent });
    return;
  }
  renderHHPill(hh, fmtMMSS(left));
}
function startHHCountdown(hh){
  stopHHTimer();
  renderHHPill(hh);
  if (hh.enabled && Number(hh.endsAt)){
    tickHH(hh);
    hhTimer = setInterval(()=> tickHH(hh), 1000);
  }
}
// Suscripción HH (compatible con tu /shared/db.js)
if (typeof DB.subscribeHappyHour === 'function'){
  DB.subscribeHappyHour(hh=>{
    const normalized = {
      enabled: !!hh?.enabled,
      discountPercent: Number(hh?.discountPercent||0),
      endsAt: hh?.endsAt!=null ? Number(hh.endsAt) : null
    };
    startHHCountdown(normalized);
  });
}
window.addEventListener('beforeunload', stopHHTimer);

/* ===================== ETA (settings/eta o fallback) ===================== */
let etaSource = 'fallback'; // 'settings' si viene de Firestore
function setETA(text){ if (etaEl) etaEl.textContent = text || '7–10 min'; }
setETA('7–10 min');

if (typeof DB.subscribeETA === 'function'){
  DB.subscribeETA((text)=>{
    if (text == null) return;
    etaSource = 'settings';
    setETA(String(text || '7–10 min'));
  });
}

/* ===================== Helpers ===================== */
const normPhone = (s='') => String(s).replace(/\D+/g,'').slice(0,15);
const ts = (d)=> (d?.toMillis?.() ?? new Date(d||0).getTime());
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));
const getPhone = (o)=> normPhone(o?.phone ?? o?.meta?.phone ?? o?.customer?.phone ?? '');

// Persistencia de coleccionables por teléfono
function lsKey(phone){ return `trackCollectibles:${phone}`; }
function loadCollectibles(phone){
  try{ return JSON.parse(localStorage.getItem(lsKey(phone))||'{}') || {}; }catch{ return {}; }
}
function saveCollectibles(phone, data){
  try{ localStorage.setItem(lsKey(phone), JSON.stringify(data||{})); }catch{}
}

/* ===================== Gamificación ===================== */
const STAGES = {
  INIT:       { emoji:'🥚',   text:'Esperando confirmación…' },
  RECEIVED:   { emoji:'🥚',   text:'Tu huevo llegó al nido.' },
  COOKING:    { emoji:'🥚🪨', text:'El cascarón empieza a abrirse…' },
  IN_PROGRESS:{ emoji:'🐣',   text:'Se oye un crack… ¡ya casi!' },
  READY:      { emoji:'🍔🙂', text:'¡Nació tu Burger Buddy! Ya puedes recogerlo.' },
  DONE:       { emoji:'🍔😋', text:'Disfruta tu Burger Buddy. ¡Gracias!' }
};
function stageForStatus(st=''){
  const s = String(st||'').toUpperCase();
  if (s==='READY') return STAGES.READY;
  if (s==='DONE' || s==='PAID' || s==='DELIVERED') return STAGES.DONE;
  if (s==='COOKING' || s==='PREPARING') return STAGES.COOKING;
  if (s==='IN_PROGRESS' || s==='TAKEN') return STAGES.IN_PROGRESS;
  if (s==='RECEIVED' || s==='PENDING') return STAGES.RECEIVED;
  return STAGES.INIT;
}

/* ===================== Coleccionables ===================== */
const COL_CAP = { limit: 7, rares: 2 };
const COMMON_POOL = [
  { id:'c1', emoji:'🍟', name:'Papas Pro' },
  { id:'c2', emoji:'🥤', name:'Refresco Retro' },
  { id:'c3', emoji:'🧀', name:'Cheddar Crew' },
  { id:'c4', emoji:'🌶️', name:'Spicy Squad' },
  { id:'c5', emoji:'🥓', name:'Bacon Band' }
];
const RARE_POOL = [
  { id:'r1', emoji:'👑🍔', name:'Burger Kingpin', rare:true },
  { id:'r2', emoji:'🛸🍔', name:'UFO Patty', rare:true }
];

function pickReward(current){
  const have = new Set(current.map(x=>x.id));
  const leftCommon = COMMON_POOL.filter(x=>!have.has(x.id));
  const leftRare   = RARE_POOL.filter(x=>!have.has(x.id));
  // Prob. rara 10% si ya tiene >=3 y aún hay raras
  const tryRare = (current.length>=3) && leftRare.length>0 && Math.random()<0.10;
  const pool = tryRare ? leftRare : (leftCommon.length? leftCommon : leftRare);
  if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}

function renderCollection(phone){
  if (!colGrid || !colCap) return;
  const store = loadCollectibles(phone||currentPhone||'');
  const col = Array.isArray(store.collection) ? store.collection : [];
  colGrid.innerHTML = col.map(c=>`
    <div class="card-mini" title="${c.name}">
      <div>${c.emoji}</div>
      ${c.rare?'<div class="ribbon">Raro</div>':''}
    </div>
  `).join('');
  const left = Math.max(0, COL_CAP.limit - col.length);
  colCap.textContent = left>0
    ? `Te faltan ${left} para completar tu colección (máx. ${COL_CAP.limit}).`
    : `Colección completa. ¡Bien!`;
}

function flashNewReward(reward){
  if (!colGrid) return;
  const card = document.createElement('div');
  card.className='card-mini';
  card.style.outline='2px solid rgba(47,227,139,.35)';
  card.style.transform='scale(0.9)';
  card.style.transition='transform .25s ease, outline .4s ease';
  card.innerHTML = `<div>${reward.emoji}</div><div class="ribbon">${reward.rare?'Raro 👑':'Nuevo'}</div>`;
  colGrid.prepend(card);
  setTimeout(()=>{ card.style.transform='scale(1)'; card.style.outline='1px solid var(--border)'; }, 60);
}

function awardIfEligible(order){
  const phone = currentPhone;
  if (!phone || !order) return;

  const status = String(order.status||'').toUpperCase();
  if (!(status==='READY' || status==='DONE' || status==='PAID' || status==='DELIVERED')) return;

  const orderId = order.id || order.orderId || '';
  const store = loadCollectibles(phone);
  const awarded = new Set(store.awardedOrderIds||[]);
  const col = Array.isArray(store.collection) ? store.collection : [];

  if (awarded.has(orderId)) return;                 // ya premiado
  if (col.length >= COL_CAP.limit) return;          // alcanzó límite

  const reward = pickReward(col);
  if (!reward) return;

  col.push(reward);
  awarded.add(orderId);
  saveCollectibles(phone, { collection: col, awardedOrderIds:[...awarded] });

  renderCollection(phone);
  flashNewReward(reward);
}

/* ===================== Render: Mi pedido (gamificado) ===================== */
let lastMineId = null;
let lastMineStatus = null;

const STATUS_TEXT = {
  PENDING:      { tag: '📥 Pedido recibido',      sub: 'Esperando confirmación en cocina' },
  RECEIVED:     { tag: '📥 Pedido recibido',      sub: 'Esperando confirmación en cocina' },
  IN_PROGRESS:  { tag: '🔥 En preparación',        sub: 'Estamos cocinando tu pedido' },
  COOKING:      { tag: '🔥 En preparación',        sub: 'Estamos cocinando tu pedido' },
  READY:        { tag: '🛎️ Listo para entregar',  sub: 'Pásalo a recoger o espera en tu mesa' },
  DELIVERED:    { tag: '✔️ Entregado',             sub: 'En proceso de cobro' },
  PAID:         { tag: '💚 Pagado',                sub: '¡Gracias!' },
  DONE:         { tag: '💚 Pagado',                sub: '¡Gracias!' }
};

function renderMine(order){
  if (!mineEl) return;

  if (!order){
    mineEl.classList.remove('ok');
    mineEl.innerHTML = '<div class="muted">Escribe tu teléfono y pulsa “Ver estado”.</div>';
    if (playBox) playBox.style.display = 'none';
    lastMineId = null; lastMineStatus = null;
    return;
  }

  let st = String(order.status || 'PENDING').toUpperCase();
  if (order.paid) st = 'PAID';

  // Sonido + notificación cuando pasa a READY
  if (order.id === lastMineId && lastMineStatus !== 'READY' && st === 'READY') {
    try { ding?.play?.(); } catch {}
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Tu pedido está listo 🛎️', {
          body: `${order.customer || '—'} · Total ${money(order.subtotal||0)}`
        });
      } catch {}
    }
  }

  const label = STATUS_TEXT[st] || STATUS_TEXT.PENDING;
  const items = order.items||[];
  theCount:
  const count = items.reduce((n,i)=> n + (i.qty||1), 0);
  const names = items.map(i=>i.name).slice(0,3).map(escapeHtml).join(', ');
  const subtotal = Number(order.subtotal || 0);

  // Cabecera textual (se mantiene como en tu versión)
  mineEl.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between">
      <div style="min-width:0">
        <div><b>${escapeHtml(order.customer || '—')}</b> · ${count} it.</div>
        <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${names}</div>
      </div>
      <span class="tag">${label.tag}</span>
    </div>
    <div class="muted" style="margin-top:4px">${label.sub}</div>
  `;

  // Panel gamificado
  if (playBox) playBox.style.display = 'grid';
  const stInfo = stageForStatus(st);
  if (petEmoji)  petEmoji.textContent = stInfo.emoji;
  if (stageText) stageText.textContent = stInfo.text;

  if (subtotal>0){
    if (payline) payline.style.display='flex';
    if (totalMoney) totalMoney.textContent = money(subtotal);
  } else {
    if (payline) payline.style.display='none';
  }
  if (stCap){
    stCap.textContent =
      (st==='READY' || st==='DONE' || st==='PAID')
        ? '¡Felicidades! Se desbloquea un coleccionable.'
        : 'Tu mascota evoluciona conforme avanza tu pedido.';
  }

  // Premio si procede
  awardIfEligible(order);

  lastMineId = order.id;
  lastMineStatus = st;
}

/* ===================== Render: Listos ===================== */
function renderReady(list){
  if (!readyEl) return;
  const rows = (list||[])
    .filter(o => String(o.status||'').toUpperCase()==='READY')
    .sort((a,b)=> ts(b.createdAt) - ts(a.createdAt))
    .slice(0,8)
    .map(o=>{
      const items = o.items||[];
      const count = items.reduce((n,i)=> n + (i.qty||1), 0);
      const names = items.map(i=>i.name).slice(0,2).map(escapeHtml).join(', ');
      return `<li>
        <div style="flex:1;min-width:0">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${escapeHtml(o.customer||'—')}</b> · ${count} it.</div>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${names}</div>
        </div>
        <div>🛎️</div>
      </li>`;
    }).join('');
  readyEl.innerHTML = rows || '<li><div class="muted">—</div></li>';
}

/* ===================== Estado por teléfono + feed ===================== */
let currentPhone = '';

// Auto-start por URL (?autostart=1&phone=XXXXXXXXXX)
(function(){
  const qs = new URLSearchParams(location.search);
  const autostart = qs.get('autostart') === '1';
  const p = normPhone(qs.get('phone') || '');
  if (p && phoneIn) phoneIn.value = p;
  if (autostart && p.length >= 10) {
    currentPhone = p;
    renderCollection(p);
    renderMine(null); // placeholder
  }
  // Asegura QR inicial acorde a query param
  setDefaultQrUrl();
})();

// Suscripción a órdenes (activa o full)
(DB.subscribeActiveOrders || DB.subscribeOrders)?.((list=[])=>{
  renderReady(list);

  // Fallback ETA si no viene de settings
  if (etaSource !== 'settings'){
    setETA(computeEtaFallback(list));
  }

  if (currentPhone){
    const mine = list
      .filter(o => normPhone(getPhone(o)) === currentPhone)
      .sort((a,b)=> ts(b.createdAt) - ts(a.createdAt))[0];
    renderMine(mine || null);
  }
});

goBtn?.addEventListener('click', ()=>{
  currentPhone = normPhone(phoneIn?.value || '');
  if (currentPhone.length < 10){
    alert('Ingresa un teléfono de 10 dígitos.');
    return;
  }
  renderCollection(currentPhone);
  renderMine(null); // placeholder hasta snapshot
  // Refresca el QR con el phone actual
  setDefaultQrUrl();
});

phoneIn?.addEventListener('input', ()=>{
  const pos = phoneIn.selectionStart ?? phoneIn.value.length;
  phoneIn.value = normPhone(phoneIn.value);
  try { phoneIn.setSelectionRange(pos, pos); } catch {}
});

/* ===================== QR simple por URL ===================== */
const qrImg   = $('#qrImg');
const qrUrl   = $('#qrUrl');
const qrUpdate= $('#qrUpdate');
const qrCopy  = $('#qrCopy');

function buildSelfUrl({ phone }={}){
  const u = new URL(location.href);
  if (phone){ u.searchParams.set('phone', phone); }
  else { u.searchParams.delete('phone'); }
  u.searchParams.set('autostart','1');
  return u.toString();
}

function setDefaultQrUrl(){
  const url = buildSelfUrl({ phone: currentPhone || '' });
  if (qrUrl) qrUrl.value = url;
  updateQr();
}
function updateQr(){
  const url = (qrUrl?.value || '').trim();
  if (!url || !qrImg) return;
  const size = 160; // coincide con tu CSS
  const api = 'https://api.qrserver.com/v1/create-qr-code/';
  const src = `${api}?size=${size}x${size}&qzone=2&data=${encodeURIComponent(url)}`;
  qrImg.src = src;
}
qrUpdate?.addEventListener('click', updateQr);
qrCopy?.addEventListener('click', async ()=>{
  try{
    const url = (qrUrl?.value || buildSelfUrl({ phone: currentPhone || '' })).trim();
    await navigator.clipboard.writeText(url);
    qrCopy.textContent = '¡Copiado!';
    setTimeout(()=> qrCopy.textContent = 'Copiar enlace', 1200);
  }catch{
    alert('No pude copiar. Selecciona el texto y copia manualmente.');
  }
});

// Compartir
shareLink?.addEventListener('click', async (e)=>{
  e.preventDefault();
  const url = qrUrl?.value || buildSelfUrl({ phone: currentPhone||'' });
  try{
    if (navigator.share) await navigator.share({ title:'Seguimiento Seven de Burgers', url });
    else { await navigator.clipboard.writeText(url); alert('Enlace copiado'); }
  }catch{}
});

/* ===================== ETA fallback ===================== */
function tsToMs(t){
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t && t.seconds!=null) return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
  const d = new Date(t); const ms = d.getTime(); return Number.isFinite(ms) ? ms : 0;
}
function isToday(ms){
  if(!ms) return false;
  const d = new Date(ms); const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
}
function computeEtaFallback(orders){
  const base = {min:7, max:10};
  const samples = [];
  for (const o of (orders||[])){
    const created = tsToMs(o.createdAt);
    const ready   = tsToMs(o.readyAt || o.doneAt || (o.timestamps?.readyAt) || (o.timestamps?.doneAt));
    if (!created || !ready) continue;
    if (!isToday(ready)) continue;
    const s = String(o.status||'').toUpperCase();
    if (s!=='READY' && s!=='DONE' && s!=='PAID' && s!=='DELIVERED') continue;
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
    return `${lo}–${hi} min`;
  }
  const q = (orders||[]).filter(o=>{
    const s = String(o.status||'').toUpperCase();
    return s==='PENDING' || s==='RECEIVED' || s==='PREPARING' || s==='TAKEN' || s==='IN_PROGRESS' || s==='COOKING';
  }).length;
  if (q>0){
    const bump = Math.min(12, Math.ceil(q*1.5));
    const lo = base.min + Math.floor(bump/2);
    const hi = base.max + bump;
    return `${lo}–${hi} min`;
  }
  return `${base.min}–${base.max} min`;
}
