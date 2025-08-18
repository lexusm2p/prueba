
import { PRODUCTS, SAUCES, EXTRAS, isMini, getIngredientsForSku, getProductBySku } from '../shared/menu-data.js';
import { toast, beep, starSfx } from '../shared/notify.js';
import { createOrder } from '../shared/db.js';

// Config combos
const COMBO_MINI_TRIO_DISCOUNT = 10; // MXN por cada 3 minis

// hidden login: 6 taps
let taps=0, timer=null;
const brand=document.getElementById('brandTitle');
const loginLink=document.getElementById('loginLink');
brand?.addEventListener('click', ()=>{
  taps++; clearTimeout(timer); timer=setTimeout(()=>taps=0, 900);
  if(taps>=6){ loginLink.style.display='inline-block'; toast('🔓 Modo staff'); taps=0; }
});
document.addEventListener('pointerdown', ()=>starSfx.prewarm(), {once:true});

const miniMenu=document.getElementById('miniMenu');
const bigMenu=document.getElementById('bigMenu');
const grandTotalEl=document.getElementById('grandTotal');
const cartCountEl=document.getElementById('cartCount');
const miniCountEl=document.getElementById('miniCount');
const btnReview=document.getElementById('btnReview');
const surpriseSel=document.getElementById('surprise');

const productOverlay=document.getElementById('productOverlay');
const productModal=document.getElementById('productModal');
const reviewOverlay=document.getElementById('reviewOverlay');
const reviewModal=document.getElementById('reviewModal');

const cart={ items:[] };
let starUnlocked=false;

function addToCart(item){
  const sig = signature(item);
  const existing = cart.items.find(x=>signature(x)===sig);
  if(existing){ existing.qty=(existing.qty||1)+item.qty; }
  else { cart.items.push({...item}); }
  toast(`Añadido: ${item.name}`);
  beep();
  refreshSummary();
}

function signature(it){
  const extras = (it.extras||[]).map(e=>e.name).sort().join('+');
  return `${it.sku}|${extras}`;
}

function openProductModal(sku){
  const p = getProductBySku(sku);
  if(!p) return;
  const ingr = getIngredientsForSku(sku);

  const extrasList = EXTRAS.map((ex,i)=>`
    <label class="row" style="justify-content:space-between;align-items:center">
      <span>${ex.name}</span>
      <span class="price">+$${ex.price}</span>
      <input type="checkbox" data-extra="${i}">
    </label>
  `).join('');

  productModal.innerHTML = `
    <div style="position:relative">
      <button class="closex" id="pmClose">×</button>
      <h3>${p.name}</h3>
      <div class="muted small" style="margin-bottom:8px">${p.size==='mini'?'Mini':'Hamburguesa'}</div>
      <div class="small"><strong>Incluye:</strong> ${ingr.join(', ') || '—'}</div>
      <hr style="border-color:#2a2f40;margin:10px 0">
      <div class="small"><strong>Extras opcionales</strong></div>
      <div class="grid" style="grid-template-columns:1fr;gap:6px;margin-top:6px">${extrasList}</div>
      <div class="row" style="justify-content:space-between;margin-top:10px">
        <label class="small muted">Cantidad</label>
        <input id="pmQty" class="input" type="number" min="1" value="1" style="max-width:90px;text-align:center">
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:12px">
        <button class="btn ghost" id="pmCancel">Cancelar</button>
        <button class="btn ok" id="pmAdd">Agregar</button>
      </div>
    </div>`;

  productOverlay.style.display='flex';

  const close = ()=>{ productOverlay.style.display='none'; productModal.innerHTML=''; };
  productModal.querySelector('#pmClose').onclick=close;
  productModal.querySelector('#pmCancel').onclick=close;
  productModal.querySelector('#pmAdd').onclick=()=>{
    const qty = Math.max(1, parseInt(productModal.querySelector('#pmQty').value||'1',10));
    const chosen = [...productModal.querySelectorAll('[data-extra]:checked')].map(ch=>EXTRAS[parseInt(ch.dataset.extra,10)]);
    const addItem = {
      sku:p.sku, name:p.name, size:p.size, price:p.price, qty,
      ingredients: ingr,
      extras: chosen
    };
    addToCart(addItem);
    close();
  };
}

function renderMenus(){
  const minis = PRODUCTS.filter(p=>isMini(p));
  const bigs  = PRODUCTS.filter(p=>!isMini(p));

  function card(p){
    const ingr = getIngredientsForSku(p.sku);
    return `
    <div class="card item">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <div>${p.name}</div>
          <div class="muted small">${p.price} MXN</div>
          <div class="small muted" style="margin-top:6px">Incluye: ${ingr.join(', ')}</div>
        </div>
        <button class="btn small" data-custom="${p.sku}">Agregar</button>
      </div>
    </div>`;
  }

  miniMenu.innerHTML = minis.map(card).join('');
  bigMenu.innerHTML  = bigs.map(card).join('');
}
renderMenus();

document.addEventListener('click', (e)=>{
  const btnCustom=e.target.closest('[data-custom]');
  if(btnCustom){ openProductModal(btnCustom.dataset.custom); return; }
});

