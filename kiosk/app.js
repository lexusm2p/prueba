// kiosk/app.js
// - Carga menú
// - Muestra cards de Minis / Grandes
// - Modal de compra con extras y (si es mini) opción DLC 85g (+$12)
// - Guarda la orden en Firestore vía shared/db.js
// - 7 toques al logo -> muestra navegación oculta

import { beep, toast } from '../shared/notify.js';
import { createOrder } from '../shared/db.js';

const state = { menu:null, mode:'mini', taps:0 };
const brand = document.getElementById('brandTap');

// 7 toques para mostrar navegación oculta
brand.addEventListener('click',()=>{
  state.taps++;
  if(state.taps>=7){
    document.getElementById('navRoles').style.display='flex';
  }
  setTimeout(()=>state.taps=0,1200);
});

// Tabs Minis / Grandes
document.getElementById('btnMinis').onclick = ()=>{state.mode='mini'; renderCards();}
document.getElementById('btnBig').onclick   = ()=>{state.mode='big'; renderCards();}

// Util
const money = (n)=> '$'+Number(n||0).toFixed(0);

// Cargar menú
async function loadMenu(){
  const res = await fetch('../data/menu.json');
  state.menu = await res.json();
  renderCards();
}

// Render de tarjetas
function renderCards(){
  const grid = document.getElementById('cards');
  grid.innerHTML='';
  const items = state.mode==='mini' ? state.menu.minis : state.menu.burgers;

  items.forEach(it=>{
    const base = it.baseOf ? state.menu.burgers.find(b=>b.id===it.baseOf) : it;
    const card = document.createElement('div');
    card.className='card';
    // Dejamos solo nombre + precio + botones (espacio listo para icono pixel si lo agregas)
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

    // Ver ingredientes (diálogo rápido)
    card.querySelector('[data-a="ing"]').onclick = ()=>{
      const lines = (base.ingredients||[]).map(x=>`- ${x}`).join('\n');
      alert(`${base.name||it.name}\n\nIngredientes:\n${lines}`);
    };

    // Abrir modal de orden
    card.querySelector('[data-a="order"]').onclick = ()=> openModal(it, base);
  });
}

// Modal de compra
function openModal(item, base){
  const modal = document.getElementById('modal');
  modal.classList.add('open');
  const body = document.getElementById('mBody');
  document.getElementById('mTitle').textContent = `${item.name} · ${money(item.price)}`;
  document.getElementById('mClose').onclick = ()=> modal.classList.remove('open');

  // Extras
  const sauces = state.menu.extras.sauces;
  const SP = state.menu.extras.saucePrice;
  // ingredientes como objetos con {name, price} (si no, cae al default)
  const ingr = state.menu.extras.ingredients || [];
  const IP_DEF = state.menu.extras.ingredientPriceDefault || 5;

  // DLC (solo minis)
  const allowDLC = !!item.mini && !!item.allowDLC;
  const dlcLabel = state.menu.dlc?.label || 'DLC de carne grande (85g)';
  const dlcPrice = Number(state.menu.dlc?.price ?? 12);

  // Construir la UI del modal
  body.innerHTML = `
    <div class="field">
      <label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required/>
    </div>

    <div class="field">
      <label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="1"/>
    </div>

    ${allowDLC ? `
    <div class="field">
      <label>${dlcLabel}</label>
      <div class="row" style="gap:8px;align-items:center">
        <input type="checkbox" id="dlcToggle"/>
        <span class="tag">(+${money(dlcPrice)} c/u)</span>
      </div>
    </div>
    ` : ''}

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
        ${ingr.map((o,i)=>{
          const nm = (o && o.name) ? o.name : String(o);
          const pr = (o && typeof o.price==='number') ? o.price : IP_DEF;
          return `
            <input type="checkbox" id="e${i}"/>
            <label for="e${i}">${nm}</label>
            <span class="tag">(+${money(pr)})</span>
          `;
        }).join('')}
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

  // Cálculo total
  const totalEl = document.getElementById('mTotal');
  const qtyEl = document.getElementById('qty');
  const dlcEl = document.getElementById('dlcToggle');
  const checkInputs = body.querySelectorAll('input[type=checkbox], #qty');

  const calc = ()=>{
    const qty = parseInt(qtyEl.value||'1',10);
    const extrasS = [...body.querySelectorAll('#sauces input:checked')].length;
    // contar ingredientes extra y sumar sus precios (pueden ser distintos)
    const ingChecked = [...body.querySelectorAll('#ingrs input:checked')];
    const ingSum = ingChecked.reduce((acc,el)=>{
      const idx = Number(el.id.replace('e','')); const o = ingr[idx];
      const price = (o && typeof o.price==='number') ? o.price : IP_DEF;
      return acc + price;
    },0);

    const baseSubtotal = item.price * qty;
    const extrasSubtotal = (extrasS * SP + ingSum) * qty;

    const dlcSubtotal = (allowDLC && dlcEl?.checked) ? (dlcPrice * qty) : 0;

    const subtotal = baseSubtotal + extrasSubtotal + dlcSubtotal;
    totalEl.textContent = money(subtotal);
    return { qty, subtotal, dlcOn: !!(allowDLC && dlcEl?.checked) };
  };

  checkInputs.forEach(i=> i.addEventListener('change', calc));
  calc();

  // Confirmar pedido
  document.getElementById('mConfirm').onclick = async ()=>{
    const name = document.getElementById('cName').value.trim();
    if(!name){ alert('Por favor escribe tu nombre.'); return; }

    const {qty, subtotal, dlcOn} = calc();

    const saucesSel = [...body.querySelectorAll('#sauces input')].map((el,i)=> el.checked? sauces[i]: null).filter(Boolean);
    const ingrSel = [...body.querySelectorAll('#ingrs input')].map((el,i)=>{
      const idx = Number(el.id.replace('e','')); const o = ingr[idx];
      return el.checked ? ((o && o.name) ? o.name : String(o)) : null;
    }).filter(Boolean);
    const surprise = document.getElementById('surprise').value==='si';

    // Orden: marcamos DLC para que Cocina lo vea claro
    const order = {
      customer: name,
      qty,
      subtotal,
      item: { id:item.id, name:item.name, price:item.price, mini: !!item.mini },
      baseIngredients: base.ingredients||[],
      suggested: base.suggested || item.suggested || null,
      flags: { dlc85: dlcOn },   // <<<<<< importante para cocina
      extras: { sauces: saucesSel, ingredients: ingrSel, surprise },
      notes: document.getElementById('notes').value.trim()
    };

    await createOrder(order);
    beep();

    if(item.mini && qty>=3){ toast('¡Logro desbloqueado! 3 minis ⭐', '⭐'); }
    toast('Gracias por tu pedido, '+name+' ✨');

    document.getElementById('modal').classList.remove('open');
  };
}

loadMenu();
