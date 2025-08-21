// /kiosk/app.js
// Kiosko con carrito: varios productos por pedido, DLC minis, cambio de salsa sin costo,
// extras, login oculto por PIN, tabs Minis/Grandes, toasts y beep.

import { beep, toast } from '../shared/notify.js';
import { createOrder, fetchCatalogWithFallback } from '../shared/db.js';

const state = {
  menu: null,
  mode: 'mini',
  cart: [],            // líneas de carrito
  customerName: ''     // se recuerda entre productos
};

/* ─────────────────────────────────────────────
   1) Login oculto (7 taps en 2s) → PIN → ruta
   ────────────────────────────────────────────*/
const brand = document.getElementById('brandTap');
let tapCount = 0, tapTimer = null;

brand.addEventListener('click', ()=>{
  if (tapTimer) clearTimeout(tapTimer);
  tapCount++;
  tapTimer = setTimeout(()=> tapCount=0, 2000);
  if (tapCount >= 7) { tapCount = 0; openPinModal(); }
});

function openPinModal(){
  const pinModal = document.getElementById('pinModal');
  const pinInput = document.getElementById('pinInput');
  const pinGo    = document.getElementById('pinGo');
  const pinClose = document.getElementById('pinClose');
  const map = {'1111':'../mesero/index.html','2222':'../cocina/index.html','9999':'../admin/index.html'};

  const show = ()=>{ pinModal.style.display='grid'; setTimeout(()=>pinInput?.focus(),0); };
  const hide = ()=>{ pinModal.style.display='none'; pinInput.value=''; };
  const enter = ()=>{
    const pin = (pinInput.value||'').trim();
    const route = map[pin];
    if(!route){ toast('PIN incorrecto'); return; }
    hide(); location.href = route;
  };

  show();
  pinGo.onclick = enter;
  pinClose.onclick = hide;
  pinInput.onkeydown = e=>{ if(e.key==='Enter') enter(); };
}

/* ─────────────────────────────────────────────
   2) Tabs Minis / Grandes
   ────────────────────────────────────────────*/
document.getElementById('btnMinis').onclick = ()=> setMode('mini');
document.getElementById('btnBig').onclick  = ()=> setMode('big');

function setMode(mode){
  state.mode = mode;
  renderCards();
  setActiveTab(mode);
}
function setActiveTab(mode=state.mode){
  const btnMinis = document.getElementById('btnMinis');
  const btnBig   = document.getElementById('btnBig');
  const on  = el => { el.classList.add('is-active'); el.setAttribute('aria-selected','true'); };
  const off = el => { el.classList.remove('is-active'); el.setAttribute('aria-selected','false'); };
  if(mode==='mini'){ on(btnMinis); off(btnBig); } else { on(btnBig); off(btnMinis); }
}

/* ─────────────────────────────────────────────
   3) Init y helpers
   ────────────────────────────────────────────*/
init();
async function init(){
  state.menu = await fetchCatalogWithFallback();
  renderCards();
  setActiveTab('mini');
  updateCartBar();
}
const money = n => '$'+n.toFixed(0);

/* ─────────────────────────────────────────────
   4) Tarjetas de productos
   ────────────────────────────────────────────*/
function renderCards(){
  const grid = document.getElementById('cards'); grid.innerHTML='';
  const items = state.mode==='mini' ? state.menu.minis : state.menu.burgers;

  items.forEach(it=>{
    const base = it.baseOf ? state.menu.burgers.find(b=>b.id===it.baseOf) : it;

    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `
      <h3>${it.name}</h3>
      <div class="row">
        <div class="price">${money(it.price)}</div>
        <div class="row" style="gap:8px">
          <button class="btn ghost small" data-a="ing">Ingredientes</button>
          <button class="btn small" data-a="order">Ordenar</button>
        </div>
      </div>
    `;
    grid.appendChild(card);

    // Ingredientes como ficha rápida
    card.querySelector('[data-a="ing"]').onclick = ()=>{
      alert(`${base.name||it.name}\n\nIngredientes:\n- ${(base.ingredients||[]).join('\n- ')}`);
    };
    // Abrir modal de item
    card.querySelector('[data-a="order"]').onclick = ()=> openItemModal(it, base);
  });
}

/* ─────────────────────────────────────────────
   5) Modal Item: agrega al carrito (NO envía aún)
   ────────────────────────────────────────────*/
