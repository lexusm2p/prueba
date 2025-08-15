import { beep } from '../lib/notify.js';
import { createOrder } from '../lib/firebase.js';
import { MENU, MINIS, EXTRAS, SAUCES, PRICES } from '../lib/menu.js';

const app = document.querySelector('#app');
const $ = s=>document.querySelector(s);

// Admin oculto: 5 taps al logo
(()=>{const el=$('#brandTap');let taps=0,t=null;el.addEventListener('click',()=>{taps++;if(!t)t=setTimeout(()=>{taps=0;t=null},3000);if(taps>=5)location.href='../admin/';});})();

const card = (m, kind='big') => `
  <div class="card">
    <h3>${m.name} <span class="price">$${m.price}</span></h3>
    <p class="muted">${m.desc||''}</p>
    <div class="row">
      <button class="btn" data-a="order" data-kind="${kind}" data-id="${m.id}">Ordenar</button>
    </div>
  </div>`;

function home(){
  const miniCards = MINIS.map(m=>card(m,'mini')).join('');
  const bigCards = MENU.map(m=>card(m,'big')).join('');
  app.innerHTML = `
  <section class="hero">
    <h1>¡Elige tu modo de juego!</h1>
    <p class="muted">Minis por defecto. ¿Prefieres retos grandes? También tenemos 😉</p>
  </section>
  <section class="grid grid-cards">
    <div class="card" style="outline:2px dashed #ffcc66;outline-offset:4px">
      <h3>Combo 3 Minis <span class="price">$${PRICES.combo3Minis}</span></h3>
      <p class="muted">Elige 3 minis diferentes. Precio especial con cierre en 7.</p>
      <div class="row"><button class="btn" data-a="combo3">Armar combo</button></div>
    </div>
    ${miniCards}
    <div class="divider"></div>
    <h2>¿Prefieres los retos más grandes?</h2>
    ${bigCards}
  </section>`;
}
home();

document.addEventListener('click',(e)=>{
  const b=e.target.closest('button'); if(!b) return;
  const a=b.dataset.a;
  if(a==='order') openOrder(b.dataset.id,b.dataset.kind);
  if(a==='combo3') openCombo3();
});

function optionsList(items, nameKey){
  return items.map(x=>`
    <label class="opt">
      <input type="checkbox" name="${nameKey}" value="${x.id}">
      <span>${x.name} <small class="muted">(+$${x.price})</small></span>
    </label>`).join('');
}
function sumByIds(ids, list){ return ids.reduce((acc,id)=>{const it=list.find(e=>e.id===id);return acc+(it?it.price:0);},0); }

function openOrder(id, kind){
  const src = kind==='mini'? MINIS : MENU;
  const item = src.find(x=>x.id===id); if(!item) return;
  const modal = document.createElement('div'); modal.className='modal';
  modal.innerHTML = `
    <div class="sheet">
      <h3>${item.name} <span class="price">$${item.price}</span></h3>
      <label>Tu nombre <input id="custName" placeholder="Nombre para avisarte cuando esté listo"></label>
      <label>Cantidad <input id="qty" type="number" min="1" value="1"></label>
      <div class="group"><h4>Aderezos extra</h4>${optionsList(SAUCES,'sauces')}</div>
      <div class="group"><h4>Ingredientes extra</h4>${optionsList(EXTRAS,'extras')}</div>
      <label class="opt"><input type="checkbox" id="surprise"><span>¿Quieres que te sorprendamos con un aderezo? (+$5)</span></label>
      <label>Notas a cocina <textarea id="notes" placeholder="sin jitomate, poco picante, etc."></textarea></label>
      <div class="row end"><button class="btn ghost" data-a="close">Cancelar</button><button class="btn" data-a="send">Confirmar pedido</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', async (ev)=>{
    const b = ev.target.closest('button'); if(!b) return;
    if(b.dataset.a==='close'){ modal.remove(); return; }
    if(b.dataset.a==='send'){
      const qty = Math.max(1, parseInt(modal.querySelector('#qty').value||'1',10));
      const customer = modal.querySelector('#custName').value.trim() || 'Cliente';
      const notes = modal.querySelector('#notes').value.trim();
      const sauces = [...modal.querySelectorAll('input[name="sauces"]:checked')].map(i=>i.value);
      const extras = [...modal.querySelectorAll('input[name="extras"]:checked')].map(i=>i.value);
      const surprise = modal.querySelector('#surprise').checked;
      const addSauces = sumByIds(sauces, SAUCES);
      const addExtras = sumByIds(extras, EXTRAS);
      const unit = item.price + addSauces + addExtras + (surprise?5:0);
      const line = { id:item.id, name:item.name, kind, unitPrice:unit, basePrice:item.price, qty, sauces, extras, surprise };
      const total = unit * qty;
      await createOrder({ customer, items:[line], total, notes });
      beep();
      modal.remove();
      alert('¡Pedido enviado!');
    }
  });
}

function openCombo3(){
  const modal = document.createElement('div'); modal.className='modal';
  const opts = MINIS.map(m=>`
    <label class="opt">
      <input type="checkbox" name="mini" value="${m.id}">
      <span>${m.name}</span>
    </label>`).join('');
  modal.innerHTML = `
    <div class="sheet">
      <h3>Combo 3 Minis <span class="price">$${PRICES.combo3Minis}</span></h3>
      <p class="muted">Selecciona <b>exactamente 3</b> minis distintas.</p>
      <div class="group">${opts}</div>
      <label>Tu nombre <input id="custName" placeholder="Nombre para avisarte cuando esté listo"></label>
      <div class="row end"><button class="btn ghost" data-a="close">Cancelar</button><button class="btn" data-a="send">Confirmar combo</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', async (ev)=>{
    const b=ev.target.closest('button'); if(!b) return;
    if(b.dataset.a==='close'){ modal.remove(); return; }
    if(b.dataset.a==='send'){
      const picked = [...modal.querySelectorAll('input[name="mini"]:checked')].map(i=>i.value);
      if(picked.length!==3){ alert('Debes elegir 3 minis.'); return; }
      const customer = modal.querySelector('#custName').value.trim() || 'Cliente';
      const items = picked.map(id=>{
        const m = MINIS.find(x=>x.id===id);
        return { id:m.id, name:m.name, kind:'mini', unitPrice:0, basePrice:m.price, qty:1, sauces:[], extras:[], surprise:false };
      });
      await createOrder({ customer, items, combo:'3minis', total: PRICES.combo3Minis, notes:'' });
      beep();
      modal.remove();
      alert('¡Combo enviado!');
    }
  });
}
