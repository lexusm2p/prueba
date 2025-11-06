// /cocina/app.js — V2.2 Kitchen Pro: cliente, desglose completo y aviso WhatsApp
// Requiere /shared/db.js >= V2.8.1 (updateOrderStatus, subscribeKitchenOrders, sendWhatsAppMessage opcional)

import * as DB from '../shared/db.js';

const Status = {
  PENDING:'PENDING',
  IN_PROGRESS:'IN_PROGRESS',
  READY:'READY',
  DELIVERED:'DELIVERED',
  PAID:'PAID',
  CANCELLED:'CANCELLED'
};

const els = {
  lP: document.getElementById('lP'),
  lI: document.getElementById('lI'),
  lR: document.getElementById('lR'),
  lA: document.getElementById('lA'), // Por cobrar
  lD: document.getElementById('lD'),
  cP: document.getElementById('cP'),
  cI: document.getElementById('cI'),
  cR: document.getElementById('cR'),
  cA: document.getElementById('cA'),
  cD: document.getElementById('cD'),
  tA: document.getElementById('tA'), // Total Por cobrar
};

function money(n){ return '$' + Number(n||0).toFixed(0); }
function key(o){ return String(o.id); }
function maskPhone(p=''){
  const d = String(p||'').replace(/\D+/g,'');
  if (d.length>=10) return d.slice(0,2)+'** **** '+d.slice(-2);
  if (d.length>=7)  return d.slice(0,1)+'** *** '+d.slice(-1);
  return d||'';
}
function payMode(o){
  const t = String(o.orderType||'').toLowerCase();
  if (t==='dinein') return 'end';       // paga al final
  if (t==='pickup') return 'counter';   // paga contra entrega
  return 'none';
}
function goesToAR(o){
  if (!o || o.status===Status.PAID || o.status===Status.CANCELLED) return false;
  const mode = payMode(o);
  if (mode==='end')     return o.status === Status.DELIVERED;                     // mesa: cobra al finalizar
  if (mode==='counter') return o.status === Status.READY || o.status === Status.DELIVERED; // pickup: listo o entregado
  return false;
}

// Construye link de seguimiento (igual que kiosko/track.html)
function buildTrackUrl({ orderId, phone }){
  try{
    const u = new URL('../kiosk/track.html', location.href);
    if (orderId) u.searchParams.set('oid', orderId);
    if (phone)   u.searchParams.set('phone', phone.startsWith('52')?phone:('52'+phone));
    u.searchParams.set('gamify','1');
    return u.toString();
  }catch{ return ''; }
}

