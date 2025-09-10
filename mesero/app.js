// /mesero/app.js
// Tablero de Mesero — versión extendida sin dependencias.
// Mejora de UX: barra de controles (buscar/sonido/ordenar/acciones),
// tiempos relativos con refresco, filtros rápidos por tipo (Pickup/Mesa),
// “Entregar todo” y accesibilidad. Mantiene compatibilidad total con tu HTML.
//
// Requiere que existan en el DOM:
//   - #colIP  (IN_PROGRESS)
//   - #colR   (READY)
//
// DB:
//   - subscribeOrders(cb)
//   - archiveDelivered(id)

import { subscribeOrders, archiveDelivered } from '../shared/db.js';
import { beep, toast } from '../shared/notify.js';

/* ==========================
   Estado y referencias UI
   ========================== */
const colIP = document.getElementById('colIP');
const colR  = document.getElementById('colR');

if (!colIP || !colR) {
  console.warn('[mesero] Faltan columnas #colIP o #colR en el DOM');
}

let LAST_IDS_READY = new Set();      // para beep en nuevos READY
let lastSnapshot = [];               // último snapshot crudo
let relTimeTimer = null;             // interval refresco tiempos relativos
let unsubscribe = null;

// Preferencias persistentes
const PREFS_KEY = 'meseroPrefs';
const prefs = loadPrefs({
  sound: true,
  filterType: 'all',                 // all | pickup | dinein
  sortReady: 'newest',               // newest | oldest
  search: ''
});

/* ==========================
   Barra superior de controles
   ========================== */
mountToolbar();

function mountToolbar(){
  if (document.getElementById('meseroToolbar')) return;

  const bar = document.createElement('div');
  bar.id = 'meseroToolbar';
  bar.style.cssText = `
    position:sticky; top:0; z-index:40;
    display:flex; gap:8px; align-items:center; flex-wrap:wrap;
    padding:10px 12px; margin-bottom:8px;
    background:rgba(10,14,24,.85);
    border-bottom:1px solid rgba(255,255,255,.08);
    backdrop-filter:blur(6px);
  `;

  bar.innerHTML = `
    <div class="row" style="gap:8px">
      <input id="tbSearch" type="search" placeholder="Buscar cliente o ítem…" value="${escapeHtml(prefs.search)}"
             style="min-width:220px;padding:10px;border-radius:10px;border:1px solid var(--stroke);background:#0c1322;color:var(--ink)" />
      <select id="tbFilterType" style="padding:10px;border-radius:10px;border:1px solid var(--stroke);background:#0c1322;color:var(--ink)">
        <option value="all" ${prefs.filterType==='all'?'selected':''}>Todos</option>
        <option value="pickup" ${prefs.filterType==='pickup'?'selected':''}>Pickup</option>
        <option value="dinein" ${prefs.filterType==='dinein'?'selected':''}>Mesa</option>
      </select>
      <select id="tbSortReady" style="padding:10px;border-radius:10px;border:1px solid var(--stroke);background:#0c1322;color:var(--ink)">
        <option value="newest" ${prefs.sortReady==='newest'?'selected':''}>Listos: recientes primero</option>
        <option value="oldest" ${prefs.sortReady==='oldest'?'selected':''}>Listos: antiguos primero</option>
      </select>
    </div>

    <div class="row" style="margin-left:auto; gap:8px">
      <button class="btn small ghost" id="tbSound" aria-pressed="${prefs.sound?'true':'false'}">
        ${prefs.sound?'🔊 Sonido ON':'🔇 Sonido OFF'}
      </button>
      <button class="btn small" id="tbDeliverAll" title="Marcar todos los listos como entregados">Entregar todo</button>
      <button class="btn small ghost" id="tbRefresh">Refrescar</button>
    </div>
  `;

  const anchor = document.querySelector('main, body') || document.body;
  anchor.prepend(bar);

  // Eventos
  bar.querySelector('#tbSearch')?.addEventListener('input', e=>{
    prefs.search = String(e.target.value||'').trim();
    savePrefs();
    renderFromSnapshot();
  });
  bar.querySelector('#tbFilterType')?.addEventListener('change', e=>{
    prefs.filterType = String(e.target.value||'all');
    savePrefs();
    renderFromSnapshot();
  });
  bar.querySelector('#tbSortReady')?.addEventListener('change', e=>{
    prefs.sortReady = String(e.target.value||'newest');
    savePrefs();
    renderFromSnapshot();
  });
  bar.querySelector('#tbSound')?.addEventListener('click', e=>{
    prefs.sound = !prefs.sound;
    savePrefs();
    const btn = e.currentTarget;
    btn.setAttribute('aria-pressed', prefs.sound?'true':'false');
    btn.textContent = prefs.sound ? '🔊 Sonido ON' : '🔇 Sonido OFF';
    if (prefs.sound) beep(80, 880);
  });
  bar.querySelector('#tbDeliverAll')?.addEventListener('click', deliverAllReady);
  bar.querySelector('#tbRefresh')?.addEventListener('click', ()=>{
    if (typeof unsubscribe === 'function') { try{ unsubscribe(); }catch{} }
    startSubscription();
    toast('Actualizado');
  });

  // Atajos
  document.addEventListener('keydown', e=>{
    if (e.key==='/' && !e.metaKey && !e.ctrlKey){
      e.preventDefault();
      bar.querySelector('#tbSearch')?.focus();
    }
    if ((e.key==='s'||e.key==='S') && (e.ctrlKey||e.metaKey)){
      e.preventDefault();
      const btn = bar.querySelector('#tbSound');
      btn?.click();
    }
  });
}

