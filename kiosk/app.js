// /kiosk/app.js
import { beep, toast } from '../shared/notify.js';
import { createOrder, fetchCatalogWithFallback } from '../shared/db.js';

const state = { menu:null, mode:'mini', taps:0 };

const brand = document.getElementById('brandTap');
brand.addEventListener('click',()=>{
  state.taps++;
  if(state.taps>=7){
    document.getElementById('navRoles').style.display='flex';
  }
  setTimeout(()=>state.taps=0,900);
});

document.getElementById('btnMinis').onclick = ()=>{ state.mode='mini'; renderCards(); }
document.getElementById('btnBig').onclick  = ()=>{ state.mode='big';  renderCards(); }

init();

async function init(){
  state.menu = await fetchCatalogWithFallback();
  renderCards();
}

function money(n){ return '$'+n.toFixed(0); }

function renderCards(){
  const grid = document.getElementById('cards'); grid.innerHTML='';
  const items = state.mode==='mini' ? state.menu.minis : state.menu.burgers;

  items.forEach(it=>{
    const base = it.baseOf ? state.menu.burgers.find(b=>b.id===it.baseOf) : it;
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <h3>${it.name}</h3>
      <div class="row">
        <div class="price">${money(it.price)}</div>
        <div class="row" style="gap:8px">
          <button class="btn ghost small" data-a="ing">Ingredientes</button>
          <button class="btn small" data-a="order">Ordenar</button>
        </div>
      </div>`;
    grid.appendChild(card);

    card.querySelector('[data-a="ing"]').onclick = ()=>{
      alert(`${base.name||it.name}\n\nIngredientes:\n- ${(base.ingredients||[]).join('\n- ')}`);
    };
    card.querySelector('[data-a="order"]').onclick = ()=> openModal(it, base);
  });
}

function openModal(item, base){
  const modal = document.getElementById('modal'); modal.classList.add('open');
  const body  = document.getElementById('mBody');
  document.getElementById('mTitle').textContent = item.name + ' · ' + money(item.price);
  document.getElementById('mClose').onclick = ()=> modal.classList.remove('open');

  const sauces = state.menu.extras.sauces;
  const ingr   = state.menu.extras.ingredients;
  const SP     = state.menu.extras.saucePrice;
  const IP     = state.menu.extras.ingredientPrice;
  const DLC    = state.menu.extras.dlcCarneMini || 12;

  body.innerHTML = `
    <div class="field"><label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required/>
    </div>

    ${item.mini ? `
    <div class="field">
      <label>DLC de Carne grande</label>
      <div class="ul-clean">
        <input type="checkbox" id="dlcCarne"/>
        <label for="dlcCarne">Cambia a carne 85g</label>
        <span class="tag">(+${money(DLC)})</span>
      </div>
    </div>` : ''}

    <div class="hr"></div>

    <div class="field">
      <label>Potenciar sabor con un aderezo recomendado (cambio sin costo)</label>
      <select id="swapSauce">
        <option value="">Dejar salsa por defecto</option>
        ${((base.salsasSugeridas||[base.suggested]).filter(Boolean) || []).map(s=>`<option value="${s}">${s}</option>`).join('')}
      </select>
      <div class="muted small">* Cambio de salsa recomendado sin costo. Extras se cobran aparte.</div>
    </div>

    <div class="field"><label>Aderezos extra</label>
      <div class="ul-clean" id="sauces">
        ${sauces.map((s,i)=>`<input type="checkbox" id="s${i}"/><label for="s${i}">${s}</label><span class="tag">(+${money(SP)})</span>`).join('')}
      </div>
    </div>

    <div class="field"><label>Ingredientes extra</label>
      <div class="ul-clean" id="ingrs">
        ${ingr.map((s,i)=>`<input type="checkbox" id="e${i}"/><label for="e${i}">${s}</label><span class="tag">(+${money(IP)})</span>`).join('')}
      </div>
    </div>

    <div class="field"><label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="1"/>
    </div>

    <div class="field"><label>Comentarios a cocina</label>
      <textarea id="notes" placeholder="sin jitomate, poco picante…"></textarea>
    </div>
  `;

  const totalEl = document.getElementById('mTotal');
  const qtyEl   = document.getElementById('qty');
  const inputs  = body.querySelectorAll('input[type=checkbox], #qty, #swapSauce');

  const calc = ()=>{
    const qty = parseInt(qtyEl.value||'1',10);
    const extrasS = [...body.querySelectorAll('#sauces input:checked')].length;
    const extrasI = [...body.querySelectorAll('#ingrs input:checked')].length;
    const dlcOn  = item.mini && body.querySelector('#dlcCarne')?.checked;
    const extraDlc = dlcOn ? DLC : 0;
    const subtotal = (item.price + extraDlc)*qty + (extrasS*SP + extrasI*IP)*qty;
    totalEl.textContent = money(subtotal);
    return { qty, subtotal, dlcOn };
  };
  inputs.forEach(i=> i.addEventListener('change', calc));
  calc();

  document.getElementById('mConfirm').onclick = async ()=>{
    const name = document.getElementById('cName').value.trim();
    if(!name){ alert('Por favor escribe tu nombre.'); return; }
    const { qty, subtotal, dlcOn } = calc();

    const saucesSel = [...body.querySelectorAll('#sauces input')].map((el,i)=> el.checked? sauces[i]: null).filter(Boolean);
    const ingrSel   = [...body.querySelectorAll('#ingrs input')].map((el,i)=> el.checked? ingr[i]: null).filter(Boolean);
    const salsaSwap = document.getElementById('swapSauce').value || null;

    const order = {
      customer: name,
      qty, subtotal,
      item: { id:item.id, name:item.name, price:item.price, mini: !!item.mini },
      baseIngredients: base.ingredients||[],
      salsaDefault: base.salsaDefault || base.suggested || null,
      salsaCambiada: salsaSwap,          // cambio sin costo
      extras: { sauces: saucesSel, ingredients: ingrSel, dlcCarne: dlcOn },
      notes: document.getElementById('notes').value.trim()
    };

    await createOrder(order);
    beep();
    if(item.mini && qty>=3){ toast('¡Logro desbloqueado! 3 minis', '⭐'); }
    toast('Gracias por tu pedido, '+name+' ✨');
    document.getElementById('modal').classList.remove('open');
  };
}
