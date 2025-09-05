// /kiosk/track.js
// Track público: mismo status que cocina, suena/avisa en READY,
// muestra total a pagar y agradece al pagar. HH/ETA en vivo.

import * as DB from '../shared/db.js';

const $ = (s)=>document.querySelector(s);

// UI refs
const hhPill = $('#hhPill');
const hhText = $('#hhText');
const etaEl  = $('#eta');

const phoneIn = $('#phone');
const goBtn   = $('#go');
const mineEl  = $('#mine');
const readyEl = $('#ready');

const ding = $('#ding'); // <audio> para READY

// ---- Notificaciones (permiso) ----
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(()=>{});
}

// ---- Happy Hour ----
if (typeof DB.subscribeHappyHour === 'function'){
  DB.subscribeHappyHour(hh=>{
    const on = !!hh?.enabled;
    hhPill?.classList.toggle('hh-on', on);
    if (hhText) hhText.textContent = on ? `Happy Hour – ${Number(hh.discountPercent||0)}%` : 'HH OFF';
  });
}

// ---- ETA (settings/eta si existe, si no, fallback por carga/tiempos) ----
let etaSource = 'fallback'; // 'settings' si viene de Firestore

function setETA(text){
  if (etaEl) etaEl.textContent = text || '7–10 min';
}
setETA('7–10 min');

if (typeof DB.subscribeETA === 'function'){
  DB.subscribeETA(v=>{
    etaSource = 'settings';
    setETA(v?.text || '7–10 min');
  });
}

// ---- Helpers ----
const normPhone = (s='') => String(s).replace(/\D+/g,'').slice(0,15);
const ts = (d)=> (d?.toMillis?.() ?? new Date(d||0).getTime());
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

// Teléfono robusto desde el pedido
const getPhone = (o)=> normPhone(o?.phone ?? o?.meta?.phone ?? o?.customer?.phone ?? '');

// Mapeo de estados (alineado a cocina)
const STATUS_TEXT = {
  PENDING:      { tag: '📥 Pedido recibido',      sub: 'Esperando confirmación en cocina' },
  IN_PROGRESS:  { tag: '🔥 En preparación',        sub: 'Estamos cocinando tu pedido' },
  READY:        { tag: '🛎️ Listo para entregar',  sub: 'Pásalo a recoger o espera en tu mesa' },
  DELIVERED:    { tag: '✔️ Entregado',             sub: 'En proceso de cobro' },
  PAID:         { tag: '💚 Pagado',                sub: '¡Gracias!' }
};

// ---- Render: Mi pedido ----
let lastMineId = null;
let lastMineStatus = null;

