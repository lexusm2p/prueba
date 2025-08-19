import { MENU } from '../shared/products.js';
import { PRICES } from '../shared/pricing.js';
import { createOrder, getSettings } from '../shared/db.js';
import { consumeOnOrder } from '../shared/inventory.js';
import { money, $ } from '../shared/util.js';
import { toast } from '../shared/toast.js';
import { beep, star } from '../shared/notify.js';
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { app } from "../lib/firebase-init.js"; // tu init

const auth = getAuth(app);
signInAnonymously(auth).catch(console.error);
let cart=[]; let hiddenTaps=0;

function lineBurger(b){
  const price = b.base==='mini'? PRICES.burgers.mini : PRICES.burgers.grande;
  const ing = b.ingredients.join(', ');
  return `<div class="k-card">
    <h4>${b.name} <span class="price">${money(price)}</span></h4>
    <div class="small">Ingredientes: ${ing}. Sugerida: ${b.sugSauce}</div>
    <div class="row" style="margin-top:8px"><button class="btn" data-id="${b.id}" data-type="${b.base}" data-name="${b.name}">Ordenar</button></div>
  </div>`;
}

function render(){
  $('#minis').innerHTML   = MENU.minis.map(lineBurger).join('');
  $('#grandes').innerHTML = MENU.grandes.map(lineBurger).join('');
  renderCart();
}

function renderCart(){
  const hh = window._hh || false;
  const addOn = (it)=> it.extras.reduce((s,e)=> s+e.price,0) + it.sauces.reduce((s,e)=> s+e.price,0);
  const basePrice = it => (it.type==='mini'?PRICES.burgers.mini:PRICES.burgers.grande);
  let subtotal = 0;

  const rows = cart.map((it,i)=>{
    const p = basePrice(it)+addOn(it);
    subtotal += p;
    const extraTxt = [...it.extras.map(e=>e.label), ...it.sauces.map(s=>s.label)].join(', ') || 'Sin extras';
    return `<div class="k-card">
      <div class="row" style="justify-content:space-between">
        <div><b>${it.name}</b><div class="small">${extraTxt}</div></div>
        <div class="price">${money(p)}</div>
      </div>
      <div class="row" style="margin-top:6px">
        <button class="btn secondary" data-edit="${i}">Editar</button>
        <button class="btn" data-del="${i}">Quitar</button>
      </div>
    </div>`;
  }).join('');

  const minisCount = cart.filter(x=>x.type==='mini').length;
  let comboDiscount = 0;
  if(minisCount>=3){
    const regular = PRICES.burgers.mini*3;
    comboDiscount = regular - PRICES.comboMinis3;
    document.getElementById('hhBanner').style.display='block';
    document.getElementById('hhBanner').textContent = `¡Combo secreto 3 minis aplicado! $${PRICES.comboMinis3} 🎉`;
    star();
  } else {
    if(!(window._hh)) document.getElementById('hhBanner').style.display='none';
  }

  let hhDiscount = 0;
  if(hh){ hhDiscount = Math.round((subtotal-comboDiscount)*PRICES.happyHourOff); }

  const total = subtotal - comboDiscount - hhDiscount;
  document.getElementById('cart').innerHTML = rows || `<div class="small">Tu carrito está vacío.</div>`;
  document.getElementById('grandTotal').textContent = money(total);
}

function openCustomizer(item){
  const extras = Object.entries(PRICES.extras).map(([k,v])=>`<label class="checkbox"><input type="checkbox" data-ex="${k}" data-price="${v.price}"> ${v.label} (+$${v.price})</label>`).join('');
  const sauces = Object.entries(PRICES.sauces).map(([k,v])=>`<label class="checkbox"><input type="checkbox" data-sc="${k}" data-price="${v.price}"> ${v.label} (+$${v.price})</label>`).join('');
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="card" style="max-width:680px">
    <h3>${item.name}</h3>
    <div class="small">Ingredientes: ${item.ingredients.join(', ')}. Sugerida: ${item.sugSauce}</div>
    <h4>Aderezos extra</h4>${sauces}
    <h4>Ingredientes extra</h4>${extras}
    <div class="row" style="margin-top:10px">
      <button class="btn" data-ok>Agregar</button>
      <button class="btn secondary" data-cancel>Cancelar</button>
    </div>
  </div>`;
  document.body.appendChild(dlg); dlg.showModal();

  dlg.addEventListener('click', e=>{
    if(e.target.dataset.cancel!==undefined){ dlg.close(); dlg.remove(); }
    if(e.target.dataset.ok!==undefined){
      const selEx=[...dlg.querySelectorAll('input[data-ex]:checked')].map(i=>{ const key=i.dataset.ex; const meta=PRICES.extras[key]; return {key, label:meta.label, price:+i.dataset.price}; });
      const selSc=[...dlg.querySelectorAll('input[data-sc]:checked')].map(i=>{ const key=i.dataset.sc; const meta=PRICES.sauces[key]; return {key, label:meta.label, price:+i.dataset.price}; });

      if(item.id.includes('starter') && (selEx.length + selSc.length)>=2){
        toast('¡Desbloqueaste Select Player! ⭐'); star();
      }

      cart.push({ type:item.base, name:item.name, extras:selEx, sauces:selSc, ingredients:item.ingredients });
      dlg.close(); dlg.remove(); beep(); renderCart();
    }
  });
}

document.addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  if(btn.dataset.id){
    const id = btn.dataset.id;
    const src = [...MENU.minis, ...MENU.grandes].find(x=>x.id===id);
    if(src) openCustomizer(src);
  }
  if(btn.id==='clearCart'){ cart=[]; renderCart(); }
  if(btn.dataset.del){ cart.splice(+btn.dataset.del,1); renderCart(); }
  if(btn.dataset.edit){
    const idx=+btn.dataset.edit; const src=cart[idx];
    if(src){
      openCustomizer({ id:'custom', name:src.name, base:src.type, ingredients:src.ingredients||[], sugSauce:'—' });
      cart.splice(idx,1);
    }
  }
});

document.getElementById('confirmOrder').onclick = async ()=>{
  const name = document.getElementById('customerName').value.trim();
  if(!name){ toast('Pon tu nombre para continuar'); beep(300); return; }
  if(cart.length===0){ toast('Agrega algo al carrito'); beep(300); return; }

  const settings = await getSettings(); const hh = !!settings.hhActive;
  const pay = document.getElementById('payMethod').value;
  const table = document.getElementById('tableSelect').value||null;
  const total = document.getElementById('grandTotal').textContent.replace('$','')*1;

  const order = { name, table, payMethod:pay, items:cart, happyHour:hh, total };
  await createOrder(order);
  try{ await consumeOnOrder(order); }catch(e){ console.warn('consumeOnOrder:',e); }

  cart=[]; renderCart();
  toast(`Gracias por tu pedido, ${name}. Te avisamos cuando esté listo.`); beep();
};

(async ()=>{
  const s = await getSettings();
  if(s.hhActive){
    window._hh = true;
    const el = document.getElementById('hhBanner'); el.style.display='block';
    const tick=()=>{
      const left = (s.hhEndAt||0) - Date.now();
      if(left<=0){ el.style.display='none'; window._hh=false; return; }
      const m = Math.floor(left/60000), sec = Math.floor((left%60000)/1000);
      el.textContent = `Happy Hour -10%  ⏱ ${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
      requestAnimationFrame(tick);
    }; tick();
  }
})();

document.getElementById('logoTap').addEventListener('click', ()=>{ window._t=(window._t||0)+1; if(window._t>=7){ location.href='../admin/'; } });
render();
