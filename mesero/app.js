import { db, collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp } from '../lib/firebase.js';
import { toast } from '../lib/toast.js';

const nameEl=document.getElementById('w-name'); const tableEl=document.getElementById('w-table');
document.getElementById('save-id').onclick=()=>{ localStorage.setItem('w-name', nameEl.value.trim()); localStorage.setItem('w-table', tableEl.value); toast('Guardado'); };
nameEl.value=localStorage.getItem('w-name')||''; tableEl.value=localStorage.getItem('w-table')||'1';

const aderezos=['Aderezo Cheddar','Aderezo Chipotle','Aderezo Habanero','Salsa Chimichurri','Mostaza dulce','Jalapeño rostizado','Curry suave','Salsa Secreta Seven'];
const extras=['Tocino','Piña','Jamón','Salchicha','Cebolla caramelizada','Queso blanco','Queso amarillo'];
const productos=[
  {name:'Starter Burger', price:47, suggest:'Mostaza dulce'},
  {name:'Koopa Crunch', price:57, suggest:'Cheddar'},
  {name:'Fatality Flame', price:67, suggest:'Habanero'},
  {name:'Mega Byte', price:77, suggest:'Cheddar'},
  {name:'Hadouken', price:77, suggest:'Chipotle'},
  {name:'Nintendo Nostalgia', price:67, suggest:'Cheddar'},
  {name:'Final Boss Burger', price:97, suggest:'Cheddar'},
  {name:'Starter Mini', price:27, suggest:'Mostaza dulce'},
  {name:'Koopa Mini', price:27, suggest:'Cheddar'},
  {name:'Fatality Mini', price:37, suggest:'Habanero'},
  {name:'Mega Byte Mini', price:37, suggest:'Cheddar'},
  {name:'Hadouken Mini', price:37, suggest:'Chipotle'},
  {name:'Nintendo Mini', price:37, suggest:'Cheddar'},
  {name:'Final Boss Mini', price:47, suggest:'Cheddar'}
];
const grid=document.getElementById('m-menu');
productos.forEach(p=>{ const el=document.createElement('div'); el.className='card';
  el.innerHTML=`<div class="row"><h3>${p.name}</h3><div class="right price">$${p.price}</div></div><div class="sub">Sugerida: <b>${p.suggest}</b></div>
  <div class="row" style="margin-top:10px"><button class="btn">Agregar</button></div>`;
  el.querySelector('.btn').onclick=()=>openModal(p); grid.appendChild(el);
});
const modal=document.getElementById('modal'); const mTitle=document.getElementById('m-title');
const mQty=document.getElementById('m-qty'); const mSug=document.getElementById('m-suggest'); const mNotes=document.getElementById('m-notes');
const mAde=document.getElementById('m-aderezos'); const mExt=document.getElementById('m-extras'); const mTot=document.getElementById('m-total');
document.getElementById('m-close').onclick=()=>modal.classList.remove('open');
document.getElementById('m-form').onsubmit=async e=>{
  e.preventDefault();
  const server=(nameEl.value||'Mesero').trim(); const table=tableEl.value||'1';
  const qty=+mQty.value||1; const a=[...mAde.querySelectorAll('input:checked')].map(i=>i.dataset.label);
  const x=[...mExt.querySelectorAll('input:checked')].map(i=>i.dataset.label);
  const total = Math.round(current.price*qty + 5*a.length + 5*x.length);
  await addDoc(collection(db,'orders'),{ source:'mesero', server, table, product:current.name, qty,
    aderezos:a, extras:x, suggested:current.suggest, notes:mNotes.value.trim(), total, status:'PENDING', createdAt:serverTimestamp() });
  modal.classList.remove('open'); toast('Enviado a cocina');
};
let current=null;
function buildList(list, price){ const wrap=document.createElement('div');
  list.forEach(label=>{ const row=document.createElement('label'); row.className='item-row';
    row.innerHTML=`<input type="checkbox" data-label="${label}" data-price="${price}"><span>${label}</span><span class="sub">+$${price}</span>`;
    wrap.appendChild(row); }); return wrap; }
function recalc(){ mTot.textContent=`$${Math.round(current.price*(+mQty.value||1) + 5*mAde.querySelectorAll('input:checked').length + 5*mExt.querySelectorAll('input:checked').length)}`; }
function openModal(p){ current=p; mTitle.textContent=p.name; mQty.value=1; mSug.textContent=p.suggest; mNotes.value='';
  mAde.innerHTML=''; mExt.innerHTML=''; mAde.appendChild(buildList(aderezos,5)); mExt.appendChild(buildList(extras,5));
  modal.classList.add('open'); recalc(); modal.querySelectorAll('input[type="checkbox"], #m-qty').forEach(x=>x.oninput=recalc); }

// Mis pedidos (solo del mesero/mesa actual)
const ordersEl=document.getElementById('m-orders');
function renderOrders(rows){ ordersEl.innerHTML='';
  if(!rows.length){ ordersEl.innerHTML='<div class="empty">Sin pedidos activos</div>'; return; }
  rows.forEach(([id,o])=>{ const el=document.createElement('div'); el.className='card';
    el.innerHTML=`<div class="row"><h3>${o.product} x${o.qty}</h3><div class="right sub">${o.status}</div></div>
    <div class="sub">Mesa ${o.table||'-'} · ${o.server||''}</div>
    ${o.notes? `<div class="sub">Notas: ${o.notes}</div>`:''}
    ${o.aderezos?.length? `<div class="sub">Aderezos: ${o.aderezos.join(', ')}</div>`:''}
    ${o.extras?.length? `<div class="sub">Extras: ${o.extras.join(', ')}</div>`:''}
    <div class="row"><div class="right price">$${o.total||0}</div></div>`; ordersEl.appendChild(el); });
}
function subscribeMine(){ const server=(nameEl.value||'Mesero').trim(); const table=tableEl.value||'1';
  const q=query(collection(db,'orders'), where('server','==',server), where('table','==',table), where('status','!=','ARCHIVED'), orderBy('status'), orderBy('createdAt'));
  return onSnapshot(q,(snap)=>{ const arr=[]; snap.forEach(d=>arr.push([d.id,d.data()])); renderOrders(arr); });
}
let unsub=subscribeMine();
['input','change'].forEach(ev=>{ nameEl.addEventListener(ev, ()=>{unsub&&unsub(); unsub=subscribeMine();});
  tableEl.addEventListener(ev, ()=>{unsub&&unsub(); unsub=subscribeMine();}); });