/* ==========================
   Suscripción a pedidos
   ========================== */
startSubscription();

function startSubscription(){
  if (unsubscribe) { try{ unsubscribe(); }catch{} }
  unsubscribe = subscribeOrders((list = [])=>{
    lastSnapshot = Array.isArray(list) ? list : [];

    // Beep si aparece nuevo READY (y el sonido está activo)
    const ready = lastSnapshot.filter(x=>x?.status==='READY');
    const nowReadyIds = new Set(ready.map(x=>x.id));
    if (prefs.sound) {
      for (const id of nowReadyIds) if (!LAST_IDS_READY.has(id)) beep(160, 1100);
    }
    LAST_IDS_READY = nowReadyIds;

    renderFromSnapshot();
  });

  // Tiempos relativos (cada ~20s)
  if (relTimeTimer) clearInterval(relTimeTimer);
  relTimeTimer = setInterval(()=> updateRelativeTimes(), 20000);
}

/* ==========================
   Render principal
   ========================== */
function renderFromSnapshot(){
  const arr = Array.isArray(lastSnapshot) ? lastSnapshot : [];
  // Filtro por tipo
  const typeMatch = (o)=>{
    if (prefs.filterType==='all') return true;
    return String(o?.orderType||'').toLowerCase() === prefs.filterType;
  };
  // Búsqueda
  const q = String(prefs.search||'').toLowerCase();
  const searchMatch = (o)=>{
    if (!q) return true;
    const inCustomer = String(o?.customer||'').toLowerCase().includes(q);
    const items = Array.isArray(o?.items) ? o.items : (o?.item ? [{ name:o.item.name, qty:o.qty||1 }] : []);
    const inItems = items.some(it => String(it?.name||'').toLowerCase().includes(q));
    const phone = String(o?.phone||'').toLowerCase().includes(q);
    const table = String(o?.table||'').toLowerCase().includes(q);
    return inCustomer || inItems || phone || table;
  };

  const ip = arr.filter(x=>x?.status==='IN_PROGRESS' && typeMatch(x) && searchMatch(x))
                .sort((a,b)=> timeMs(a) - timeMs(b)); // más antiguos arriba
  let r  = arr.filter(x=>x?.status==='READY' && typeMatch(x) && searchMatch(x));
  r = (prefs.sortReady==='oldest')
    ? r.sort((a,b)=> timeMs(a) - timeMs(b))
    : r.sort((a,b)=> timeMs(b) - timeMs(a));

  colIP.innerHTML = ip.map(o=>card(o,false)).join('') || '<div class="muted">—</div>';
  colR.innerHTML  = r.map(o=>card(o,true)).join('')  || '<div class="muted">—</div>';

  // Primero enfoque accesible en READY si hay y no hay búsqueda activa
  if (!q && r.length) {
    const firstBtn = colR.querySelector('button[data-a="deliver"]');
    if (firstBtn) firstBtn.setAttribute('tabindex','0');
  }

  // Refresca badges de tiempo inmediatamente
  updateRelativeTimes();
}

/* ==========================
   Tarjeta de pedido
   ========================== */