// Texto de items con ingredientes + extras + notas (para flujo de preparación)
function renderItemDetail(it){
  const lines = [];

  // Línea principal: Nombre ×qty
  lines.push(`<b>${escapeHtml(it.name||'Item')}</b> ×${Number(it.qty||1)}`);

  // Ingredientes base (si vienen del kiosko)
  const inc = Array.isArray(it.ingredients) && it.ingredients.length
    ? it.ingredients
    : (Array.isArray(it.baseIngredients)?it.baseIngredients:[]);
  if (inc.length){
    lines.push('<ul>' + inc.map(s=>`<li>${escapeHtml(String(s))}</li>`).join('') + '</ul>');
  }

  // Cambios y extras
  const extraBits = [];
  if (it.salsaCambiada) extraBits.push('Cambio salsa: '+escapeHtml(it.salsaCambiada));
  if (it.extras?.dlcCarne) extraBits.push('DLC carne 85g');
  if (Array.isArray(it.extras?.sauces) && it.extras.sauces.length){
    it.extras.sauces.forEach(s=> extraBits.push('Aderezo: '+escapeHtml(s)));
  }
  if (Array.isArray(it.extras?.ingredients) && it.extras.ingredients.length){
    it.extras.ingredients.forEach(s=> extraBits.push('Extra: '+escapeHtml(s)));
  }
  if (extraBits.length){
    lines.push('<div class="muted" style="margin-top:2px">'+extraBits.join(', ')+'</div>');
  }

  // Notas específicas de la línea
  if (it.notes){
    lines.push('<div class="muted" style="margin-top:2px"><i>Notas:</i> '+escapeHtml(it.notes)+'</div>');
  }

  return `<div>${lines.join('')}</div>`;
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

/* ---- Card factory ---- */
function cardHTML(o){
  const name = o.customer || 'Cliente';
  const type = String(o.orderType||'').toLowerCase(); // pickup | dinein
  const mesa = type==='dinein' ? (o.table || '') : '';
  const phone = type==='pickup' ? (o.phone || '') : null;
  const phoneMasked = phone ? maskPhone(phone) : '';
  const payPref = o.payMethodPref ? ` · ${escapeHtml(o.payMethodPref)}` : '';

  // Encabezado con ID corto, cliente, tipo y total
  const header = `
    <div class="row">
      <b>#${escapeHtml(o.id?.slice?.(-5)||'—')} · ${escapeHtml(name)}</b>
      ${ type==='pickup' ? `<span class="badge">Pickup</span>` : `<span class="badge">Mesa${mesa?(' '+escapeHtml(mesa)) : ''}</span>` }
      ${ phoneMasked ? `<span class="badge">${phoneMasked}</span>` : '' }
      <span class="price">${money(o.subtotal)}${payPref}</span>
    </div>`;

  // Detalle de cada item
  const itemsHtml = (o.items||[])
    .filter(x => !x.isGift)
    .map(renderItemDetail)
    .join('<hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:6px 0"/>');

  // Notas generales del pedido
  const orderNotes = o.notes ? `<div class="muted" style="margin-top:6px"><i>Notas del pedido:</i> ${escapeHtml(o.notes)}</div>` : '';

  // Botonera
  let actions = '';
  const pmode = payMode(o);
  const canNotify = type==='pickup' && (o.status===Status.READY || o.status===Status.DELIVERED) && phone;
  const notifyBtn = canNotify ? `<button class="btn" data-a="notify" title="Avisar por WhatsApp">Avisar WhatsApp</button>` : '';

  if (goesToAR(o)){
    const needsDeliver = (pmode==='counter' && o.status===Status.READY);
    actions = `
      ${needsDeliver ? `<button class="btn" data-a="deliver">Entregar</button>` : ``}
      <button class="btn" data-a="paid">Cobrar ${money(o.subtotal)}</button>
      ${notifyBtn}
      <button class="btn danger" data-a="cancel">Cancelar</button>
    `;
  } else {
    actions =
      o.status===Status.PENDING
        ? `<button class="btn" data-a="take">Tomar</button>`
      : o.status===Status.IN_PROGRESS
        ? `<button class="btn" data-a="ready">Listo</button>`
      : o.status===Status.READY
        ? `<button class="btn" data-a="deliver">Entregar</button>
           <button class="btn" data-a="paid">Cobrar ${money(o.subtotal)}</button>
           ${notifyBtn}
           <button class="btn danger" data-a="cancel">Cancelar</button>`
      : o.status===Status.DELIVERED
        ? `<button class="btn" data-a="paid">Cobrar ${money(o.subtotal)}</button>
           ${notifyBtn}
           <button class="btn danger" data-a="cancel">Cancelar</button>`
      : (o.status!==Status.CANCELLED ? `<button class="btn danger" data-a="cancel">Cancelar</button>` : `<span class="badge">Cancelada</span>`);
  }

  return `
    ${header}
    <div style="margin-top:6px">${itemsHtml || '<div class="muted">Sin items</div>'}</div>
    ${orderNotes}
    <div class="row" style="margin-top:8px; gap:6px">
      ${actions}
    </div>
  `;
}

/* ---- Diff & patch por columna ---- */
function patchColumn(container, rows){
  const existing = new Map();
  container.querySelectorAll('.card').forEach(el => existing.set(el.dataset.id, el));

  let last = null;
  for (const o of rows){
    const id = key(o);
    let el = existing.get(id);
    const nextFp = `${o.status}|${o.subtotal}|${(o.items?.length||0)}|${o.orderType||''}|${o.table||''}|${o.phone||''}|${o.notes||''}|${fingerprintItems(o.items)}`;

    if (!el){
      el = document.createElement('div');
      el.className = 'card';
      el.dataset.id = id;
      el.__fp = '';
      if (last) last.after(el); else container.prepend(el);
    }
    if (el.__fp !== nextFp){
      el.innerHTML = cardHTML(o);
      el.__fp = nextFp;
    }
    // asegurar orden
    if (last && el.previousElementSibling !== last) last.after(el);

    existing.delete(id);
    last = el;
  }
  existing.forEach(el => el.remove());

  const badge = container.parentElement.querySelector('.h .badge');
  if (badge) badge.textContent = String(rows.length);
}

function fingerprintItems(items=[]){
  try{
    return items.map(i => [
      i.id, i.name, i.qty, i.salsaCambiada, i.notes,
      (i.extras?.dlcCarne?'1':'0'),
      (i.extras?.sauces||[]).join('|'),
      (i.extras?.ingredients||[]).join('|'),
      (i.ingredients||i.baseIngredients||[]).join('|')
    ].join('~')).join('||');
  }catch{ return String(items?.length||0); }
}

/* ---- Agrupar con columna AR sin duplicados + total ---- */
function groupAndPatch(all){
  const base = { PENDING:[], IN_PROGRESS:[], READY:[], DELIVERED:[] };
  for (const o of (all||[])){ if (base[o.status]) base[o.status].push(o); }

  const AR = all.filter(goesToAR);
  const arSet = new Set(AR.map(o=>o.id));
  const READY = base.READY.filter(o => !arSet.has(o.id));
  const DELIV = base.DELIVERED.filter(o => !arSet.has(o.id));

  // render columnas
  patchColumn(els.lP, base.PENDING);
  patchColumn(els.lI, base.IN_PROGRESS);
  patchColumn(els.lR, READY);
  patchColumn(els.lA, AR);
  patchColumn(els.lD, DELIV);

  // total $ por cobrar
  const totalAR = AR.reduce((acc,o)=> acc + Number(o.subtotal||0), 0);
  if (els.tA) els.tA.textContent = money(totalAR);

  // contadores visibles (opcionales si tu HTML ya los pinta por columna)
  if (els.cP) els.cP.textContent = String(base.PENDING.length);
  if (els.cI) els.cI.textContent = String(base.IN_PROGRESS.length);
  if (els.cR) els.cR.textContent = String(READY.length);
  if (els.cA) els.cA.textContent = String(AR.length);
  if (els.cD) els.cD.textContent = String(DELIV.length);
}

/* ---- Acciones ---- */
function bindActions(){
  document.getElementById('cols').addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-a]'); if(!btn) return;
    const card = btn.closest('.card'); if(!card) return;
    const id = card.dataset.id;
    const act = btn.dataset.a;
    try{
      if (act==='take')     await DB.updateOrderStatus(id, Status.IN_PROGRESS);
      if (act==='ready')    await DB.updateOrderStatus(id, Status.READY);
      if (act==='deliver')  await DB.updateOrderStatus(id, Status.DELIVERED);
      if (act==='paid')     await DB.updateOrderStatus(id, Status.PAID);
      if (act==='cancel')   await DB.updateOrderStatus(id, Status.CANCELLED);
      if (act==='notify')   await notifyPickup(id);
    }catch(err){
      console.warn('[cocina] updateOrderStatus/notify error:', err);
      alert('No se pudo ejecutar la acción. Revisa consola.');
    }
  });
}

