// /cocina/app.js — V2.1 LEAN+Prep (Por cobrar + total + render incremental + receta canónica)
// Requiere /shared/db.js >= V2.8.1
import * as DB from '../shared/db.js';

/* ======================= Constantes & Estado ======================= */
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
  if (mode==='end')     return o.status === Status.DELIVERED;                              // mesa
  if (mode==='counter') return o.status === Status.READY || o.status === Status.DELIVERED; // pickup
  return false;
}

/* ======================= Helpers de preparación (receta canónica) ======================= */

// Normaliza cadenas para matching flexible (jitomate/tomate, cebollita/cebolla…)
function __norm(s=''){
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

// Aliases para detectar “sin X” en notas y mapear al ingrediente real
const __ALIASES = new Map([
  ['tomate','jitomate'],
  ['cebollita','cebolla'],
  ['ketchup','catsup'],
  ['mostasa','mostaza'],
  ['mayo','mayonesa'],
  ['queso','queso'],            // si el cliente pone “sin queso” (genérico)
  ['chipotle','aderezo chipotle'],
  ['habanero','aderezo de ajo habanero'],
]);

function escapeHtmlKitchen(t=''){
  const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' };
  return String(t).replace(/[&<>"']/g, ch => map[ch]);
}

// Detecta ingredientes removidos a partir de las notas (“sin …”)
function detectRemovalsFromNotes(notes, baseList){
  if (!notes) return [];
  const raw = String(notes);
  const txt = __norm(raw);

  // Captura “sin mostaza”, “sin cebolla y jitomate”, “sin lechuga, sin catsup”
  const sinRegex = /sin\s+([a-záéíóúñ\s,\/]+)/gi;
  const candidates = [];
  let m;
  while ((m = sinRegex.exec(raw)) !== null){
    const chunk = m[1] || '';
    chunk.split(/[,\/]|\sy\s/gi).forEach(word=>{
      const w = __norm(word);
      if (w.length >= 3) candidates.push(w);
    });
  }
  if (!candidates.length) return [];

  const baseNorm = baseList.map(x=>({
    raw: x,
    norm: __norm(String(x).replace(/^carne\s*\d+\s*g$/i, 'carne'))
  }));

  const removalsRaw = new Set();
  for (const c0 of candidates){
    const c = __ALIASES.get(c0) || c0;

    // Si ponen “sin queso”, quita ambos quesos si existen
    if (c==='queso'){
      baseNorm.forEach(b=>{
        if (b.norm.includes('queso')) removalsRaw.add(b.raw);
      });
      continue;
    }

    const found = baseNorm.find(b=>{
      if (b.norm === c) return true;
      return b.norm.includes(c) || c.includes(b.norm);
    });

    if (found) removalsRaw.add(found.raw);
    else {
      // fallback: “sin salsa/aderezo”
      if (c==='salsa' || c==='aderezo'){
        const salsaLine = baseNorm.find(b=> b.norm.includes('aderezo') || b.norm.includes('salsa'));
        if (salsaLine) removalsRaw.add(salsaLine.raw);
      }
    }
  }

  if (!removalsRaw.size) return [];
  // Preservar orden canónico
  return baseList.filter(x => removalsRaw.has(x));
}

function buildPrepSections(line){
  const base = Array.isArray(line?.baseIngredients) && line.baseIngredients.length
    ? [...line.baseIngredients]
    : (Array.isArray(line?.ingredients) ? [...line.ingredients] : []);

  const salsaBase  = line?.salsaDefault || null;
  const salsaSwap  = line?.salsaCambiada || null;
  const salsaInfo  = salsaSwap ? { tipo:'Cambiada', valor:salsaSwap }
                               : (salsaBase ? { tipo:'Base', valor:salsaBase } : null);

  const extraSauces = Array.isArray(line?.extras?.sauces) ? line.extras.sauces : [];
  const extraIngrs  = Array.isArray(line?.extras?.ingredients) ? line.extras.ingredients : [];
  const dlcCarne    = !!line?.extras?.dlcCarne;

  const notes = String(line?.notes||'').trim();
  const removals = detectRemovalsFromNotes(notes, base);

  const extraFlags = [];
  if (dlcCarne) extraFlags.push('DLC carne 85 g');

  return { base, salsaInfo, extraSauces, extraIngrs, extraFlags, removals, notes };
}

function buildKitchenPrepHTML(line){
  const s = buildPrepSections(line);

  const baseList = s.base.map(x=> `<li>${escapeHtmlKitchen(x)}</li>`).join('');

  const salsaHtml = s.salsaInfo
    ? `<div class="pill">Salsa ${s.salsaInfo.tipo}: <b>${escapeHtmlKitchen(s.salsaInfo.valor)}</b></div>` : '';

  const extrasSau = s.extraSauces.length
    ? `<div class="pill">Aderezos extra: ${s.extraSauces.map(x=>`<b>${escapeHtmlKitchen(x)}</b>`).join(', ')}</div>` : '';
  const extrasIng = s.extraIngrs.length
    ? `<div class="pill">Ingredientes extra: ${s.extraIngrs.map(x=>`<b>${escapeHtmlKitchen(x)}</b>`).join(', ')}</div>` : '';
  const extrasFlg = s.extraFlags.length
    ? `<div class="pill">${s.extraFlags.map(x=>`<b>${escapeHtmlKitchen(x)}</b>`).join(' · ')}</div>` : '';

  const removed = s.removals.length
    ? `<div class="pill danger">Sin: ${s.removals.map(x=>`<b>${escapeHtmlKitchen(x)}</b>`).join(', ')}</div>` : '';

  const notesHtml = s.notes
    ? `<div class="notes">Notas: <i>${escapeHtmlKitchen(s.notes)}</i></div>` : '';

  return `
    <div class="prep">
      <ol class="prep-list">${baseList}</ol>
      <div class="prep-meta">
        ${salsaHtml}
        ${extrasSau}
        ${extrasIng}
        ${extrasFlg}
        ${removed}
        ${notesHtml}
      </div>
    </div>`;
}

// CSS mínimo para cocina (píldoras y lista)
(function ensureKitchenPrepCSS(){
  if (document.getElementById('kitchenPrepCSS')) return;
  const css = document.createElement('style');
  css.id = 'kitchenPrepCSS';
  css.textContent = `
    .card{ background:#0f182a; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:10px; margin:8px 0; }
    .card .row{ display:flex; align-items:center; gap:8px; justify-content:space-between; flex-wrap:wrap; }
    .card .muted{ opacity:.85; font-size:.92rem; }
    .badge{ background:#1b2a44; border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:1px 8px; font-size:.8rem; }
    .price{ margin-left:auto; font-variant-numeric: tabular-nums; }
    .prep-list{ margin:.25rem 0 .5rem 1.2rem; }
    .prep-meta{ display:flex; flex-wrap:wrap; gap:6px; }
    .pill{ background:#1a2a44; border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:3px 8px; font-size:.85rem; }
    .pill.danger{ background:#3a1620; border-color:#d44; }
    .notes{ margin-top:6px; font-size:.9rem; opacity:.9; }
    .k-actions .btn{ padding:6px 10px; font-size:.9rem; }
  `;
  document.head.appendChild(css);
})();

/* ======================= Card factory (con receta canónica) ======================= */

// Render de cada línea con receta/ingredientes
function renderLineHTML(line){
  const qty = Number(line?.qty||1);
  const title = `${escapeHtmlKitchen(line?.name||'Producto')} · x${qty}`;
  const prepHtml = buildKitchenPrepHTML(line);
  const total = Number(line?.lineTotal||0);

  return `
    <div class="k-line">
      <h4 style="margin:0 0 6px 0">${title}</h4>
      ${prepHtml}
      <div class="row" style="gap:6px;margin-top:6px">
        <div class="muted mono">Línea: ${money(total)}</div>
      </div>
    </div>`;
}

// Tarjeta de orden (usa renderLineHTML para cada item)
function cardHTML(o){
  const name = escapeHtmlKitchen(o.customer || 'Cliente');
  const type = o.orderType || '';
  const lines = Array.isArray(o.items) ? o.items : [];
  const itemsBlock = lines.map(renderLineHTML).join('');

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
      <b>#${String(o.id||'').slice(-5)} · ${name}</b>
      ${type ? `<span class="badge">${escapeHtmlKitchen(type)}</span>`:''}
      <span class="price">${money(o.subtotal)}</span>
    </div>

    ${itemsBlock || ''}

    <div class="row" style="margin-top:8px; gap:6px">
      ${actions}
    </div>
  `;
}

/* ======================= Diff & Patch por columna ======================= */
function patchColumn(container, rows){
  const existing = new Map();
  container.querySelectorAll('.card').forEach(el => existing.set(el.dataset.id, el));

  let last = null;
  for (const o of rows){
    const id = key(o);
    let el = existing.get(id);

    // fingerprint incluye: status, subtotal, longitud items, orderType, “va a AR?”
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
    // asegurar orden (estable)
    if (last && el.previousElementSibling !== last) last.after(el);

    existing.delete(id);
    last = el;
  }
  existing.forEach(el => el.remove());

  // contador de la cabecera de la columna
  const badge = container.parentElement.querySelector('.h .badge');
  if (badge) badge.textContent = String(rows.length);
}

/* ======================= Agrupar + “Por cobrar” sin duplicados + total ======================= */
function groupAndPatch(all){
  const base = { PENDING:[], IN_PROGRESS:[], READY:[], DELIVERED:[] };
  for (const o of (all||[])){ if (base[o.status]) base[o.status].push(o); }

  const AR = all.filter(goesToAR);
  const arSet = new Set(AR.map(o=>o.id));
  const READY = base.READY.filter(o => !arSet.has(o.id));
  const DELIV = base.DELIVERED.filter(o => !arSet.has(o.id));

  patchColumn(els.lP, base.PENDING);
  patchColumn(els.lI, base.IN_PROGRESS);
  patchColumn(els.lR, READY);
  patchColumn(els.lA, AR);
  patchColumn(els.lD, DELIV);

  // total $ por cobrar
  const totalAR = AR.reduce((acc,o)=> acc + Number(o.subtotal||0), 0);
  if (els.tA) els.tA.textContent = money(totalAR);
}

/* ======================= Acciones ======================= */
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

/* ======================= Inicio ======================= */
function start(){
  bindActions();
  const unsub = DB.subscribeKitchenOrders((rows)=>{
    // Render incremental con rAF para mantener UI fluida
    window.requestAnimationFrame(()=> groupAndPatch(rows || []));
  });
  window.addEventListener('beforeunload', ()=>{ try{ unsub?.(); }catch{} });
}
start();
