// /kiosk/app.js
// Kiosko con carrito, edición de líneas, meta de pedido y laterales (incluye feed de “Listos”).
// + Logro de 3 minis (sonido/aviso), aderezo sorpresa gratis, método de pago y mensaje final.
// + Happy Hour aplicado SOLO al precio base del producto (no a extras ni DLC) y resumen por pedido.

import { beep, toast } from '../shared/notify.js';
import {
  createOrder,
  fetchCatalogWithFallback,
  subscribeOrders,
  // Cliente por teléfono
  fetchCustomer,
  upsertCustomerFromOrder,
  attachLastOrderRef,
} from '../shared/db.js';

const state = {
  menu: null,
  mode: 'mini',
  cart: [],
  customerName: '',
  // teléfono agregado para pickup
  orderMeta: { type: 'pickup', table: '', phone: '', payMethodPref: 'efectivo' },
  unsubReady: null,
  comboUnlocked: false, // ← para “3 minis” (logro)
};

/* === ÍCONOS: asigna aquí la ruta a las imágenes de cada burger base ===
   (para minis se usa la imagen de su baseOf)
*/
const ICONS = {
  starter:   "../shared/img/burgers/starter.png",
  koopa:     "../shared/img/burgers/koopa.png",
  fatality:  "../shared/img/burgers/fatality.png",
  mega:      "../shared/img/burgers/mega.png",
  hadouken:  "../shared/img/burgers/hadouken.png",
  nintendo:  "../shared/img/burgers/nintendo.png",
  finalboss: "../shared/img/burgers/finalboss.png"
};

/* === Audio “achievement” (opcional) === */
let achievementAudio = null;
try { achievementAudio = new Audio('../shared/sfx/achievement.mp3'); } catch {}
async function playAchievement(){
  try {
    if (achievementAudio) { await achievementAudio.play(); return; }
    beep();
  } catch { beep(); }
}

/* 1) Login oculto */
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

/* 2) Tabs */
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

/* 3) Init */
init();
async function init(){
  state.menu = await fetchCatalogWithFallback();
  renderCards();
  setActiveTab('mini');
  updateCartBar();
  setupSidebars();
  setupReadyFeed(); // <- feed en vivo
}

// dinero robusto (no revienta si llega undefined/null)
const money = (n)=> '$' + Number(n ?? 0).toFixed(0);

/* Helpers */
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
function slug(s){
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

// Normaliza ingredientes extra (acepta strings o {id,name,price})
function normalizeExtraIngredients(){
  const raw = state.menu?.extras?.ingredients ?? [];
  const defaultPrice = Number(state.menu?.extras?.ingredientPrice ?? 0);
  return raw.map(x=>{
    if (typeof x === 'string') return { id: slug(x), name: x, price: defaultPrice };
    return { id: x.id || slug(x.name), name: x.name, price: Number(x.price ?? defaultPrice) };
  });
}

/* === Happy Hour helpers (descuento solo al precio base del producto) === */
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
  // si eligibleOnly==true, respeta flag de producto (default true si no definido)
  const isEligible = eligibleOnly ? (item?.hhEligible !== false) : true;
  if (!isEligible) return 0;
  const unit = Number(item?.price || 0);
  return unit * pct; // SOLO al precio base
}

/* === Cómputos de carrito === */
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