/* ---- Aviso por WhatsApp (Pickup) ---- */
async function notifyPickup(orderId){
  if (typeof DB.sendWhatsAppMessage !== 'function'){ alert('WhatsApp no disponible'); return; }
  const o = __ORDERS_MAP.get(orderId);
  if (!o || !o.phone){ alert('Sin teléfono'); return; }
  const phone = String(o.phone).replace(/\D+/g,''); // espera 10 dígitos MX
  const track = buildTrackUrl({ orderId, phone });
  const etaTxt = o.etaText ? `ETA: ${o.etaText}\n` : '';
  const text = `¡Hola ${o.customer||''}! Tu pedido #${orderId?.slice?.(-5) || ''} en Seven de Burgers está `+
               `${o.status===Status.READY?'LISTO':'casi listo'}.\n${etaTxt}`+
               `Total: ${money(o.subtotal)}\n`+
               (track ? `Síguelo aquí: ${track}` : '');
  try{
    await DB.sendWhatsAppMessage({ to: (phone.startsWith('52')?phone:('52'+phone)), text, meta:{kind:'kitchen_notify', orderId} });
    alert('Notificado por WhatsApp');
  }catch(err){
    console.warn('[cocina] sendWhatsAppMessage error', err);
    alert('No se pudo enviar WhatsApp');
  }
}

/* ---- Inicio / Subs ---- */
const __ORDERS_MAP = new Map();
function start(){
  bindActions();
  const unsub = DB.subscribeKitchenOrders((rows)=>{
    try{
      __ORDERS_MAP.clear();
      (rows||[]).forEach(o=> __ORDERS_MAP.set(String(o.id), o));
      window.requestAnimationFrame(()=> groupAndPatch(rows || []));
    }catch(err){ console.warn('[cocina] render error', err); }
  });
  window.addEventListener('beforeunload', ()=>{ try{ unsub?.(); }catch{} });
}
start();
