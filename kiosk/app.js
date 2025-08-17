
import { createOrder } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';
import { BURGERS, MINIS, EXTRAS_ING, EXTRAS_SAUCES } from '../shared/menu-data.js';

const elList = document.getElementById('list');
const tabMinis = document.getElementById('tab-minis');
const tabGrandes = document.getElementById('tab-grandes');
const fab = document.getElementById('fabCart');
const fabCount = document.getElementById('fabCount');
const fabTotal = document.getElementById('fabTotal');
const fabOpen = document.getElementById('fabOpen');

const modal = document.getElementById('modal');
const mBody = document.getElementById('mBody');
const mTitle = document.getElementById('mTitle');
const mTotal = document.getElementById('mTotal');
const mConfirm = document.getElementById('mConfirm');
const mClose = document.getElementById('mClose');

const modalCart = document.getElementById('modalCart');
const cBody = document.getElementById('cBody');
const cTotal = document.getElementById('cTotal');
const cConfirm = document.getElementById('cConfirm');
const cClose = document.getElementById('cClose');

const state = {
  mode:'minis',
  cart:[]
};

function money(n){ return '$'+Number(n||0).toFixed(0); }

function ingredientsOf(b){
  return b.ingredients?.join(', ') || '';
}
function card(item, isMini=false){
  return `<div class="card">
    <h3>${item.name}</h3>
    <div class="small muted">${isMini ? ingredientsOf(BURGERS.find(x=>x.id===item.base)) : ingredientsOf(item)}</div>
    <div class="row" style="margin-top:8px">
      <div class="price">${money(item.price)}</div>
      <button class="btn small" data-open="${item.id}">${isMini?'Elegir mini':'Elegir'}</button>
    </div>
  </div>`;
}

function renderCards(){
  const arr = state.mode==='minis' ? MINIS : BURGERS;
  elList.innerHTML = arr.map(x=>card(x, state.mode==='minis')).join('');
  document.querySelectorAll('button[data-open]').forEach(btn=>{
    btn.onclick = ()=> openProduct(btn.dataset.open);
  });
  // FAB cart
  const total = state.cart.reduce((a,it)=>a+it.lineTotal,0);
  fabCount.textContent = state.cart.length;
  fabTotal.textContent = money(total);
  fab.style.display = state.cart.length ? 'flex':'none';
}

tabMinis.onclick = ()=>{ tabMinis.classList.add('active'); tabGrandes.classList.remove('active'); state.mode='minis'; renderCards(); };
tabGrandes.onclick = ()=>{ tabGrandes.classList.add('active'); tabMinis.classList.remove('active'); state.mode='grandes'; renderCards(); };