function openItemModal(item, base){
  const modal = document.getElementById('modal'); modal.classList.add('open');
  const body  = document.getElementById('mBody');
  document.getElementById('mTitle').textContent = item.name + ' · ' + money(item.price);
  document.getElementById('mClose').onclick = ()=> modal.classList.remove('open');

  const sauces = state.menu.extras.sauces;
  const ingr   = state.menu.extras.ingredients;
  const SP     = state.menu.extras.saucePrice;
  const IP     = state.menu.extras.ingredientPrice;
  const DLC    = state.menu.extras.dlcCarneMini ?? 12;

  body.innerHTML = `
    <div class="field">
      <label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required value="${state.customerName||''}"/>
    </div>

    ${item.mini ? `
    <div class="field">
      <label>DLC de Carne grande</label>
      <div class="ul-clean">
        <input type="checkbox" id="dlcCarne"/>
        <label for="dlcCarne">Cambia a carne 85g</label>
        <span class="tag">(+${money(DLC)})</span>
      </div>
    </div>` : ''}

    <div class="hr"></div>

    <div class="field">
      <label>Potenciar sabor con un aderezo recomendado (cambio sin costo)</label>
      <select id="swapSauce">
        <option value="">Dejar salsa por defecto</option>
        ${((base.salsasSugeridas || [base.suggested]).filter(Boolean) || [])
          .map(s=>`<option value="${s}">${s}</option>`).join('')}
      </select>
      <div class="muted small">* Cambio de salsa recomendado sin costo. Extras se cobran aparte.</div>
    </div>

    <div class="field">
      <label>Aderezos extra</label>
      <div class="ul-clean" id="sauces">
        ${sauces.map((s,i)=>`
          <input type="checkbox" id="s${i}"/>
          <label for="s${i}">${s}</label>
          <span class="tag">(+${money(SP)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label>Ingredientes extra</label>
      <div class="ul-clean" id="ingrs">
        ${ingr.map((s,i)=>`
          <input type="checkbox" id="e${i}"/>
          <label for="e${i}">${s}</label>
          <span class="tag">(+${money(IP)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="1"/>
    </div>

    <div class="field">
      <label>Comentarios a cocina</label>
      <textarea id="notes" placeholder="sin jitomate, poco picante…"></textarea>
    </div>
  `;

  const totalEl = document.getElementById('mTotal');
  const qtyEl   = document.getElementById('qty');
  const inputs  = body.querySelectorAll('input[type=checkbox], #qty, #swapSauce');

  const calc = ()=>{
    const qty     = parseInt(qtyEl.value||'1',10);
    const extrasS = [...body.querySelectorAll('#sauces input:checked')].length;
    const extrasI = [...body.querySelectorAll('#ingrs input:checked')].length;
    const dlcOn   = item.mini && body.querySelector('#dlcCarne')?.checked;
    const extraDlc = dlcOn ? DLC : 0;
    const subtotal = (item.price + extraDlc)*qty + (extrasS*SP + extrasI*IP)*qty;
    totalEl.textContent = money(subtotal);
    return { qty, subtotal, dlcOn };
  };
  inputs.forEach(i=> i.addEventListener('change', calc));
  calc();

  // Botón correcto (mAdd) — agrega al carrito y cierra
  document.getElementById('mAdd').onclick = ()=>{
    const name = document.getElementById('cName').value.trim();
    if(!name){ alert('Por favor escribe tu nombre.'); return; }
    state.customerName = name;

    const { qty, subtotal, dlcOn } = calc();
    const saucesSel = [...body.querySelectorAll('#sauces input')].map((el,i)=> el.checked? sauces[i]: null).filter(Boolean);
    const ingrSel   = [...body.querySelectorAll('#ingrs input')].map((el,i)=> el.checked? ingr[i]: null).filter(Boolean);
    const salsaSwap = document.getElementById('swapSauce').value || null;
    const notes     = document.getElementById('notes').value.trim();

    const line = {
      id: item.id,
      name: item.name,
      mini: !!item.mini,
      qty,
      unitPrice: item.price,
      baseIngredients: base.ingredients||[],
      salsaDefault: base.salsaDefault || base.suggested || null,
      salsaCambiada: salsaSwap,
      extras: { sauces: saucesSel, ingredients: ingrSel, dlcCarne: dlcOn },
      notes,
      lineTotal: subtotal
    };

    state.cart.push(line);
    document.getElementById('modal').classList.remove('open');
    updateCartBar();
    beep();
    toast('Agregado al pedido');
  };
}

/* ─────────────────────────────────────────────
   6) Carrito: barra, modal, confirmación
   ────────────────────────────────────────────*/
const cartBar = document.getElementById('cartBar');
document.getElementById('openCart').onclick = openCartModal;

function updateCartBar(){
  const count = state.cart.reduce((a,l)=>a + (l.qty||1), 0);
  const total = state.cart.reduce((a,l)=>a + (l.lineTotal||0), 0);
  document.getElementById('cartCount').textContent = `${count} producto${count!==1?'s':''}`;
  document.getElementById('cartBarTotal').textContent = money(total);
  cartBar.style.display = count>0 ? 'flex' : 'none';
}

function openCartModal(){
  const m = document.getElementById('cartModal');
  const body = document.getElementById('cartBody');
  const close = ()=> m.style.display='none';
  document.getElementById('cartClose').onclick = close;
  m.style.display='grid';

  if(state.cart.length===0){
    body.innerHTML = '<div class="muted">Tu carrito está vacío.</div>';
    document.getElementById('cartTotal').textContent = '$0';
    return;
  }

  // Render líneas
  body.innerHTML = `
    <div class="field">
      <label>Nombre del cliente</label>
      <input id="cartName" type="text" required value="${state.customerName||''}" />
    </div>

    <div class="field">
      ${state.cart.map((l,idx)=>`
        <div class="k-card" style="margin:8px 0" data-i="${idx}">
          <h4>${l.name} · x${l.qty}</h4>
          ${l.salsaCambiada ? `<div class="muted small">Cambio de salsa: ${l.salsaCambiada}</div>`:''}
          ${l.extras?.dlcCarne ? `<div class="muted small">DLC carne 85g</div>`:''}
          ${(l.extras?.sauces?.length||0)>0 ? `<div class="muted small">Aderezos extra: ${l.extras.sauces.join(', ')}</div>`:''}
          ${(l.extras?.ingredients?.length||0)>0 ? `<div class="muted small">Extras: ${l.extras.ingredients.join(', ')}</div>`:''}
          ${l.notes ? `<div class="muted small">Notas: ${escapeHtml(l.notes)}</div>`:''}
          <div class="k-actions">
            <button class="btn small ghost" data-a="less">-</button>
            <button class="btn small ghost" data-a="more">+</button>
            <button class="btn small danger" data-a="remove">Eliminar</button>
            <div style="margin-left:auto" class="price">${money(l.lineTotal)}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="field">
      <label>Comentarios generales</label>
      <textarea id="cartNotes" placeholder="comentarios para todo el pedido"></textarea>
    </div>
  `;

  // Totales
  refreshCartTotals();

  // Handlers líneas (se re-enlazan en cada re-render)
  body.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-a]'); if(!btn) return;
    const card = btn.closest('[data-i]'); const i = parseInt(card.dataset.i,10);
    const line = state.cart[i]; if(!line) return;

    if(btn.dataset.a==='remove'){ state.cart.splice(i,1); }
    if(btn.dataset.a==='more'){ line.qty = Math.min(99, (line.qty||1)+1); recomputeLine(line); }
    if(btn.dataset.a==='less'){ line.qty = Math.max(1, (line.qty||1)-1); recomputeLine(line); }

    // Re-render rápido
    openCartModal();
    updateCartBar();
  }, { once:true });

  // Confirmar
  document.getElementById('cartConfirm').onclick = async ()=>{
    const name = (document.getElementById('cartName').value||'').trim();
    if(!name){ alert('Escribe tu nombre'); return; }
    state.customerName = name;

    const generalNotes = (document.getElementById('cartNotes').value||'').trim();
    const subtotal = state.cart.reduce((a,l)=> a + (l.lineTotal||0), 0);

    const order = {
      customer: state.customerName,
      items: state.cart.map(l=>({
        id:l.id, name:l.name, mini:l.mini, qty:l.qty, unitPrice:l.unitPrice,
        baseIngredients:l.baseIngredients, salsaDefault:l.salsaDefault,
        salsaCambiada:l.salsaCambiada, extras:l.extras, notes:l.notes||null,
        lineTotal:l.lineTotal
      })),
      subtotal,
      notes: generalNotes
    };

    await createOrder(order);
    beep();
    toast('¡Pedido enviado! ✨');
    state.cart = [];
    updateCartBar();
    close();
  };
}

function recomputeLine(line){
  const DLC = (state.menu?.extras?.dlcCarneMini ?? 12);
  const SP  = state.menu?.extras?.saucePrice ?? 8;
  const IP  = state.menu?.extras?.ingredientPrice ?? 10;

  const extrasS = line.extras?.sauces?.length || 0;
  const extrasI = line.extras?.ingredients?.length || 0;
  const dlcOn   = !!(line.extras?.dlcCarne);

  const extraDlc = dlcOn ? DLC : 0;
  const unitTotal = (line.unitPrice + extraDlc) + (extrasS*SP + extrasI*IP);
  line.lineTotal = unitTotal * (line.qty||1);
}

function refreshCartTotals(){
  const total = state.cart.reduce((a,l)=>a + (l.lineTotal||0), 0);
  document.getElementById('cartTotal').textContent = money(total);
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }
