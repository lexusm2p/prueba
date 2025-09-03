// /kiosk/track.js
// Página pública para que el cliente vea: Happy Hour, su pedido por teléfono y feed de “Listos”.
// + Generación de QR del enlace (sin librerías que tengas que instalar).

import { subscribeOrders, subscribeHappyHour } from '../shared/db.js';

const $ = (s)=>document.querySelector(s);
const hhPill = $('#hhPill');
const hhText = $('#hhText');
const etaEl  = $('#eta');

const phoneIn = $('#phone');
const goBtn = $('#go');
const mineEl = $('#mine');
const readyEl = $('#ready');

// QR elements
const qrImg = $('#qrImg');
const qrUrl = $('#qrUrl');
const qrUpdate = $('#qrUpdate');
const qrCopy = $('#qrCopy');

etaEl.textContent = '7–10 min'; // estático por ahora

// ---------- Happy Hour ----------
subscribeHappyHour(hh=>{
  const on = !!hh?.enabled;
  hhPill?.classList.toggle('hh-on', on);
  if (hhText) hhText.textContent = on ? `Happy Hour – ${Number(hh.discountPercent||0)}%` : 'HH OFF';
});

// ---------- Helpers ----------
const normPhone = (s='') => String(s).replace(/\D+/g,'').slice(0,15);
const ts = (d)=> (d?.toMillis?.() ?? new Date(d||0).getTime());

// ---------- Render: Mi pedido ----------
function renderMine(order){
  if (!mineEl) return;
  if (!order){
    mineEl.innerHTML = '<div class="muted">Escribe tu teléfono y pulsa “Ver estado”.</div>';
    return;
  }
  const items = order.items||[];
  const count = items.reduce((n,i)=> n + (i.qty||1), 0);
  const names = items.map(i=>i.name).join(', ');
  const status = order.status || 'PENDING';
  const tag = status==='READY' ? '🛎️ Listo' : status==='COOKING' ? '🔥 En cocina' : '⏳ En cola';
  mineEl.innerHTML = `
    <div style="display:flex; gap:8px; align-items:center; justify-content:space-between">
      <div style="min-width:0">
        <div><b>${order.customer || '—'}</b> · ${count} it.</div>
        <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${names}</div>
      </div>
      <span class="tag">${tag}</span>
    </div>`;
}

// ---------- Render: Listos ----------
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

// ---------- Estado por teléfono + feed ----------
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

// ---------- QR: usa un generador por URL (sin instalar nada) ----------
function setDefaultQrUrl(){
  // Por defecto apunta a esta página de track.
  const url = `${location.origin}${location.pathname}`;
  if (qrUrl) qrUrl.value = url;
  updateQr();
}

function updateQr(){
  const url = (qrUrl?.value || '').trim();
  if (!url) return;
  // Servicio público para generar QR como imagen PNG
  const size = 160; // px
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

// Inicializa QR con la URL actual
setDefaultQrUrl();
