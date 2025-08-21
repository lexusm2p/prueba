<script type="module">
import { beep, toast } from '../shared/notify.js';
import { createOrder } from '../shared/db.js';

const state = { menu:null, mode:'mini', taps:0 };

const brand = document.getElementById('brandTap');
brand.addEventListener('click',()=>{
  state.taps++;
  if(state.taps>=7){ document.getElementById('navRoles').style.display='flex'; }
  setTimeout(()=>state.taps=0,900);
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
  const grid = document.getElementById('cards'); grid.innerHTML='';
  const items = state.mode==='mini' ? state.menu.minis : state.menu.burgers;
  items.forEach(it=>{
    const base = it.baseOf ? state.menu.burgers.find(b=>b.id===it.baseOf) : it;
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <h3>${it.name}</h3>
      <div class="row"><div class="price">${money(it.price)}</div>
        <div class="row" style="gap:8px">
          <button class="btn ghost small" data-a="ing">Ingredientes</button>
          <button class="btn small" data-a="order">Ordenar</button>
        </div>
      </div>`;
    grid.appendChild(card);
    card.querySelector('[data-a="ing"]').onclick = ()=> alert(`${base.name||it.name}\n\nIngredientes:\n- ${(base.ingredients||[]).join('\n- ')}`);
    card.querySelector('[data-a="order"]').onclick = ()=> openModal(it, base);
  });
}

function openModal(item, base){
  const modal = document.getElementById('modal'); modal.classList.add('open');
  const body = document.getElementById('mBody');
  document.getElementById('mTitle').textContent = item.name + ' · ' + money(item.price);
  document.getElementById('mClose').onclick = ()=> modal.classList.remove('open');

  // Detectar salsas base/alternativa
  const allSauces = state.menu.extras.sauces;
  const inferDefault = () => {
    const cand = (base.ingredients||[]).find(x => /^aderezo|^salsa/i.test(x.trim()));
    return cand || null;
  };
  const defaultSauce = item.defaultSauce || base.defaultSauce || inferDefault();
  const altList = (item.altSauces && item.altSauces.length ? item.altSauces :
                  (base.altSauces && base.altSauces.length ? base.altSauces :
                  (item.suggested ? [item.suggested] : [])));
  const recommended = altList[0] || null;

  const sauces = allSauces;
  const ingr = state.menu.extras.ingredients;
  const SP = state.menu.extras.saucePrice, IP = state.menu.extras.ingredientPrice;

  body.innerHTML = `
    <div class="field"><label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required/></div>

    <div class="field"><label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="1"/></div>

    ${(defaultSauce || recommended) ? `
    <div class="hr"></div>
    <div class="field">
      <label><b>Cambio de salsa (sin costo)</b></label>
      <div class="ul-clean" style="grid-template-columns:20px 1fr;">
        ${defaultSauce ? `
          <input type="radio" name="baseSauce" id="baseDefault" value="${defaultSauce}" checked>
          <label for="baseDefault">${defaultSauce} (base)</label>`:''}
        ${(recommended && recommended!==defaultSauce) ? `
          <input type="radio" name="baseSauce" id="baseAlt" value="${recommended}">
          <label for="baseAlt">${recommended} (recomendada)</label>`:''}
      </div>
      <div class="muted small">Puedes cambiar la salsa base por la recomendada sin costo.</div>
    </div>` : ''}

    <div class="hr"></div>
    <div class="field"><label>+ Extras de sabor</label>
      <div class="muted small">Potenciar sabor con un aderezo recomendado o añade más.</div>
      <div class="ul-clean" id="sauces">
        ${sauces.map((s,i)=>`
          <input type="checkbox" id="s${i}"/>
          <label for="s${i}">${s}</label>
          <span class="tag">(+${money(SP)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field"><label>Ingredientes extra</label>
      <div class="ul-clean" id="ingrs">
        ${ingr.map((spec,i)=>`
          <input type="checkbox" id="e${i}"/>
          <label for="e${i}">${spec.name || spec}</label>
          <span class="tag">(+${money(spec.price || IP)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field"><label>Comentarios a cocina</label>
      <textarea id="notes" placeholder="sin jitomate, poco picante…"></textarea></div>
  `;

  const totalEl = document.getElementById('mTotal');
  const qtyEl = document.getElementById('qty');
  const inputs = body.querySelectorAll('input[type=checkbox], #qty');

  const calc = ()=>{
    const qty = parseInt(qtyEl.value||'1',10);
    const extrasS = [...body.querySelectorAll('#sauces input:checked')].length;

    // Sumar precios individuales de ingredientes (DLC carne grande = 12, etc.)
    const extrasI = [...body.querySelectorAll('#ingrs input:checked')]
      .map((el,i)=> (ingr[i]&&ingr[i].price) ? Number(ingr[i].price) : IP)
      .reduce((a,b)=>a+b,0);

    const subtotal = (item.price*qty) + ((extrasS*SP)*qty) + (extrasI*qty);
    totalEl.textContent = money(subtotal);
    return {qty, subtotal};
  };
  inputs.forEach(i=> i.addEventListener('change', calc)); calc();

  document.getElementById('mConfirm').onclick = async ()=>{
    const name = document.getElementById('cName').value.trim();
    if(!name){ alert('Por favor escribe tu nombre.'); return; }
    const {qty, subtotal} = calc();

    const saucesSel = [...body.querySelectorAll('#sauces input')].map((el,i)=> el.checked? sauces[i]: null).filter(Boolean);
    const ingrSel = [...body.querySelectorAll('#ingrs input')].map((el,i)=> el.checked? (ingr[i].name || ingr[i]): null).filter(Boolean);

    let chosenBase = defaultSauce || null;
    const baseRad = body.querySelector('input[name="baseSauce"]:checked');
    if(baseRad) chosenBase = baseRad.value;

    const order = {
      customer: name,
      qty, subtotal,
      item: {id:item.id, name:item.name, price:item.price, mini: !!item.mini},
      baseIngredients: base.ingredients||[],
      baseSauce: chosenBase || null,
      suggested: recommended || null,
      extras: {sauces: saucesSel, ingredients: ingrSel},
      notes: document.getElementById('notes').value.trim()
    };
    await createOrder(order); beep();
    if(item.mini && qty>=3){ toast('¡Logro desbloqueado! 3 minis', '⭐'); }
    toast('Gracias por tu pedido, '+name+' ✨');
    document.getElementById('modal').classList.remove('open');
  };
}

loadMenu();
</script>
