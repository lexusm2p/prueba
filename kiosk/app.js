// /kiosk/app.js
// Kiosko: catálogo, modal de compra y creación de pedidos
import { beep, toast } from '../shared/notify.js';
import { createOrder } from '../shared/db.js';

const state = { menu:null, mode:'mini', taps:0 };
const brand = document.getElementById('brandTap');

// 7 toques para revelar navegación oculta (roles)
brand.addEventListener('click',()=>{
  state.taps++;
  if(state.taps>=7){
    document.getElementById('navRoles').style.display='flex';
  }
  setTimeout(()=>state.taps=0,1000);
});

document.getElementById('btnMinis').onclick = ()=>{state.mode='mini'; renderCards();}
document.getElementById('btnBig').onclick = ()=>{state.mode='big'; renderCards();}

async function loadMenu(){
  const res = await fetch('../data/menu.json');
  state.menu = await res.json();
  renderCards();
}

function money(n){ return '$'+Number(n||0).toFixed(0); }

function renderCards(){
  const grid = document.getElementById('cards');
  grid.innerHTML='';
  if(!state.menu) return;

  const items = state.mode==='mini' ? state.menu.minis : state.menu.burgers;
  items.forEach(it=>{
    const base = it.baseOf ? state.menu.burgers.find(b=>b.id===it.baseOf) : it;
    const card = document.createElement('div'); 
    card.className='card';
    card.innerHTML = `
      <h3>${it.name}</h3>
      <div class="muted small">${(base.ingredients||[]).join(', ')}</div>
      <div class="row">
        <div class="price">${money(it.price)}</div>
        <div class="row" style="gap:8px">
          <button class="btn ghost small" data-a="ing">Ingredientes</button>
          <button class="btn small" data-a="order">Ordenar</button>
        </div>
      </div>`;
    grid.appendChild(card);

    card.querySelector('[data-a="ing"]').onclick = ()=> {
      alert(`${base.name||it.name}\n\nIngredientes:\n- ${(base.ingredients||[]).join('\n- ')}`);
    };
    card.querySelector('[data-a="order"]').onclick = ()=> openModal(it, base);
  });
}

function openModal(item, base){
  const modal = document.getElementById('modal'); 
  modal.classList.add('open');

  const body = document.getElementById('mBody');
  document.getElementById('mTitle').textContent = item.name + ' · ' + money(item.price);
  document.getElementById('mClose').onclick = ()=> modal.classList.remove('open');

  const sauces = state.menu.extras.sauces;
  const ingr   = state.menu.extras.ingredients;
  const SP     = Number(state.menu.extras.saucePrice||5);
  const IP     = Number(state.menu.extras.ingredientPrice||5);

  // DLC solo para MINIS (UX gamer). Regla: +$20 por unidad.
  const DLC_PRICE = 20;
  const dlcBlock = item.mini ? `
    <div class="field">
      <label>DLC de Carne grande</label>
      <div class="ul-clean" style="grid-template-columns:28px 1fr;">
        <input type="checkbox" id="dlcCarne"/>
        <label for="dlcCarne">Añadir carne de 85g (+${money(DLC_PRICE)}/mini)</label>
      </div>
    </div>` : ``;

  body.innerHTML = `
    <div class="field">
      <label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required/>
    </div>

    <div class="field">
      <label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="1"/>
    </div>

    ${dlcBlock}

    <div class="hr"></div>

    <div class="field">
      <label>Aderezos extra</label>
      <div class="ul-clean" id="sauces">
        ${sauces.map((s,i)=>`
          <input type="checkbox" id="s${i}"/>
          <label for="s${i}">${s}</label>
          <span class="tag">(+${money(SP)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label>Ingredientes extra</label>
      <div class="ul-clean" id="ingrs">
        ${ingr.map((s,i)=>`
          <input type="checkbox" id="e${i}"/>
          <label for="e${i}">${s}</label>
          <span class="tag">(+${money(IP)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label>¿Quieres que te sorprendamos con un aderezo nuevo?</label>
      <select id="surprise">
        <option value="no">No, gracias</option>
        <option value="si">Sí, sorpréndeme</option>
      </select>
    </div>

    <div class="field">
      <label>Comentarios a cocina</label>
      <textarea id="notes" placeholder="sin jitomate, poco picante…"></textarea>
    </div>
  `;

  const totalEl = document.getElementById('mTotal');
  const qtyEl   = document.getElementById('qty');
  const dlcEl   = document.getElementById('dlcCarne');

  const inputs = body.querySelectorAll('input[type=checkbox], #qty');
  const calc = ()=>{
    const qty = parseInt(qtyEl.value||'1',10);
    const extrasS = [...body.querySelectorAll('#sauces input:checked')].length;
    const extrasI = [...body.querySelectorAll('#ingrs input:checked')].length;

    let subtotal = item.price*qty + (extrasS*SP + extrasI*IP)*qty;
    if (item.mini && dlcEl?.checked) subtotal += DLC_PRICE * qty;

    totalEl.textContent = money(subtotal);
    return {qty, subtotal};
  };
  inputs.forEach(i=> i.addEventListener('change', calc)); 
  calc();

  document.getElementById('mConfirm').onclick = async ()=>{
    const name = document.getElementById('cName').value.trim();
    if(!name){ alert('Por favor escribe tu nombre.'); return; }

    const {qty, subtotal} = calc();
    const saucesSel = [...body.querySelectorAll('#sauces input')].map((el,i)=> el.checked? sauces[i]: null).filter(Boolean);
    const ingrSel   = [...body.querySelectorAll('#ingrs input')].map((el,i)=> el.checked? ingr[i]: null).filter(Boolean);
    const surprise  = document.getElementById('surprise').value==='si';
    const dlcOn     = item.mini && !!dlcEl?.checked;

    const order = {
      customer: name,
      qty, subtotal,
      item: { id:item.id, name:item.name, price:item.price, mini: !!item.mini },
      baseIngredients: base.ingredients||[],
      suggested: base.suggested || item.suggested || null,
      extras: { sauces: saucesSel, ingredients: ingrSel, surprise, dlcCarneGrande: dlcOn },
      notes: document.getElementById('notes').value.trim()
    };

    await createOrder(order);
    beep();

    if(item.mini && qty>=3){
      toast('¡Logro desbloqueado! 3 minis ⭐','⭐');
    }
    if(dlcOn){
      toast('🔓 ¡Has desbloqueado el DLC de Carne grande!');
    }

    toast('Gracias por tu pedido, '+name+' ✨');
    document.getElementById('modal').classList.remove('open');
  };
}

loadMenu();
