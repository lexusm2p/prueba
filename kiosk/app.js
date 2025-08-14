
import { BURGERS, MINIS, COMBOS, ADEREZOS, EXTRAS, priceOfAderezo } from '../data/menu.js';
import { createOrder } from '../shared/backend.js';
import { beep } from '../lib/notify.js';

const elCards = document.querySelector('#cards');
const modal = document.querySelector('#modal');
const stepDots = document.querySelector('#stepper');
const step1 = document.querySelector('.step-1');
const step2 = document.querySelector('.step-2');
const step3 = document.querySelector('.step-3');
const dlgTitle = document.querySelector('#dlg-title');
document.querySelector('#dlg-close').onclick = ()=> modal.classList.add('hidden');

const allItems = [
  ...BURGERS.map(b=>({...b, type:'burger'})),
  ...MINIS.map(m=>({...m, type:'mini'})),
  ...COMBOS.map(c=>({...c, type:'combo'}))
];

function card(item){
  return `<div class="card">
    <h3>${item.name}</h3>
    <small>${item.ingredients? 'Ingredientes: '+item.ingredients.join(', ') : (item.base?('Base: '+item.base): item.desc||'')}</small>
    <div><span class="badge">${item.type}</span></div>
    <div class="btns">
      <button class="btn" data-id="${item.id}">Ordenar</button>
      ${item.ingredients? `<button class="btn secondary" data-ing="${item.id}">Ingredientes</button>`:''}
    </div>
    <div class="price">$${item.price}</div>
  </div>`;
}

function render(){
  elCards.innerHTML = allItems.map(card).join('');
}
render();

let currentItem=null;
let orderDraft=null;

elCards.addEventListener('click', (e)=>{
  const id = e.target.dataset.id;
  const ing = e.target.dataset.ing;
  if (id){ openModal(id); }
  if (ing){
    const it = allItems.find(x=>x.id===ing);
    alert((it.ingredients || []).join(', ') || it.base || '');
  }
});

function setStep(n){
  stepDots.innerHTML = [1,2,3].map(i=>`<div class="dot ${i===n?'active':''}"></div>`).join('');
  step1.classList.toggle('hidden', n!==1);
  step2.classList.toggle('hidden', n!==2);
  step3.classList.toggle('hidden', n!==3);
}

function openModal(id){
  currentItem = allItems.find(i=>i.id===id);
  dlgTitle.textContent = `${currentItem.name} · $${currentItem.price}`;
  orderDraft = { itemId:id, itemName:currentItem.name, price:currentItem.price, qty:1, client:'', notes:'', aderezos:[], extras:[], surprise:false };
  buildStep1();
  modal.classList.remove('hidden');
  setStep(1);
}

function buildStep1(){
  step1.innerHTML = `
    <div class="section"><label>Nombre del cliente<input id="f-client" type="text" placeholder="Ej. Carlos"/></label></div>
    <div class="section"><label>Cantidad<input id="f-qty" type="number" min="1" value="1"/></label></div>
    ${currentItem.type!=='combo' ? `<div class="section">
      <div>¿Quieres que te sorprendamos con una nueva configuración (aderezo)?</div>
      <label><input type="checkbox" id="f-surprise"/> Sí, sorprender</label>
      ${currentItem.suggested ? `<small>Salsa sugerida del menú: ${currentItem.suggested}</small>`:''}
    </div>`:''}
    <div class="footer"><button class="btn secondary" id="to2">Siguiente</button></div>
  `;
  step1.querySelector('#to2').onclick = ()=>{
    orderDraft.client = step1.querySelector('#f-client').value.trim();
    orderDraft.qty = Number(step1.querySelector('#f-qty').value||1);
    orderDraft.surprise = !!step1.querySelector('#f-surprise')?.checked;
    buildStep2(); setStep(2);
  };
}

function buildStep2(){
  if (currentItem.type==='combo'){ // no extras para combo
    buildStep3(); setStep(3); return;
  }
  const ade = ADEREZOS.map(name=>`<label class="row"><input type="checkbox" data-a="${name}"/><span>${name} (+$${priceOfAderezo()})</span></label>`).join('');
  const ext = EXTRAS.map(x=>`<label class="row"><input type="checkbox" data-e="${x.name}"/><span>${x.name} (+$${x.price})</span></label>`).join('');
  step2.innerHTML = `
    <div class="section"><h4>Aderezos extra</h4><div class="list">${ade}</div></div>
    <div class="section"><h4>Ingredientes extra</h4><div class="list">${ext}</div></div>
    <div class="section"><h4>Comentarios a cocina</h4><input id="f-notes" type="text" placeholder="Sin jitomate, poco picante..."/></div>
    <div class="footer"><button class="btn secondary" id="back1">Atrás</button><button class="btn" id="to3">Revisar</button></div>
  `;
  step2.querySelector('#back1').onclick = ()=> setStep(1);
  step2.querySelector('#to3').onclick = ()=>{
    const a = [...step2.querySelectorAll('input[data-a]:checked')].map(i=>i.dataset.a);
    const e = [...step2.querySelectorAll('input[data-e]:checked')].map(i=>i.dataset.e);
    orderDraft.aderezos = a; orderDraft.extras = e;
    orderDraft.notes = step2.querySelector('#f-notes').value.trim();
    buildStep3(); setStep(3);
  };
}

function totalOf(d){
  let t = d.price * d.qty;
  t += (d.aderezos?.length||0) * priceOfAderezo();
  for (const x of d.extras||[]) {
    const item = EXTRAS.find(e=>e.name===x); if (item) t += item.price;
  }
  return t;
}

function buildStep3(){
  const t = totalOf(orderDraft);
  step3.innerHTML = `
    <div class="section">
      <h4>Resumen</h4>
      <div><strong>${orderDraft.itemName}</strong> × ${orderDraft.qty}</div>
      ${orderDraft.surprise?'<div>✨ Sorprender con aderezo extra</div>':''}
      <div>Aderezos: ${(orderDraft.aderezos||[]).join(', ') || '—'}</div>
      <div>Extras: ${(orderDraft.extras||[]).join(', ') || '—'}</div>
      <div>Notas: ${orderDraft.notes||'—'}</div>
      <div><strong>Total: $${t}</strong></div>
    </div>
    <div class="footer"><button class="btn secondary" id="back2">Atrás</button><button class="btn" id="send">Enviar pedido</button></div>
  `;
  step3.querySelector('#back2').onclick = ()=> setStep(2);
  step3.querySelector('#send').onclick = async ()=>{
    const payload = {
      ...orderDraft,
      total: t,
      createdAt: Date.now(),
      status: 'PENDING',
      server: 'kiosk',
      ingredients: (currentItem.ingredients||[]),
    };
    await createOrder(payload);
    beep();
    modal.classList.add('hidden');
    alert('¡Tu pedido fue enviado! Te avisaremos cuando esté listo.');
  };
}
