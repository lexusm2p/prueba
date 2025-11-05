// /cocina/app.js — V2 LEAN con columna “Por cobrar”, total pendiente y render incremental
// Requiere /shared/db.js >= V2.8.1
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

function payMode(o){
  const t = String(o.orderType||'').toLowerCase();
  if (t==='dinein') return 'end';       // paga al final
  if (t==='pickup') return 'counter';   // paga contra entrega
  return 'none';
}
function goesToAR(o){
  if (!o || o.status===Status.PAID || o.status===Status.CANCELLED) return false;
  const mode = payMode(o);
  if (mode==='end')     return o.status === Status.DELIVERED;                    // mesa
  if (mode==='counter') return o.status === Status.READY || o.status === Status.DELIVERED; // pickup
  return false;
}

/* ---- Card factory ---- */
function cardHTML(o){
  const itemsTxt = (o.items||[]).map(it => `${it.name} ×${it.qty||1}`).join(', ');
  const name = o.customer || 'Cliente';
  const type = o.orderType || '';
  let actions = '';

  if (goesToAR(o)){
    const needsDeliver = (payMode(o)==='counter' && o.status===Status.READY);
    actions = `
      ${needsDeliver ? `<button class="btn" data-a="deliver">Entregar</button>` : ``}
      <button class="btn" data-a="paid">Cobrar</button>
      <button class="btn danger" data-a="cancel">Cancelar</button>
    `;
  }else{
    actions =
      o.status===Status.PENDING
        ? `<button class="btn" data-a="take">Tomar</button>`
      : o.status===Status.IN_PROGRESS
        ? `<button class="btn" data-a="ready">Listo</button>`
      : o.status===Status.READY
        ? `<button class="btn" data-a="deliver">Entregar</button>
           <button class="btn" data-a="paid">Cobrar</button>
           <button class="btn danger" data-a="cancel">Cancelar</button>`
      : o.status===Status.DELIVERED
        ? `<button class="btn" data-a="paid">Cobrar</button>
           <button class="btn danger" data-a="cancel">Cancelar</button>`
      : (o.status!==Status.CANCELLED ? `<button class="btn danger" data-a="cancel">Cancelar</button>` : `<span class="badge">Cancelada</span>`);
  }

  return `
    <div class="row">
      <b>#${o.id.slice(-5)} · ${name}</b>
      ${type ? `<span class="badge">${type}</span>`:''}
      <span class="price">${money(o.subtotal)}</span>
    </div>
    ${itemsTxt ? `<div class="muted">${itemsTxt}</div>`:''}
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
    const nextFp = `${o.status}|${o.subtotal}|${(o.items?.length||0)}|${o.orderType||''}|${goesToAR(o)}`;

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
    }catch(err){
      console.warn('[cocina] updateOrderStatus error:', err);
      alert('No se pudo actualizar. Revisa consola.');
    }
  });
}

/* ---- Inicio ---- */
function start(){
  bindActions();
  const unsub = DB.subscribeKitchenOrders((rows)=>{
    window.requestAnimationFrame(()=> groupAndPatch(rows || []));
  });
  window.addEventListener('beforeunload', ()=>{ try{ unsub?.(); }catch{} });
}
start();
