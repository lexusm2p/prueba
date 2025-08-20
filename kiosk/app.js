import { db, collection, addDoc, serverTimestamp } from '../lib/firebase.js';
import { toast } from '../lib/toast.js';

const menuEl=document.getElementById('menu'); const modal=document.getElementById('modal');
const mTitle=document.getElementById('m-title'); const fName=document.getElementById('f-name');
const fQty=document.getElementById('f-qty'); const fSug=document.getElementById('f-suggest');
const fAde=document.getElementById('f-aderezos'); const fExt=document.getElementById('f-extras');
const fTot=document.getElementById('f-total'); document.getElementById('m-close').onclick=()=>modal.classList.remove('open');
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
const all=[{title:'Minis & Combos',items:minis},{title:'Hamburguesas Grandes',items:grandes}];
let currentProduct=null;

function card(p){ const el=document.createElement('div'); el.className='card';
  el.innerHTML=`<div class="row"><h3>${p.name}</h3><div class="right price">$${p.price}</div></div>
  <div class="sub">Salsa sugerida: <b>${p.suggest}</b></div>
  <div class="row" style="margin-top:10px"><button class="btn">Ordenar</button></div>`;
  el.querySelector('.btn').onclick=()=> openModal(p); return el;
}
function renderMenu(){ menuEl.innerHTML=''; all.forEach(sec=>{ const wrap=document.createElement('div'); wrap.className='card';
  wrap.innerHTML=`<h2>${sec.title}</h2><div class="grid"></div>`; sec.items.forEach(p=>wrap.querySelector('.grid').appendChild(card(p)));
  menuEl.appendChild(wrap);});
}
function buildList(list, price){ const wrap=document.createElement('div');
  list.forEach(label=>{ const row=document.createElement('label'); row.className='item-row';
    row.innerHTML=`<input type="checkbox" data-label="${label}" data-price="${price}"><span>${label}</span><span class="sub">+$${price}</span>`;
    wrap.appendChild(row); }); return wrap;
}
function roundTo7(n){ if(!ROUND_TO_7_END) return Math.round(n);
  const r=Math.round(n), u=r%10; if(u===7) return r; const down=r-((u-7+10)%10), up=r+((7-u+10)%10);
  return (Math.abs(up-n)<Math.abs(n-down))?up:down;
}
function recalc(){ const qty=+fQty.value||1; let total=currentProduct.price*qty;
  const a=[...fAde.querySelectorAll('input:checked')].length; const x=[...fExt.querySelectorAll('input:checked')].length;
  total += a*EXTRA_ADE_PRICE + x*EXTRA_ING_PRICE; let unlocked=false;
  if(currentProduct.name.toLowerCase().includes('mini')&&qty>=3){ total=total*(1-COMBO3_DISCOUNT); unlocked=true; }
  const shown= unlocked? roundTo7(total) : Math.round(total); fTot.textContent=`$${shown}`; return {total:shown,unlocked}; }
function openModal(p){ currentProduct=p; mTitle.textContent=p.name; fName.value=''; fQty.value=1; fSug.textContent=p.suggest;
  fAde.innerHTML=''; fExt.innerHTML=''; fAde.appendChild(buildList(aderezos,5)); fExt.appendChild(buildList(extras,5));
  modal.classList.add('open'); recalc(); modal.querySelectorAll('input[type="checkbox"], #f-qty').forEach(x=>x.oninput=recalc); }
async function createOrder(payload){ await addDoc(collection(db,'orders'),{...payload,status:'PENDING',createdAt:serverTimestamp()}); }
document.getElementById('orderForm').onsubmit=async e=>{ e.preventDefault();
  const qty=+fQty.value||1; const a=[...fAde.querySelectorAll('input:checked')].map(i=>i.dataset.label);
  const x=[...fExt.querySelectorAll('input:checked')].map(i=>i.dataset.label); const calc=recalc();
  await createOrder({ source:'kiosk', customer:fName.value.trim()||'Cliente', product:currentProduct.name, qty,
    aderezos:a, extras:x, suggested:currentProduct.suggest, total:calc.total });
  modal.classList.remove('open'); toast(calc.unlocked? '⭐ ¡Desbloqueaste un logro! Combo minis' : '¡Pedido creado!'); };
renderMenu();