function renderMine(order){
  if (!mineEl) return;

  if (!order){
    mineEl.classList.remove('ok');
    mineEl.innerHTML = '<div class="muted">Escribe tu teléfono y pulsa “Ver estado”.</div>';
    lastMineId = null; lastMineStatus = null;
    return;
  }

  // Normaliza estado (si viene paid=true lo tratamos como PAID)
  let st = String(order.status || 'PENDING').toUpperCase();
  if (order.paid) st = 'PAID';

  // Notificación + sonido cuando pasa a READY
  if (order.id === lastMineId && lastMineStatus !== 'READY' && st === 'READY') {
    try { ding?.play?.(); } catch {}
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Tu pedido está listo 🛎️', {
        body: `${order.customer || '—'} · Total ${money(order.subtotal||0)}`
      });
    }
  }

  const label = STATUS_TEXT[st] || STATUS_TEXT.PENDING;

  // Totales
  const subtotal = Number(order.subtotal || 0);
  const hhDisc   = Number(order.hh?.totalDiscount || 0);

  // Línea de pago
  let payLine = `
    <div class="payline">
      <span class="price">Total a pagar: ${money(subtotal)}</span>
      ${hhDisc>0 ? `<span class="tag">Ahorro HH: -${money(hhDisc)}</span>` : ''}
      ${order.payMethodPref ? `<span class="tag">${escapeHtml(order.payMethodPref)}</span>` : ''}
      ${order.orderType==='dinein' && order.table ? `<span class="tag">Mesa ${escapeHtml(order.table)}</span>` : ''}
      ${order.orderType==='pickup' ? `<span class="tag">Pickup</span>` : ''}
    </div>`;
  if (st === 'PAID') {
    payLine = `<div class="payline"><b>¡Muchas gracias por tu compra, ${escapeHtml(order.customer || 'amig@')}! 💚</b></div>`;
  }

  // Resumen corto de ítems
  const items = order.items||[];
  const count = items.reduce((n,i)=> n + (i.qty||1), 0);
  const names = items.map(i=>i.name).slice(0,3).map(escapeHtml).join(', ');

  mineEl.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between">
      <div style="min-width:0">
        <div><b>${escapeHtml(order.customer || '—')}</b> · ${count} it.</div>
        <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${names}</div>
      </div>
      <span class="tag">${label.tag}</span>
    </div>
    <div class="muted" style="margin-top:4px">${label.sub}</div>
    ${payLine}
  `;

  lastMineId = order.id;
  lastMineStatus = st;
}

// ---- Render: Listos ----
function renderReady(list){
  if (!readyEl) return;
  const rows = (list||[])
    .filter(o => (o.status||'')==='READY')
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

// ---- Estado por teléfono + feed ----
let currentPhone = '';

DB.subscribeOrders(list=>{
  renderReady(list);

  // Fallback ETA por carga/tiempos si no viene de settings
  if (etaSource !== 'settings'){
    setETA(computeEtaFallback(list));
  }

  if (currentPhone){
    const mine = (list||[])
      .filter(o => getPhone(o).endsWith(currentPhone))
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
  renderMine(null); // placeholder hasta que llegue snapshot
});

phoneIn?.addEventListener('input', ()=>{
  phoneIn.value = normPhone(phoneIn.value);
});

// ---- QR simple por URL (sin librerías) ----
const qrImg   = $('#qrImg');
const qrUrl   = $('#qrUrl');
const qrUpdate= $('#qrUpdate');
const qrCopy  = $('#qrCopy');

function setDefaultQrUrl(){
  const url = `${location.origin}${location.pathname}`;
  if (qrUrl) qrUrl.value = url;
  updateQr();
}
function updateQr(){
  const url = (qrUrl?.value || '').trim();
  if (!url) return;
  const size = 160;
  const api = 'https://api.qrserver.com/v1/create-qr-code/';
  const src = `${api}?size=${size}x${size}&qzone=2&data=${encodeURIComponent(url)}`;
  if (qrImg) qrImg.src = src;
}
qrUpdate?.addEventListener('click', updateQr);
qrCopy?.addEventListener('click', async ()=>{
  try{
    await navigator.clipboard.writeText(qrUrl.value);
    qrCopy.textContent = '¡Copiado!';
    setTimeout(()=> qrCopy.textContent = 'Copiar enlace', 1200);
  }catch{
    alert('No pude copiar. Selecciona el texto y copia manualmente.');
  }
});
setDefaultQrUrl();

/* ===== ETA fallback ===== */
function tsToMs(t){
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds) return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
  const d = new Date(t); const ms = d.getTime(); return Number.isFinite(ms) ? ms : 0;
}
function isToday(ms){
  if(!ms) return false;
  const d = new Date(ms); const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
}
function computeEtaFallback(orders){
  const base = {min:7, max:10};

  // muestras reales (createdAt → ready/done)
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
    const cut = Math.max(1, Math.floor(samples.length*0.1));   // recorte 10%
    const trimmed = samples.slice(cut, samples.length-cut);
    const avg = trimmed.reduce((a,n)=>a+n,0)/trimmed.length;
    const lo = Math.max(5, Math.round(avg-2));
    const hi = Math.min(25, Math.round(avg+2));
    return `${lo}–${hi} min`;
  }

  // por carga en cola
  const q = (orders||[]).filter(o=>{
    const s = (o.status||'').toUpperCase();
    return s==='PENDING' || s==='RECEIVED' || s==='PREPARING' || s==='TAKEN' || s==='IN_PROGRESS';
  }).length;
  if (q>0){
    const bump = Math.min(12, Math.ceil(q*1.5)); // ~1.5 min por pedido
    const lo = base.min + Math.floor(bump/2);
    const hi = base.max + bump;
    return `${lo}–${hi} min`;
  }

  return `${base.min}–${base.max} min`;
}