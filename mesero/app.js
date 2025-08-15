// mesero/app.js
import { ensureAuth, createOrder, subscribeMyOrders } from "../lib/firebase.js";
import { MENU, MINIS, SAUCES, EXTRAS } from "../lib/menu.js";
import { chime } from "../lib/notify.js";

let waiterId = null;
const menuHost = document.getElementById('menu');
const mineHost = document.getElementById('mine');
const modal    = document.getElementById('modal');
const modalBody= document.getElementById('modalBody');
const closeBtn = document.getElementById('closeModal');

ensureAuth().then(user=>{
  waiterId = user.uid;
  renderCards([...MINIS, ...MENU]);
  subscribeMyOrders(waiterId, snap => {
    const orders = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderMine(orders);
    orders.filter(o=>o.status==='READY').forEach(o=> chime());
  });
});

function renderCards(list){
  menuHost.innerHTML = list.map(p => `
    <div class="card">
      <div class="title">${p.name}</div>
      <div>$${p.price}</div>
      <button data-id="${p.id}">Agregar</button>
    </div>
  `).join('');
  menuHost.querySelectorAll('button').forEach(btn=> btn.onclick = ()=>{
    const p = [...MINIS, ...MENU].find(x => x.id === btn.dataset.id);
    openModal(p);
  });
}

function renderMine(orders){
  mineHost.innerHTML = orders.map(o=>{
    const count = (o.items||[]).reduce((s,it)=>s+(it.qty||1),0);
    return `<div class="order">
      <div><strong>${count} item(s)</strong> — <span class="badge">${o.status}</span></div>
      <div style="opacity:.8">Total $${o.total||0} · ${o.customer||''}</div>
    </div>`;
  }).join('') || '<div class="order" style="opacity:.7">Sin órdenes</div>';
}

function renderOpt(opt){
  return `
    <label class="opt">
      <input type="checkbox" class="opt-input" data-id="${opt.id}" data-price="${opt.price}">
      <span class="opt-name">${opt.name}</span>
      <span class="opt-price">+$${opt.price}</span>
    </label>`;
}
function renderOptGrid(list){ return `<div class="grid-opts">${list.map(renderOpt).join('')}</div>`; }

function openModal(product){
  const aderezosHtml = renderOptGrid(SAUCES);
  const extrasHtml   = renderOptGrid(EXTRAS);
  modalBody.innerHTML = `
    <h3>${product.name}</h3>
    <div class="row">
      <label>Mesa / Cliente <input id="cust" type="text" placeholder="Mesa 1 o Cliente"></label>
    </div>
    <div class="row">
      <label>Cantidad <input id="qty" type="number" min="1" value="1"></label>
    </div>
    <div class="row">
      <h4>Aderezos extra (+$5 c/u)</h4>
      ${aderezosHtml}
    </div>
    <div class="row">
      <h4>Ingredientes extra</h4>
      ${extrasHtml}
    </div>
    <div class="row"><label>Notas <input id="notes" type="text" placeholder="Sin cebolla..."></label></div>

    <div id="totalBar" class="totalBar">
      <div><strong>Total: <span id="liveTotal">$0</span></strong></div>
      <button id="btnConfirm" class="btn-primary">Confirmar</button>
    </div>
  `;
  modal.classList.remove('hidden');
  closeBtn.onclick = ()=> modal.classList.add('hidden');

  const qtyEl = document.getElementById('qty');
  const liveTotal = document.getElementById('liveTotal');
  const adChecks = [...modalBody.querySelectorAll('.opt-input')].filter(x => SAUCES.some(s=>s.id===x.dataset.id));
  const exChecks = [...modalBody.querySelectorAll('.opt-input')].filter(x => EXTRAS.some(s=>s.id===x.dataset.id));

  function extrasPerUnit(){
    let s = 0;
    [...adChecks, ...exChecks].forEach(cb=> { if(cb.checked) s += Number(cb.dataset.price||0); });
    return s;
  }
  function renderTotal(){
    const qty = Math.max(1, Number(qtyEl.value||1));
    const isMini = !!product.isMini;
    const base = product.price * qty;
    const extras = extrasPerUnit() * qty;
    const discount = isMini ? Math.floor(qty/3)*7 : 0;
    liveTotal.textContent = `$${base + extras - discount}`;
  }
  [qtyEl, ...adChecks, ...exChecks].forEach(el => el.addEventListener('input', renderTotal));
  renderTotal();

  document.getElementById('btnConfirm').onclick = async ()=>{
    const qty = Math.max(1, Number(qtyEl.value||1));
    const customer = (document.getElementById('cust').value||'').trim();
    const notes = (document.getElementById('notes').value||'').trim();
    const adSel = adChecks.filter(x=>x.checked).map(x=> SAUCES.find(s=>s.id===x.dataset.id)?.name );
    const exSel = exChecks.filter(x=>x.checked).map(x=> EXTRAS.find(s=>s.id===x.dataset.id)?.name );
    const isMini = !!product.isMini;
    const discount = isMini ? Math.floor(qty/3)*7 : 0;
    const total = product.price*qty + extrasPerUnit()*qty - discount;

    const payload = {
      customer, total, waiterId: (waiterId||null),
      items: [{
        id: product.id, name: product.name, qty,
        baseIngredients: product.base || [],
        aderezos: adSel, extras: exSel, notes
      }]
    };
    await createOrder(payload);
    modal.classList.add('hidden');
  };
}