function card(o={}, deliver=false){
  const items = Array.isArray(o.items) && o.items.length
    ? o.items
    : (o.item ? [{ name:o.item.name, qty:o.qty||1 }] : []);

  const count = items.reduce((n,i)=> n + (i?.qty||1), 0);
  const names = items.map(i=>i?.name).filter(Boolean).slice(0,2).join(', ');

  const isPickup = (o.orderType === 'pickup');
  const meta = (o.orderType === 'dinein')
    ? `Mesa ${o.table||'?'}`
    : (isPickup ? 'Pickup' : (o.orderType||'—'));

  const phoneLine = isPickup && o.phone
    ? `<div class="muted small">📞 <b>${escapeHtml(String(o.phone))}</b></div>`
    : '';

  const created = timeMs(o);
  const relId = `rel-${o.id||Math.random().toString(36).slice(2)}`;

  // Acciones secundarias (llamar, WhatsApp, copiar)
  const phone = isPickup ? String(o.phone||'') : '';
  const callBtn  = (phone ? `<a class="btn small ghost" href="tel:${encodeURIComponent(phone)}" title="Llamar">Llamar</a>` : '');
  const waBtn    = (phone ? `<a class="btn small ghost" href="https://wa.me/52${encodeURIComponent(phone)}" target="_blank" rel="noopener" title="WhatsApp">WhatsApp</a>` : '');
  const copyBtn  = (phone ? `<button class="btn small ghost" data-a="copy-phone" data-phone="${escapeAttr(phone)}" title="Copiar teléfono">Copiar</button>` : '');

  return `<div class="k-card" data-id="${o.id}" data-created="${created||''}">
    <h4>${escapeHtml(o.customer||'-')} · ${count} it.</h4>
    <div class="muted small">${escapeHtml(names || '—')}</div>
    <div class="muted small">Tipo: <b>${escapeHtml(meta)}</b></div>
    ${phoneLine}
    ${o.notes?`<div class="muted small">Notas: ${escapeHtml(o.notes)}</div>`:''}

    <div class="k-badges" style="margin-top:6px; gap:8px; display:flex; flex-wrap:wrap;">
      ${created?`<span class="k-badge" id="${relId}" data-ts="${created}">—</span>`:''}
      ${o.orderType==='dinein' && o.table ? `<span class="k-badge">Mesa ${escapeHtml(o.table)}</span>`:''}
      ${o.payMethodPref ? `<span class="k-badge">${escapeHtml(String(o.payMethodPref).toUpperCase())}</span>`:''}
    </div>

    <div class="k-actions" style="margin-top:8px; gap:6px">
      ${deliver?'<button class="btn small" data-a="deliver">Entregar</button>':''}
      ${callBtn}${waBtn}${copyBtn}
    </div>
  </div>`;
}

/* ==========================
   Interacciones
   ========================== */

document.addEventListener('click', async (e)=>{
  const btnDeliver = e.target.closest('button[data-a="deliver"]');
  if (btnDeliver){
    const id = btnDeliver.closest('.k-card')?.dataset?.id; if(!id) return;
    await deliverOne(id);
    return;
  }
  const btnCopy = e.target.closest('button[data-a="copy-phone"]');
  if (btnCopy){
    const phone = btnCopy.getAttribute('data-phone')||'';
    try{
      await navigator.clipboard.writeText(phone);
      toast('Teléfono copiado');
      beep(60, 900);
    }catch{
      toast('No se pudo copiar');
    }
    return;
  }
});

async function deliverOne(id){
  try{
    await archiveDelivered(id);
    beep(80, 880);
    toast('Pedido entregado ✔️');
  }catch(err){
    console.error(err);
    toast('No se pudo entregar');
  }
}

async function deliverAllReady(){
  // Toma ids visibles bajo filtro actual
  const ids = [...colR.querySelectorAll('.k-card')].map(c=> c.dataset.id).filter(Boolean);
  if (!ids.length){ toast('No hay pedidos listos'); return; }
  if (!confirm(`Entregar ${ids.length} pedido(s)?`)) return;
  let ok=0, fail=0;
  for (const id of ids){
    try{ await archiveDelivered(id); ok++; }
    catch{ fail++; }
  }
  beep(120, ok ? 920 : 400);
  toast(`Entregados: ${ok}${fail?` · Fallidos: ${fail}`:''}`);
}

/* ==========================
   Tiempos relativos (badge)
   ========================== */
function updateRelativeTimes(){
  const now = Date.now();
  document.querySelectorAll('.k-badge[id^="rel-"][data-ts]').forEach(el=>{
    const ts = Number(el.getAttribute('data-ts')||0);
    if (!ts) return;
    el.textContent = formatSince(now - ts);
    el.title = new Date(ts).toLocaleString();
  });
}

function formatSince(deltaMs){
  if (!Number.isFinite(deltaMs) || deltaMs<0) return '—';
  const s = Math.floor(deltaMs/1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s/60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60);
  return `${h}h ${m%60}m`;
}

function timeMs(o){
  // createdAt puede ser Firestore Timestamp, Date o número
  const t = o?.createdAt;
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds) return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
  const d = new Date(t); const ms = d.getTime(); return Number.isFinite(ms) ? ms : 0;
}

/* ==========================
   Utils varias
   ========================== */

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[m]));
}
function escapeAttr(s=''){
  return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function loadPrefs(fallback){
  try{
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  }catch{ return { ...fallback }; }
}
function savePrefs(){
  try{ localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }catch{}
}

/* ==========================
   Limpieza
   ========================== */
window.addEventListener('beforeunload', ()=>{
  try{ if (unsubscribe) unsubscribe(); }catch{}
  try{ if (relTimeTimer) clearInterval(relTimeTimer); }catch{}
});
