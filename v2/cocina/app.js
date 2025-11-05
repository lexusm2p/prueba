// /cocina/app.js — V2 LEAN con render incremental (sin repaints)
// Requiere /shared/db.js V2.8.1+
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
  lD: document.getElementById('lD'),
  cP: document.getElementById('cP'),
  cI: document.getElementById('cI'),
  cR: document.getElementById('cR'),
  cD: document.getElementById('cD'),
};

function money(n){ return '$' + Number(n||0).toFixed(0); }
function key(o){ return String(o.id); }
function whereCol(status){
  if (status===Status.PENDING) return els.lP;
  if (status===Status.IN_PROGRESS) return els.lI;
  if (status===Status.READY) return els.lR;
  if (status===Status.DELIVERED) return els.lD;
  return null;
}

/* ---- Card factory ---- */
function cardHTML(o){
  const itemsTxt = (o.items||[]).map(it => `${it.name} ×${it.qty||1}`).join(', ');
  const name = o.customer || 'Cliente';
  const type = o.orderType || '';
  const actions =
    o.status===Status.PENDING
      ? `<button class="btn" data-a="take">Tomar</button>`
      : o.status===Status.IN_PROGRESS
      ? `<button class="btn" data-a="ready">Listo</button>`
      : o.status===Status.READY
      ? `<button class="btn" data-a="deliver">Entregar</button>
         <button class="btn" data-a="paid">Cobrar</button>`
      : o.status===Status.DELIVERED
      ? `<button class="btn" data-a="paid">Cobrar</button>`
      : ``;

  return `
    <div class="row">
      <b>#${o.id.slice(-5)} · ${name}</b>
      ${type ? `<span class="badge">${type}</span>`:''}
      <span class="price">${money(o.subtotal)}</span>
    </div>
    ${itemsTxt ? `<div class="muted">${itemsTxt}</div>`:''}
    <div class="row" style="margin-top:8px; gap:6px">
      ${actions}
      ${o.status!==Status.CANCELLED
        ? `<button class="btn danger" data-a="cancel">Cancelar</button>`
        : `<span class="badge">Cancelada</span>`}
    </div>
  `;
}

/* ---- Diff & patch por columna ---- */
function patchColumn(container, rows){
  // index actual por id
  const existing = new Map();
  container.querySelectorAll('.card').forEach(el => existing.set(el.dataset.id, el));

  // inserción/actualización en orden
  let last = null;
  for (const o of rows){
    const id = key(o);
    let el = existing.get(id);
    const desiredHTML = cardHTML(o);

    if (!el){
      el = document.createElement('div');
      el.className = 'card';
      el.dataset.id = id;
      el.innerHTML = desiredHTML;
      if (last) last.after(el); else container.prepend(el);
    }else{
      // solo actualizar si cambió algo relevante
      const fingerprint = el.__fp || '';
      const nextFp = `${o.status}|${o.subtotal}|${(o.items?.length||0)}`;
      if (fingerprint !== nextFp){
        el.innerHTML = desiredHTML;
        el.__fp = nextFp;
      }
      // reordenar si es necesario (por seguridad; orden ya viene estable)
      if (last && el.previousElementSibling !== last) {
        last.after(el);
      }
    }
    el.__fp = `${o.status}|${o.subtotal}|${(o.items?.length||0)}`;
    existing.delete(id);
    last = el;
  }

  // remove sobrantes (ya no pertenecen a esta columna)
  existing.forEach(el => el.remove());

  // contador
  const badge = container.parentElement.querySelector('.h .badge');
  if (badge) badge.textContent = String(rows.length);
}

/* ---- Agrupar y parchear sin borrar DOM ---- */
function groupAndPatch(all){
  const g = { PENDING:[], IN_PROGRESS:[], READY:[], DELIVERED:[] };
  for (const o of (all||[])){ if (g[o.status]) g[o.status].push(o); }
  patchColumn(els.lP, g.PENDING);
  patchColumn(els.lI, g.IN_PROGRESS);
  patchColumn(els.lR, g.READY);
  patchColumn(els.lD, g.DELIVERED);
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
    // render sin repaints grandes
    window.requestAnimationFrame(()=> groupAndPatch(rows || []));
  });
  window.addEventListener('beforeunload', ()=>{ try{ unsub?.(); }catch{} });
}
start();