/* 4) Tarjetas (con imagen) */
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
        <div class="price">${money(it.price)}</div>
        <div class="row" style="gap:8px">
          <button class="btn ghost small" data-a="ing">Ingredientes</button>
          <button class="btn small" data-a="order">Ordenar</button>
        </div>
      </div>`;
    grid.appendChild(card);

    card.querySelector('[data-a="ing"]')?.addEventListener('click', ()=>{
      alert(`${base?.name||it.name}\n\nIngredientes:\n- ${(base?.ingredients||[]).join('\n- ')}`);
    });
    card.querySelector('[data-a="order"]')?.addEventListener('click', ()=> openItemModal(it, base));
  });
}

/* 5) Modal producto (add/edit) */
function openItemModal(item, base, existingIndex=null){
  const modal = document.getElementById('modal'); modal?.classList.add('open');
  const body  = document.getElementById('mBody');
  const ttl   = document.getElementById('mTitle');
  const xBtn  = document.getElementById('mClose');
  if(ttl) ttl.textContent = `${item.name} · ${money(item.price)}`;
  if(xBtn) xBtn.onclick = ()=> modal?.classList.remove('open');

  // Extras
  const sauces = state.menu?.extras?.sauces ?? [];
  const extrasIngr = normalizeExtraIngredients(); // [{id,name,price}]
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

    // === HH: descuento SOLO sobre el precio base del producto ===
    const hhDiscPerUnit = hhDiscountPerUnit(item); // en $/unidad
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

      // === Aderezo sorpresa (gratis, no suma costo) -> si eligió algún extra ===
      let surpriseSauce = null;
      if ((saucesSel.length + ingrSel.length) > 0){
        const pool = (state.menu?.extras?.sauces || []).filter(s => !saucesSel.includes(s));
        if (pool.length) {
          // escoger “determinístico” por estabilidad visual
          const idx = (state.cart.length + qty) % pool.length;
          surpriseSauce = pool[idx];
        }
      }

      const newLine = {
        id: item.id, name: item.name, mini: !!item.mini, qty,
        unitPrice: Number(item.price||0),
        baseIngredients: base?.ingredients||[],
        salsaDefault: base?.salsaDefault || base?.suggested || null,
        salsaCambiada: salsaSwap,
        extras: { sauces: saucesSel, ingredients: ingrSel, dlcCarne: !!dlcChk, surpriseSauce: surpriseSauce || null },
        notes,
        lineTotal: subtotal,
        hhDisc: hhDiscTotal // para reporte por línea
      };

      if (existingIndex!==null){ state.cart[existingIndex] = newLine; toast('Línea actualizada'); }
      else { state.cart.push(newLine); toast('Agregado al pedido'); }

      checkComboAchievement(); // ← valida combo de 3 minis

      document.getElementById('modal')?.classList.remove('open');
      updateCartBar(); beep();
    };
  }
}

/* 6) Carrito */
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

// limpia teléfono a solo dígitos
function normalizePhone(raw=''){
  return String(raw).replace(/\D+/g,'').slice(0,15);
}

function openCartModal(){
  const m = document.getElementById('cartModal');
  const body = document.getElementById('cartBody');
  const close = ()=> { if(m) m.style.display='none'; };
  document.getElementById('cartClose')?.addEventListener('click', close);
  if(m) m.style.display='grid';

  const confirmBtn = document.getElementById('cartConfirm');
  const totalEl    = document.getElementById('cartTotal');

  // ======= Carrito vacío =======
  if(state.cart.length===0){
    if(body) body.innerHTML = '<div class="muted">Tu carrito está vacío, elige un personaje de sabor.</div>';
    if (confirmBtn) confirmBtn.style.display = 'none';
    if (totalEl) totalEl.style.display = 'none';
    return;
  }

  // Hay artículos: aseguramos mostrar total y confirmar
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
        <input id="phoneNum" type="tel" inputmode="tel" placeholder="10 dígitos"
              pattern="\\d{10,}" value="${state.orderMeta.phone||''}" />
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

  // normaliza conforme se escribe
  if (phoneInput){
    phoneInput.addEventListener('input', ()=>{
      const pos = phoneInput.selectionStart ?? phoneInput.value.length;
      phoneInput.value = normalizePhone(phoneInput.value);
      try { phoneInput.setSelectionRange(pos, pos); } catch {}
    });

    // Autocompletar nombre por teléfono (si existe cliente)
    phoneInput.addEventListener('change', async ()=>{
      const p = normalizePhone(phoneInput.value);
      if (p.length >= 10){
        const c = await fetchCustomer(p);
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

  // Handler de clicks persistente (reemplaza cualquier anterior)
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
        updateCartBar();
        openCartModal(); // re-render; si queda vacío, se muestra mensaje vacío
        return;
      }

      if (act === 'more') {
        line.qty = Math.min(99, (line.qty || 1) + 1);
        recomputeLine(line);
        updateCartBar();
        openCartModal();
        checkComboAchievement();
        return;
      }

      if (act === 'less') {
        line.qty = Math.max(1, (line.qty || 1) - 1);
        recomputeLine(line);
        updateCartBar();
        openCartModal();
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

    // valida según tipo
    if(state.orderMeta.type==='dinein'){
      state.orderMeta.table = (document.getElementById('tableNum')?.value||'').trim();
      if(!state.orderMeta.table){ alert('Indica el número de mesa.'); return; }
      state.orderMeta.phone = '';
    } else { // pickup
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

    // Subtotales + resumen de HH
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

    // Crea pedido y actualiza/crea cliente por teléfono
    const orderId = await createOrder(order);   // createOrder devuelve el id
    if (order.phone) {
      await upsertCustomerFromOrder(order);
      await attachLastOrderRef(order.phone, orderId);
    }

    beep();
    toast(`Gracias ${state.customerName}, te avisaremos cuando esté listo 🛎️`);
    state.cart = []; updateCartBar();
    if(m) m.style.display='none';
  });
}

function recomputeLine(line){
  const DLC = Number(state.menu?.extras?.dlcCarneMini ?? 12);
  const SP  = Number(state.menu?.extras?.saucePrice ?? 0);

  // costo ingredientes por nombre
  const extrasIngr = normalizeExtraIngredients();
  const priceByName = new Map(extrasIngr.map(x=>[x.name, x.price]));
  const costI = (line.extras?.ingredients||[]).reduce((sum, name)=>{
    return sum + Number(priceByName.get(name) ?? state.menu?.extras?.ingredientPrice ?? 0);
  }, 0);

  const costS = (line.extras?.sauces?.length || 0) * SP;
  const dlcOn = !!(line.extras?.dlcCarne);
  const extraDlc = dlcOn ? DLC : 0;

  // HH sobre precio base
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
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/* ===== Laterales ===== */
function setupSidebars(){
  const hh = state.menu?.happyHour || { enabled:false, discountPercent:0, bannerText:'' };
  const pill = document.getElementById('hhPill');
  const txt  = document.getElementById('hhText');
  const msg  = document.getElementById('hhMsg');
  if (pill && txt){
    pill.classList.toggle('on', !!hh.enabled);
    txt.textContent = hh.enabled ? `Happy Hour – ${hh.discountPercent}%` : 'HH OFF';
    if (msg) msg.textContent = hh.bannerText || (hh.enabled ? 'Promos activas por tiempo limitado' : '');
  }
  const eta = document.getElementById('etaTime'); if (eta) eta.textContent = '7–10 min';

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
    const pool = (state.menu?.minis||[]).slice(0,3).concat((state.menu?.burgers||[]).slice(0,2));
    rank.innerHTML = pool.map(p=>`<li><div style="flex:1">${p.name}</div><div class="muted small">🔥</div></li>`).join('');
  }
}

/* Feed de “Listos” (en vivo) */
function setupReadyFeed(){
  if (state.unsubReady) { state.unsubReady(); state.unsubReady = null; }
  const container = document.getElementById('readyFeed'); if (!container) return;
  state.unsubReady = subscribeOrders(list=>{
    // Filtra READY, recientes primero
    const ready = (list||[]).filter(o=> (o.status||'')==='READY')
      .sort((a,b)=>{
        const ta = oTime(a);
        const tb = oTime(b);
        return tb - ta;
      }).slice(0,6);

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

/* Upsell: agregar rápido */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-add]'); if(!btn) return;
  const id = btn.getAttribute('data-add');
  const all = [
    ...(state.menu?.drinks||[]), ...(state.menu?.sides||[]),
    ...(state.menu?.minis||[]),  ...(state.menu?.burgers||[])
  ];
  const item = all.find(x=>x.id===id); if(!item) return;

  if (item.type==='drink' || item.type==='side'){
    // (HH podría aplicar a bebidas si hhEligible=true; aquí no hay extras ni DLC)
    const hhDiscPerUnit = hhDiscountPerUnit(item);
    const unitBaseAfterHH = Math.max(0, Number(item.price||0) - hhDiscPerUnit);

    state.cart.push({
      id:item.id, name:item.name, mini:false, qty:1,
      unitPrice:Number(item.price||0),
      baseIngredients:[], salsaDefault:null, salsaCambiada:null,
      extras:{ sauces:[], ingredients:[], dlcCarne:false, surpriseSauce:null },
      notes:'',
      lineTotal: unitBaseAfterHH,      // ya con HH
      hhDisc: hhDiscPerUnit            // descuento por 1 unidad
    });
    updateCartBar(); beep(); toast(`${item.name} agregado`);
  } else {
    openItemModal(item, item.baseOf ? state.menu?.burgers?.find(b=>b.id===item.baseOf) : item);
  }
}, false);