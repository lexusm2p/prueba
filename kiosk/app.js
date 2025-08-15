import { db, collection, addDoc, serverTimestamp } from '../lib/firebase.js';
import { toast } from '../lib/toast.js';
import { RECIPES } from '../lib/recipes.js';

const menuEl = document.getElementById('menu');
const modal  = document.getElementById('modal');
const mClose = document.getElementById('m-close');

const fName = document.getElementById('k-name');
const fQty  = document.getElementById('f-qty');
const fSug  = document.getElementById('f-suggest');
const fAde  = document.getElementById('f-aderezos');
const fExt  = document.getElementById('f-extras');
const fTot  = document.getElementById('f-total');
const fNotes= document.getElementById('f-notes');

const EXTRA_ADE_PRICE=5, EXTRA_ING_PRICE=5, COMBO3_DISCOUNT=.07, ROUND_TO_7_END=true;

const aderezos=['Aderezo Cheddar','Aderezo Chipotle','Aderezo Habanero','Salsa Chimichurri','Mostaza dulce','Jalapeño rostizado','Curry suave','Salsa Secreta Seven'];
const extras=['Tocino','Piña','Jamón','Salchicha','Cebolla caramelizada','Queso blanco','Queso amarillo'];

const minis=[
  {name:'Starter Mini', price:27, suggest:'Mostaza dulce'},
  {name:'Koopa Mini', price:27, suggest:'Cheddar'},
  {name:'Fatality Mini', price:37, suggest:'Habanero'},
  {name:'Mega Byte Mini', price:37, suggest:'Cheddar'},
  {name:'Hadouken Mini', price:37, suggest:'Chipotle'},
  {name:'Nintendo Mini', price:37, suggest:'Cheddar'},
  {name:'Final Boss Mini', price:47, suggest:'Cheddar'}
];
const grandes=[
  {name:'Starter Burger', price:47, suggest:'Mostaza dulce'},
  {name:'Koopa Crunch', price:57, suggest:'Cheddar'},
  {name:'Fatality Flame', price:67, suggest:'Habanero'},
  {name:'Mega Byte', price:77, suggest:'Cheddar'},
  {name:'Hadouken', price:77, suggest:'Chipotle'},
  {name:'Nintendo Nostalgia', price:67, suggest:'Cheddar'},
  {name:'Final Boss Burger', price:97, suggest:'Cheddar'}
];
const sections=[{title:'Minis & Combos',items:minis},{title:'Hamburguesas Grandes',items:grandes}];

let CURRENT=null;
let CART=[];

function roundTo7(n){ if(!ROUND_TO_7_END) return Math.round(n);
  const r=Math.round(n), u=r%10;
  if(u===7) return r;
  const down=r-((u-7+10)%10), up=r+((7-u+10)%10);
  return (Math.abs(up-n)<Math.abs(n-down))?up:down;
}

function card(p){
  const el=document.createElement('div'); el.className='card';
  const base = RECIPES[p.name] || [];
  el.innerHTML=`
    <div class="row">
      <h3>${p.name}</h3>
      <div class="right price">$${p.price}</div>
    </div>
    <div class="sub">Salsa sugerida: <b>${p.suggest}</b></div>
    <details class="recipe" style="margin-top:8px">
      <summary>¿Qué lleva?</summary>
      <ul class="list">
        ${base.map(i=>`<li>${i}</li>`).join('')}
      </ul>
    </details>
    <div class="row" style="margin-top:10px"><button class="btn">Agregar</button></div>
  `;
  el.querySelector('.btn').onclick=()=> openModal(p);
  return el;
}
function renderMenu(){
  menuEl.innerHTML='';
  sections.forEach(sec=>{
    const wrap=document.createElement('div'); wrap.className='card';
    wrap.innerHTML=`<h2>${sec.title}</h2><div class="grid"></div>`;
    sec.items.forEach(p=> wrap.querySelector('.grid').appendChild(card(p)));
    menuEl.appendChild(wrap);
  });
}
function buildList(list, price){
  const wrap=document.createElement('div');
  list.forEach(label=>{
    const row=document.createElement('label'); row.className='item-row';
    row.innerHTML=`<input type="checkbox" data-label="${label}" data-price="${price}">
                   <span>${label}</span><span class="sub">+$${price}</span>`;
    wrap.appendChild(row);
  }); return wrap;
}
function recalcPieceTotal(p){
  const qty=+fQty.value||1;
  const a=[...fAde.querySelectorAll('input:checked')].length;
  const x=[...fExt.querySelectorAll('input:checked')].length;
  const sub = p.price*qty + a*EXTRA_ADE_PRICE + x*EXTRA_ING_PRICE;
  fTot.textContent = `$${Math.round(sub)}`;
  return Math.round(sub);
}
function openModal(p){
  CURRENT=p; fQty.value=1; fSug.textContent=p.suggest; fNotes.value='';
  fAde.innerHTML=''; fExt.innerHTML=''; fAde.appendChild(buildList(aderezos,5)); fExt.appendChild(buildList(extras,5));

  // Incluye (base)
  const base = RECIPES[p.name] || [];
  // Inserta bloque (si no existe ya)
  let baseBlock = document.getElementById('base-block');
  if(!baseBlock){
    baseBlock = document.createElement('div');
    baseBlock.id='base-block';
    baseBlock.className='group';
    baseBlock.style.marginTop='-2px';
    document.getElementById('orderForm').insertBefore(baseBlock, document.getElementById('orderForm').children[1]);
  }
  baseBlock.innerHTML = `<h3 style="margin:0 0 6px">Incluye (base)</h3>
    <ul class="list">${base.map(i=>`<li>${i}</li>`).join('')}</ul>`;

  modal.classList.add('open');
  recalcPieceTotal(p);
  modal.querySelectorAll('input[type="checkbox"], #f-qty').forEach(x=> x.oninput=()=>recalcPieceTotal(p));
}
mClose.onclick=()=> modal.classList.remove('open');