function openProduct(id){
  const isMini = id.endsWith('_m');
  let item, base;
  if(isMini){
    item = MINIS.find(x=>x.id===id);
    base = BURGERS.find(x=>x.id===item.base);
  }else{
    item = BURGERS.find(x=>x.id===id);
    base = item;
  }
  mTitle.textContent = item.name;
  const extrasIng = EXTRAS_ING.map(e=>`<label class="small"><input type="checkbox" data-extra="${e.key}" data-price="${e.price}"> ${e.key} (+${money(e.price)})</label>`).join('<br>');
  const extrasSau = EXTRAS_SAUCES.map(s=>`<label class="small"><input type="checkbox" data-sauce="${s}"> ${s}</label>`).join('<br>');

  mBody.innerHTML = `
    <div class="muted small">Ingredientes: ${ingredientsOf(base)}</div>
    <div class="field"><label>Cantidad</label>
      <input type="number" id="mQty" min="1" value="1">
    </div>
    <div class="field">
      <label>Extras</label>
      <div class="grid" style="grid-template-columns:repeat(2,1fr)">${extrasIng}</div>
    </div>
    <div class="field">
      <label>Aderezos extra (+$5 c/u)</label>
      <div class="grid" style="grid-template-columns:repeat(2,1fr)">${extrasSau}</div>
    </div>
    <div class="field">
      <label><input type="checkbox" id="mSurprise"> ¿Quieres que te sorprendamos con una nueva configuración (aderezo)?</label>
    </div>
    <div class="field"><label>Notas para cocina</label><textarea id="mNotes" placeholder="sin jitomate, bien cocida, etc."></textarea></div>
  `;

  const basePrice = item.price;
  const qtyEl = document.getElementById('mQty');
  function calc(){
    const qty = Number(qtyEl.value||1);
    let extras = 0;
    mBody.querySelectorAll('input[data-price]:checked').forEach(c=> extras += Number(c.dataset.price));
    let saucesCount = 0;
    mBody.querySelectorAll('input[data-sauce]:checked').forEach(()=> saucesCount++);
    extras += saucesCount * 5;
    const subtotal = (basePrice + extras) * qty;
    mTotal.textContent = money(subtotal);
    return { qty, extras, subtotal };
  }
  mBody.oninput = calc; calc();

  mConfirm.onclick = ()=>{
    const { qty, subtotal } = calc();
    const extras = {
      ingredients: Array.from(mBody.querySelectorAll('input[data-extra]:checked')).map(x=>x.dataset.extra),
      sauces: Array.from(mBody.querySelectorAll('input[data-sauce]:checked')).map(x=>x.dataset.sauce),
      surprise: document.getElementById('mSurprise').checked
    };
    const notes = document.getElementById('mNotes').value.trim();
    const baseIngredients = base.ingredients || [];
    state.cart.push({
      item: { id:item.id, name:item.name, price:item.price, mini:isMini },
      qty, lineTotal: subtotal, baseIngredients, extras, notes
    });
    beep();
    if(isMini && qty>=3){ toast('¡Logro desbloqueado! 3 minis ⭐','⭐'); }
    toast('Añadido al carrito');
    modal.classList.remove('open');
    renderCards();
  };

  mClose.onclick = ()=> modal.classList.remove('open');
  modal.classList.add('open');
}

function openCart(){
  const total = state.cart.reduce((a,it)=>a+it.lineTotal,0);
  const rows = state.cart.map((it,i)=>`
    <tr>
      <td>${it.item.name}${it.item.mini?' (mini)':''}</td>
      <td>x${it.qty}</td>
      <td>${money(it.lineTotal)}</td>
      <td><button class="btn ghost small" data-rm="${i}">Quitar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">Tu carrito está vacío</td></tr>';
  cBody.innerHTML = `
    <div class="field"><label>Nombre del cliente (obligatorio)</label><input type="text" id="cName" placeholder="Tu nombre"></div>
    <div class="field"><label>Mensaje general para cocina (opcional)</label><textarea id="cNotes"></textarea></div>
    <table class="table" style="width:100%">
      <thead><tr><th>Producto</th><th>Cant.</th><th>Importe</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  cTotal.textContent = money(total);
  cBody.querySelectorAll('button[data-rm]').forEach(b=>{
    b.onclick=()=>{ state.cart.splice(Number(b.dataset.rm),1); modalCart.classList.remove('open'); openCart(); renderCards(); };
  });
  cConfirm.onclick = async ()=>{
    if(!state.cart.length){ toast('Tu carrito está vacío'); return; }
    const name = document.getElementById('cName').value.trim();
    if(!name){ toast('Escribe tu nombre'); return; }
    const noteAll = (document.getElementById('cNotes').value||'').trim();
    const orderTotal = state.cart.reduce((a,it)=>a+it.lineTotal,0);
    const order = {
      customer: name,
      items: state.cart.map(it=>({ item:it.item, qty:it.qty, lineTotal:it.lineTotal, baseIngredients:it.baseIngredients, extras:it.extras, notes:it.notes })),
      orderTotal,
      notes: noteAll
    };
    await createOrder(order);
    state.cart = [];
    modalCart.classList.remove('open');
    beep(); toast(`Gracias por tu pedido, ${name}. Te avisamos cuando esté listo ✨`);
    renderCards();
  };
  cClose.onclick = ()=> modalCart.classList.remove('open');
  modalCart.classList.add('open');
}

fabOpen.onclick = openCart;

renderCards();
