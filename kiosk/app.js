import { beep, toast } from '../shared/notify.js';
import { createOrder } from '../shared/db.js';

const state = { menu:null, mode:'mini', taps:0, coins:0 };

// 7 taps → muestra roles
document.getElementById('brandTap').addEventListener('click', ()=>{
  state.taps++;
  if(state.taps >= 7){
    document.getElementById('navRoles').style.display='flex';
    toast('Modo staff desbloqueado 🔓');
  }
  setTimeout(()=> state.taps = 0, 1000);
});

document.getElementById('btnMinis').onclick = ()=>{ state.mode='mini'; renderCards(); };
document.getElementById('btnBig').onclick  = ()=>{ state.mode='big';  renderCards(); };

const $bubble = document.getElementById('bubble');
document.getElementById('bClose').onclick = ()=> $bubble.style.display='none';

const money = (n)=>'$'+Number(n||0).toFixed(0);

async function loadMenu(){
  const res = await fetch('../data/menu.json');
  state.menu = await res.json();
  renderCards();
}
loadMenu();

const $grid = document.getElementById('cards');

function renderCards(){
  if(!state.menu) return;
  $grid.innerHTML = '';
  const items = state.mode==='mini' ? state.menu.minis : state.menu.burgers;

  items.forEach(it=>{
    const base = it.baseOf ? state.menu.burgers.find(b=>b.id===it.baseOf) : it;
    const icon = it.icon || base?.icon || '../img/icons/placeholder.png';

    const $card = document.createElement('article');
    $card.className = 'card card-8bit';
    $card.innerHTML = `
      <div class="card-media">
        <img class="pixel-icon" src="${icon}" alt="${it.name}" onerror="this.style.display='none'"/>
      </div>
      <h3 class="title-8bit">${it.name}</h3>
      <div class="row between">
        <div class="price">${money(it.price)}</div>
        <div class="row gap8">
          <button class="btn-8bit ghost small" data-a="ing">Ingredientes</button>
          <button class="btn-8bit small" data-a="order">Ordenar</button>
        </div>
      </div>
    `;
    $grid.appendChild($card);

    $card.querySelector('[data-a="ing"]').onclick = ()=>{
      document.getElementById('bTitle').textContent = it.name;
      const list = (base.ingredients||[]).map(x=>`<li>${x}</li>`).join('');
      document.getElementById('bBody').innerHTML = `<ul class="list-8bit">${list}</ul>`;
      $bubble.style.display='grid';
    };
    $card.querySelector('[data-a="order"]').onclick = ()=> openModal(it, base);
  });
}

function openModal(item, base){
  const modal = document.getElementById('modal');
  const body  = document.getElementById('mBody');
  modal.classList.add('open');

  document.getElementById('mTitle').textContent = `${item.name} · ${money(item.price)}`;
  document.getElementById('mClose').onclick    = ()=> modal.classList.remove('open');

  const sauces = state.menu.extras.sauces;       // [{name,price}, ...]
  const ingr   = state.menu.extras.ingredients;  // [{name,price}, ...]
  const showDLC = !!item.mini && !!state.menu.extras?.dlc?.meatUpgradePrice;
  const DLC = state.menu.extras?.dlc?.meatUpgradePrice || 0;

  body.innerHTML = `
    <div class="field">
      <label class="small">Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required/>
    </div>

    <div class="row gap12">
      <div class="field flex1">
        <label class="small">Cantidad</label>
        <input id="qty" type="number" min="1" max="9" value="1"/>
      </div>
      ${showDLC ? `
      <div class="field flex1">
        <label class="small">DLC de Carne grande</label>
        <label class="switch">
          <input id="dlcMeat" type="checkbox"/>
          <span class="slider"></span>
        </label>
        <div class="muted small">(+${money(DLC)} c/u)</div>
      </div>`:''}
    </div>

    <div class="hr"></div>

    <div class="field">
      <label class="small">Aderezos extra</label>
      <div class="ul-clean" id="sauces">
        ${sauces.map((s,i)=>`
          <input type="checkbox" id="s${i}"/>
          <label for="s${i}">${s.name}</label>
          <span class="tag">(+${money(s.price)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label class="small">Ingredientes extra</label>
      <div class="ul-clean" id="ingrs">
        ${ingr.map((x,i)=>`
          <input type="checkbox" id="e${i}"/>
          <label for="e${i}">${x.name}</label>
          <span class="tag">(+${money(x.price)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label class="small">¿Te sorprendemos con aderezo?</label>
      <select id="surprise">
        <option value="no">No, gracias</option>
        <option value="si">Sí, sorpréndeme</option>
      </select>
    </div>

    <div class="field">
      <label class="small">Comentarios a cocina</label>
      <textarea id="notes" placeholder="sin jitomate, poco picante…"></textarea>
    </div>
  `;

  const totalEl = document.getElementById('mTotal');
  const qtyEl   = document.getElementById('qty');
  const dlcEl   = document.getElementById('dlcMeat');

  const calc = ()=>{
    const qty = Math.max(1, parseInt(qtyEl.value||'1',10));
    const sauceSum = [...document.querySelectorAll('#sauces input:checked')]
      .reduce((sum, el)=> sum + sauces[Number(el.id.slice(1))].price, 0);
    const ingrSum = [...document.querySelectorAll('#ingrs input:checked')]
      .reduce((sum, el)=> sum + ingr[Number(el.id.slice(1))].price, 0);
    const dlc = (showDLC && dlcEl?.checked) ? DLC : 0;
    const unit = item.price + sauceSum + ingrSum + dlc;
    const subtotal = unit * qty;
    totalEl.textContent = money(subtotal);
    return {qty, subtotal, dlc: !!(showDLC && dlcEl?.checked)};
  };

  // escuchar cambios y calcular una vez
  body.addEventListener('change', (e)=>{
    if(e.target.matches('input, select')) calc();
  });
  calc(); // <-- importante para que NO muestre $0 al abrir

  document.getElementById('mConfirm').onclick = async ()=>{
    const name = document.getElementById('cName').value.trim();
    if(!name){ alert('Por favor escribe tu nombre.'); return; }
    const {qty, subtotal, dlc} = calc();

    const saucesSel = [...document.querySelectorAll('#sauces input:checked')]
      .map(el => sauces[Number(el.id.slice(1))].name);
    const ingrSel = [...document.querySelectorAll('#ingrs input:checked')]
      .map(el => ingr[Number(el.id.slice(1))].name);
    const surprise  = document.getElementById('surprise').value==='si';

    const base = item.baseOf ? state.menu.burgers.find(b=>b.id===item.baseOf) : item;
    const order = {
      customer: name,
      qty, subtotal,
      item: { id:item.id, name:item.name, price:item.price, mini: !!item.mini },
      baseIngredients: base.ingredients||[],
      suggested: base.suggested || item.suggested || null,
      extras: { sauces: saucesSel, ingredients: ingrSel, surprise, dlcMeat: dlc },
      notes: document.getElementById('notes').value.trim()
    };

    await createOrder(order);
    beep();
    if(item.mini && qty>=3){ toast('¡Logro desbloqueado! 3 minis ⭐', {star:true}); addCoin(); }
    toast(`Gracias por tu pedido, ${name} ✨`);
    modal.classList.remove('open');
  };
}

// HUD
function addCoin(){
  state.coins = Math.min(99, state.coins+1);
  document.getElementById('hudCoins').textContent = 'x' + String(state.coins).padStart(2,'0');
}
