import { createOrder } from '../lib/firebase.js';
import { ADEREZOS, EXTRAS, BIG, MINI, COMBO3_MINIS_PRICE } from '../lib/menu.js';
import { beep } from '../lib/notify.js';

const $ = s=>document.querySelector(s);
const view = $('#view');
const modal = $('#modal');
const sheet = $('#sheet');

const state = { mode:'minis' };
$('#tile-minis').onclick = ()=>{ state.mode='minis'; render(); };
$('#tile-big').onclick = ()=>{ state.mode='big'; render(); };
render();

function render(){
  if(state.mode==='minis'){
    renderMinis();
  }else{
    renderBig();
  }
}

function cardMini(m){
  const big = BIG.find(b=>b.id===m.ref);
  return `<div class="card">
    <h3>${m.name} <span class="price">$${m.price}</span></h3>
    <div class="muted small">${big ? big.ingredients : ''}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn" data-a="order-mini" data-id="${m.id}">Ordenar</button>
    </div>
  </div>`;
}

function renderMinis(){
  const cards = MINI.map(cardMini).join('');
  const combo = `<div class="card">
    <h3>Combo 3 Minis <span class="price">$${COMBO3_MINIS_PRICE}</span></h3>
    <div class="muted small">Elige cualquier 3 minis. Precio especial.</div>
    <div class="row" style="margin-top:10px">
      <button class="btn good" data-a="combo3">Armar combo</button>
    </div>
  </div>`;
  view.innerHTML = `<div class="grid">${combo}${cards}</div>`;
}

function cardBig(b){
  return `<div class="card">
    <h3>${b.name} <span class="price">$${b.price}</span></h3>
    <div class="muted small">${b.ingredients}</div>
    <div class="row" style="margin-top:10px">
      <span class="tag">Sugerida: ${b.suggest.map(id=>adName(id)).join(', ')||'—'}</span>
      <button class="btn" data-a="order-big" data-id="${b.id}">Ordenar</button>
    </div>
  </div>`;
}

function renderBig(){
  view.innerHTML = `<div class="grid">${BIG.map(cardBig).join('')}</div>`;
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const a = btn.dataset.a;
  if(a==='order-big'){ const id = btn.dataset.id; openOrder('big', id); }
  if(a==='order-mini'){ const id = btn.dataset.id; openOrder('mini', id); }
  if(a==='combo3'){ openCombo3(); }
});

function closeModal(){ modal.classList.remove('open'); sheet.innerHTML=''; }
modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });

function adName(id){ return (ADEREZOS.find(x=>x.id===id)||{}).name||id; }

function openOrder(kind, id){
  const map = kind==='big'?BIG:MINI;
  const item = map.find(x=>x.id===id);
  const base = kind==='big'? item.price : item.price;
  const bigRef = kind==='big'? item : (BIG.find(b=>b.id===item.ref)||{});
  sheet.innerHTML = `
    <h3>Ordenar ${item.name}</h3>
    <div class="sec">
      <label>Nombre del cliente</label>
      <input id="f-name" type="text" placeholder="Opcional"/>
    </div>
    <div class="sec row">
      <div style="flex:1">
        <label>Cantidad</label>
        <input id="f-qty" type="number" min="1" value="1"/>
      </div>
      <div style="flex:1">
        <label>Precio base</label>
        <div class="tag">$${base}</div>
      </div>
    </div>
    <div class="sec">
      <div class="control"><input id="f-surp" type="checkbox"/>
        <label for="f-surp">¿Quieres que te sorprendamos con una nueva configuración (aderezo)?</label></div>
      <div class="muted small">Sugeridas: ${ (bigRef.suggest||[]).map(adName).join(', ')||'—' }</div>
    </div>
    <hr class="sep"/>
    <div class="sec">
      <strong>Aderezos extra (+$5)</strong>
      <div class="list">
        ${ADEREZOS.map(a=>`<label class="item"><input type="checkbox" data-ad="${a.id}"/> <span>${a.name}</span> <span class="muted small">+$5</span></label>`).join('')}
      </div>
    </div>
    <div class="sec">
      <strong>Ingredientes extra</strong>
      <div class="list">
        ${EXTRAS.map(a=>`<label class="item"><input type="checkbox" data-ex="${a.id}"/> <span>${a.name}</span> <span class="muted small">+$${a.price}</span></label>`).join('')}
      </div>
    </div>
    <div class="sec row">
      <button id="btn-ok" class="btn full">Enviar</button>
      <button class="btn secondary full" onclick="(${closeModal.toString()})()">Cancelar</button>
    </div>
  `;
  modal.classList.add('open');

  $('#btn-ok').onclick = async ()=>{
    const qty = Math.max(1, parseInt($('#f-qty').value||'1',10));
    const name = $('#f-name').value.trim();
    const ads = [...sheet.querySelectorAll('input[data-ad]:checked')].map(x=>x.dataset.ad);
    const exs = [...sheet.querySelectorAll('input[data-ex]:checked')].map(x=>x.dataset.ex);
    const payload = {
      type: kind, itemId: id, itemName: item.name, priceBase: base, qty,
      extras: exs, aderezos: ads, surprise: $('#f-surp').checked,
      ingredients: (bigRef.ingredients||''),
      customer: name
    };
    await createOrder(payload);
    beep();
    closeModal();
  };
}

function openCombo3(){
  const opts = MINI.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
  sheet.innerHTML = `
    <h3>Combo 3 Minis <span class="price">$${COMBO3_MINIS_PRICE}</span></h3>
    <div class="sec"><label>Nombre del cliente</label><input id="c-name" type="text" placeholder="Opcional"/></div>
    <div class="sec row">
      <div style="flex:1"><label>Mini #1</label><select id="c-a">${opts}</select></div>
      <div style="flex:1"><label>Mini #2</label><select id="c-b">${opts}</select></div>
      <div style="flex:1"><label>Mini #3</label><select id="c-c">${opts}</select></div>
    </div>
    <div class="sec control"><input id="c-surp" type="checkbox"/><label for="c-surp">¿Te sorprendemos con aderezo extra?</label></div>
    <div class="sec row">
      <button id="c-ok" class="btn full">Enviar combo</button>
      <button class="btn secondary full" onclick="(${closeModal.toString()})()">Cancelar</button>
    </div>
  `;
  modal.classList.add('open');
  $('#c-ok').onclick = async ()=>{
    const ids = [$('#c-a').value,$('#c-b').value,$('#c-c').value];
    const items = ids.map(id=>MINI.find(m=>m.id===id));
    const payload = {
      type:'combo3', itemId:'combo3', itemName:'Combo 3 Minis', qty:1,
      priceBase: COMBO3_MINIS_PRICE,
      comboItems: items.map(x=>({id:x.id,name:x.name})),
      extras:[], aderezos:[], surprise: $('#c-surp').checked,
      ingredients: 'Ver ingredientes por mini', customer: $('#c-name').value.trim()
    };
    await createOrder(payload);
    beep();
    closeModal();
  };
}
