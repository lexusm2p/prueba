// /kiosk/track.js
// Track público: refleja el MISMO status que cocina, notifica y suena en READY,
// muestra total a pagar y agradece al pagar.

import { subscribeOrders, subscribeHappyHour } from '../shared/db.js';

const $ = (s)=>document.querySelector(s);
const hhPill = $('#hhPill');
const hhText = $('#hhText');
const etaEl  = $('#eta');

const phoneIn = $('#phone');
const goBtn = $('#go');
const mineEl = $('#mine');
const readyEl = $('#ready');

const ding = $('#ding'); // <audio> para READY

// ---- Notificaciones (permiso) ----
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(()=>{});
}

// ---- Happy Hour ----
subscribeHappyHour(hh=>{
  const on = !!hh?.enabled;
  hhPill?.classList.toggle('hh-on', on);
  if (hhText) hhText.textContent = on ? `Happy Hour – ${Number(hh.discountPercent||0)}%` : 'HH OFF';
});

// ---- Helpers ----
const normPhone = (s='') => String(s).replace(/\D+/g,'').slice(0,15);
const ts = (d)=> (d?.toMillis?.() ?? new Date(d||0).getTime());
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);

const STATUS_TEXT = {
  // Lo que ve el cliente (mapea al estado de cocina)
  PENDING:   { tag: '📥 Pedido recibido', sub: 'Esperando confirmación en cocina' },
  CONFIRMED: { tag: '✅ Confirmado',      sub: 'En cola' }, // si lo usan
  COOKING:   { tag: '🔥 En preparación',  sub: 'Estamos cocinando tu pedido' },
  READY:     { tag: '🛎️ Listo para entregar', sub: 'Pásalo a recoger o espera en tu mesa' },
  PAID:      { tag: '💚 Pagado',          sub: '¡Gracias!' }
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

  // Notificación + sonido cuando pasa a READY
  if (order.id === lastMineId && lastMineStatus !== 'READY' && order.status === 'READY') {
    try { ding?.play?.(); } catch {}
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Tu pedido está listo 🛎️', {
        body: `${order.customer || '—'} · Total ${money(order.subtotal||0)}`
      });
    }
  }

  // Mensajes según estado
  const st = String(order.status || 'PENDING').toUpperCase();
  const label = STATUS_TEXT[st] || STATUS_TEXT.PENDING;

  // Totales
  const subtotal = Number(order.subtotal || 0);
  const hhDisc   = Number(order.hh?.totalDiscount || 0);

  // Línea de pago: se muestra en READY y PENDING/COOKING también (informativo),
  // y se reemplaza por gracias en PAID.
  let payLine = `
    <div class="payline">
      <span class="price">Total a pagar: ${money(subtotal)}</span>
      ${hhDisc>0 ? `<span class="tag">Ahorro HH: -${money(hhDisc)}</span>` : ''}
      ${order.payMethodPref ? `<span class="tag">${order.payMethodPref}</span>` : ''}
      ${order.orderType==='dinein' && order.table ? `<span class="tag">Mesa ${order.table}</span>` : ''}
      ${order.orderType==='pickup' ? `<span class="tag">Pickup</span>` : ''}
    </div>`;

  if (st === 'PAID') {
    payLine = `<div class="payline"><b>¡Muchas gracias por tu compra, ${order.customer || 'amig@'}! 💚</b></div>`;
  }

  // Resumen corto de ítems
  const items = order.items||[];
  const count = items.reduce((n,i)=> n + (i.qty||1), 0);
  const names = items.map(i=>i.name).slice(0,3).join(', ');

  mineEl.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between">
      <div style="min-width:0">
        <div><b>${order.customer || '—'}</b> · ${count} it.</div>
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
      const names = items.map(i=>i.name).slice(0,2).join(', ');
      return `<li>
        <div style="flex:1;min-width:0">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${(o.customer||'—')}</b> · ${count} it.</div>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${names}</div>
        </div>
        <div>🛎️</div>
      </li>`;
    }).join('');
  readyEl.innerHTML = rows || '<li><div class="muted">—</div></li>';
}

// ---- Estado por teléfono + feed ----
let currentPhone = '';

subscribeOrders(list=>{
  renderReady(list);

  if (currentPhone){
    const mine = (list||[])
      .filter(o => normPhone(o.phone||'').endsWith(currentPhone))
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