// ---- Carrito ----
const cartBar   = document.getElementById('cartBar');
const cartCount = document.getElementById('cartCount');
const cartTotal = document.getElementById('cartTotal');
const cartModal = document.getElementById('cartModal');
const cartClose = document.getElementById('cartClose');
const cartList  = document.getElementById('cartList');
const cartGrand = document.getElementById('cartGrand');
const openCart  = document.getElementById('openCart');
const cartClear = document.getElementById('cartClear');
const cartCheckout=document.getElementById('cartCheckout');

function isMini(name){ return name.toLowerCase().includes('mini'); }
function cartTotals(){
  let items=0, total=0, minisQty=0, minisSub=0;
  for(const it of CART){
    items += it.qty;
    const base = it.price*it.qty + it.aderezos.length*EXTRA_ADE_PRICE + it.extras.length*EXTRA_ING_PRICE;
    total += base;
    if(isMini(it.name)){ minisQty += it.qty; minisSub += base; }
  }
  let unlocked=false;
  if(minisQty>=3){
    const disc = minisSub*COMBO3_DISCOUNT;
    total -= disc; unlocked = true;
  }
  const shown = ROUND_TO_7_END ? roundTo7(total) : Math.round(total);
  return {items, total: shown, unlocked};
}
function refreshCartUI(){
  const t=cartTotals();
  if(CART.length===0){ cartBar.classList.add('hidden'); }
  else { cartBar.classList.remove('hidden'); }
  cartCount.textContent = `${t.items} ítems`;
  cartTotal.textContent = `$${t.total}`;
}
function renderCartModal(){
  cartList.innerHTML='';
  if(!CART.length){ cartList.innerHTML='<div class="empty">Tu carrito está vacío</div>'; cartGrand.textContent='$0'; return; }
  CART.forEach((it,idx)=>{
    const base = RECIPES[it.name] || [];
    const el=document.createElement('div'); el.className='card';
    el.innerHTML = `
      <div class="row">
        <h3>${it.name} ×${it.qty}</h3>
        <div class="right"><button class="btn small" data-i="${idx}">Quitar</button></div>
      </div>
      <div class="sub"><b>Base:</b> ${base.join(', ')}</div>
      <div class="sub">Sugerida: <b>${it.suggest}</b></div>
      ${it.aderezos.length? `<div class="sub">Aderezos: ${it.aderezos.join(', ')}</div>`:''}
      ${it.extras.length? `<div class="sub">Extras: ${it.extras.join(', ')}</div>`:''}
      ${it.notes? `<div class="sub">Notas: ${it.notes}</div>`:''}
    `;
    el.querySelector('button[data-i]').onclick=()=>{ CART.splice(idx,1); renderCartModal(); refreshCartUI(); };
    cartList.appendChild(el);
  });
  cartGrand.textContent = `$${cartTotals().total}`;
}
openCart.onclick = ()=>{ renderCartModal(); cartModal.classList.add('open'); };
cartClose.onclick= ()=> cartModal.classList.remove('open');
cartClear.onclick= ()=>{ CART=[]; renderCartModal(); refreshCartUI(); };

// Agregar pieza al carrito
document.getElementById('orderForm').onsubmit=(e)=>{
  e.preventDefault();
  const qty=+fQty.value||1;
  const a=[...fAde.querySelectorAll('input:checked')].map(i=>i.dataset.label);
  const x=[...fExt.querySelectorAll('input:checked')].map(i=>i.dataset.label);
  CART.push({
    name: CURRENT.name, price: CURRENT.price, suggest: CURRENT.suggest,
    qty, aderezos:a, extras:x, notes: fNotes.value.trim()
  });
  modal.classList.remove('open');
  refreshCartUI();
  const t=cartTotals();
  toast(t.unlocked ? '⭐ ¡Desbloqueaste un logro! Combo de minis' : 'Agregado al carrito');
};

// Confirmar ticket
async function checkout(){
  if(CART.length===0){ toast('Tu carrito está vacío'); return; }
  const name = fName.value.trim() || 'Cliente';
  const ticketId = `T${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const createdAt = serverTimestamp();

  for(const it of CART){
    await addDoc(collection(db,'orders'),{
      ticketId, source:'kiosk', customer:name,
      product:it.name, qty:it.qty, aderezos:it.aderezos, extras:it.extras, notes:it.notes,
      suggested:it.suggest,
      base: RECIPES[it.name] || [],              // <<<<<< agrega base al doc
      total: Math.round(it.price*it.qty + it.aderezos.length*5 + it.extras.length*5),
      status:'PENDING', createdAt
    });
  }
  CART=[]; refreshCartUI(); cartModal.classList.remove('open');
  toast('¡Pedido creado!');
}
cartCheckout.onclick = checkout;

// Init
renderMenu();
refreshCartUI();