function refreshSummary(){
  const items = cart.items;
  const count = items.reduce((a,x)=>a+(x.qty||1),0);
  const minis = items.reduce((a,x)=>a+(isMini(x)?(x.qty||1):0),0);
  let total   = items.reduce((a,x)=>a + ((x.price + sumExtras(x.extras)) * (x.qty||1)), 0);
  const trios = Math.floor(minis/3);
  const discount = trios * COMBO_MINI_TRIO_DISCOUNT;
  total = Math.max(0, total - discount);

  if(!starUnlocked && minis>=3){
    starUnlocked=true;
    starSfx.play();
    toast('¡Logro desbloqueado! ⭐ Combo 3 minis');
  }

  grandTotalEl.textContent = `$${total}`;
  cartCountEl.textContent  = `${count} items`;
  miniCountEl.textContent  = `${minis} minis`;
}

function sumExtras(extras){ return (extras||[]).reduce((a,e)=>a+(e.price||0),0); }

btnReview.addEventListener('click', ()=>{
  if(!cart.items.length){ toast('Agrega productos al carrito'); return; }
  openReview();
});

function openReview(){
  const rows = cart.items.map((it,idx)=>{
    const ex = it.extras?.length ? `<div class="small">Extras: ${it.extras.map(e=>e.name).join(', ')} (+$${sumExtras(it.extras)})</div>` : '';
    return `
    <div class="card" data-idx="${idx}">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <div><strong>${it.name}</strong> × ${it.qty}</div>
          <div class="small muted">Incluye: ${ (it.ingredients||[]).join(', ') }</div>
          ${ex}
          <div class="small">Precio: $${it.price} c/u</div>
        </div>
        <button class="btn danger small" data-remove="${idx}">Quitar</button>
      </div>
    </div>`;
  }).join('');

  const minis = cart.items.reduce((a,x)=>a+( (x.size==='mini') ? (x.qty||1) : 0),0);
  const trios = Math.floor(minis/3);
  const discount = trios * COMBO_MINI_TRIO_DISCOUNT;
  const gross = cart.items.reduce((a,x)=>a + ((x.price + sumExtras(x.extras)) * (x.qty||1)),0);
  const grand = Math.max(0, gross - discount);

  reviewModal.innerHTML = `
    <div style="position:relative">
      <button class="closex" id="rvClose">×</button>
      <h3>Revisión de pedido</h3>
      <div class="grid" style="grid-template-columns:1fr;gap:8px;margin:10px 0">${rows}</div>
      <div class="row" style="justify-content:space-between;margin:6px 0">
        <div class="small muted">Subtotal</div><div>$${gross}</div>
      </div>
      ${( (trios>0) ? `<div class="row" style="justify-content:space-between;margin:6px 0"><div class="small muted">Descuento combo 3 minis</div><div>- $${discount}</div></div>` : ``)}
      <div class="row" style="justify-content:space-between;margin:10px 0">
        <div class="small muted">Total</div><div class="price">$${grand}</div>
      </div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn ghost" id="rvCancel">Seguir agregando</button>
        <button class="btn ok" id="rvConfirm">Confirmar y enviar</button>
      </div>
    </div>`;

  reviewOverlay.style.display='flex';

  reviewModal.querySelector('#rvClose').onclick=closeReview;
  reviewModal.querySelector('#rvCancel').onclick=closeReview;
  reviewModal.querySelector('#rvConfirm').onclick=confirmarPedido;

  reviewModal.addEventListener('click', (e)=>{
    const btn=e.target.closest('[data-remove]');
    if(!btn) return;
    const idx=parseInt(btn.dataset.remove,10);
    cart.items.splice(idx,1);
    if(!cart.items.length){ closeReview(); refreshSummary(); return; }
    openReview();
  }, { once:true });
}

function closeReview(){ reviewOverlay.style.display='none'; reviewModal.innerHTML=''; }

async function confirmarPedido(){
  const nameInput = document.getElementById('customerName');
  const customerName = (nameInput?.value || '').trim();
  if(!customerName){ toast('Escribe tu nombre para avisarte cuando esté listo 🙌'); nameInput?.focus(); return; }
  if(!cart.items.length){ toast('Agrega productos al carrito'); closeReview(); return; }

  const minis = cart.items.reduce((a,x)=>a+( (x.size==='mini') ? (x.qty||1) : 0),0);
  const trios = Math.floor(minis/3);
  const discount = trios * COMBO_MINI_TRIO_DISCOUNT;
  const gross = cart.items.reduce((a,x)=>a+((x.price+sumExtras(x.extras))*(x.qty||1)),0);
  const net = Math.max(0, gross - discount);

  const payload = {
    channel:'kiosk',
    customerName,
    items: cart.items.map(x=> ({
      sku:x.sku, name:x.name, size:x.size, qty:x.qty,
      price:x.price, extras:x.extras || [], ingredients:x.ingredients || []
    })),
    notes: '',
    surprise: surpriseSel.value==='yes',
    totals: { items: cart.items.length, gross, discount, grandTotal: net }
  };

  await createOrder(payload);
  starUnlocked=false;
  toast(`¡Gracias por tu pedido, ${customerName}}! Te avisaremos cuando esté listo. ✨`.replace('}}','}!'));
  beep();

  cart.items=[]; refreshSummary(); nameInput.value=''; surpriseSel.value='';
  closeReview();
}

// Render menus initial
renderMenus();
refreshSummary();
