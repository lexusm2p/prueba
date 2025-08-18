
import { PRODUCTS, SAUCES, EXTRAS, isMini } from '../shared/menu-data.js';
import { toast, beep, starSfx } from '../shared/notify.js';
import { createOrder } from '../shared/db.js';

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
const btnCheckout=document.getElementById('btnCheckout');
const surpriseSel=document.getElementById('surprise');

const cart={ items:[] };
let starUnlocked=false;

function addToCart(p){
  const existing = cart.items.find(x=>x.sku===p.sku);
  if(existing){ existing.qty=(existing.qty||1)+1; }
  else { cart.items.push({ sku:p.sku, name:p.name, size:p.size, price:p.price, qty:1 }); }
  toast(`Añadido: ${p.name}`);
  beep();
  refreshSummary();
}

function renderMenus(){
  const minis = PRODUCTS.filter(p=>isMini(p));
  const bigs  = PRODUCTS.filter(p=>!isMini(p));

  miniMenu.innerHTML = minis.map(p=>`
    <div class="card item">
      <div class="row" style="justify-content:space-between">
        <div><div>${p.name}</div><div class="muted small">${p.price} MXN</div></div>
        <button class="btn small" data-add="${p.sku}">Agregar</button>
      </div>
    </div>`).join('');

  bigMenu.innerHTML = bigs.map(p=>`
    <div class="card item">
      <div class="row" style="justify-content:space-between">
        <div><div>${p.name}</div><div class="muted small">${p.price} MXN</div></div>
        <button class="btn small" data-add="${p.sku}">Agregar</button>
      </div>
    </div>`).join('');
}
renderMenus();

document.addEventListener('click', (e)=>{
  const btn=e.target.closest('[data-add]');
  if(!btn) return;
  const sku=btn.dataset.add;
  const p = PRODUCTS.find(x=>x.sku===sku);
  if(p) addToCart(p);
});

function refreshSummary(){
  const items = cart.items;
  const count = items.reduce((a,x)=>a+(x.qty||1),0);
  const minis = items.reduce((a,x)=>a+(isMini(x)?(x.qty||1):0),0);
  let total   = items.reduce((a,x)=>a + (x.price * (x.qty||1)), 0);

  // logro 3 minis
  if(!starUnlocked && minis>=3){
    starUnlocked=true;
    starSfx.play();
    toast('¡Logro desbloqueado! ⭐ Combo 3 minis');
    // aquí podrías aplicar precio especial si está configurado
  }

  grandTotalEl.textContent = `$${total}`;
  cartCountEl.textContent  = `${count} items`;
  miniCountEl.textContent  = `${minis} minis`;
}
refreshSummary();

btnCheckout.addEventListener('click', async ()=>{
  const nameInput = document.getElementById('customerName');
  const customerName = (nameInput?.value || '').trim();
  if(!customerName){ toast('Escribe tu nombre para avisarte cuando esté listo 🙌'); nameInput?.focus(); return; }
  if(!cart.items.length){ toast('Agrega productos al carrito'); return; }

  const payload = {
    channel:'kiosk',
    customerName,
    items: cart.items,
    notes: '',
    surprise: surpriseSel.value==='yes',
    totals: { items: cart.items.length, grandTotal: cart.items.reduce((a,x)=>a+(x.price*(x.qty||1)),0) }
  };

  await createOrder(payload);
  starUnlocked=false;
  toast(`¡Gracias por tu pedido, ${customerName}! Te avisaremos cuando esté listo. ✨`);
  beep();
  // reset
  cart.items=[]; refreshSummary(); nameInput.value=''; surpriseSel.value='';
});
