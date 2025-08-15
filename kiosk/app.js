// kiosk/app.js — stub mínimo para renderizar algo
const card = document.querySelector('.card');
card.innerHTML = `
  <h1>🍔 Kiosko OK</h1>
  <p>La app se cargó y ya puedo escribir en el DOM.</p>
  <button id="goMinis">Minis & Combos</button>
  <button id="goBig">Hamburguesas grandes</button>
`;function renderCards(list, host){
  host.innerHTML = list.map(p => `
    <div class="card">
      <div class="title">${p.name}</div>
      <div class="price">$${p.price}</div>
      <button data-id="${p.id}">Ordenar</button>
    </div>
  `).join('');
  host.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const product = [...MINIS, ...MENU].find(x => x.id===id);
      openSingle(product);
    });
  });
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

function openSingle(product){
  const modal    = document.getElementById('modal');
  const modalBody= document.getElementById('modalBody');
  const closeBtn = document.getElementById('closeModal');

  const aderezosHtml = renderOptGrid(SAUCES);
  const extrasHtml   = renderOptGrid(EXTRAS);

  modalBody.innerHTML = `
    <h3>${product.name}</h3>
    <div class="row grid">
      <label>Cantidad <input id="qty" type="number" min="1" value="1"></label>
      <label>Tu nombre (opcional) <input id="cust" type="text" placeholder="Jugador 1"></label>
    </div>

    <div class="row"><strong>¿Quieres que te sorprendamos con una nueva configuración (aderezo)?</strong><br>
      <label><input type="checkbox" id="surprise"> Sí, sorpréndeme</label>
    </div>

    <div class="row">
      <h4>Aderezos extra (+$5 c/u)</h4>
      ${aderezosHtml}
    </div>
    <div class="row">
      <h4>Ingredientes extra</h4>
      ${extrasHtml}
    </div>

    <div class="row"><label>Notas para cocina <input id="notes" type="text" placeholder="Sin jitomate..."></label></div>

    <div id="totalBar" class="totalBar">
      <div><strong>Total: <span id="liveTotal">$0</span></strong></div>
      <button id="btnConfirm" class="btn-primary">Confirmar</button>
    </div>
  `;

  modal.classList.remove('hidden');
  closeBtn.onclick = ()=> modal.classList.add('hidden');

  const qtyEl = document.getElementById('qty');
  const liveTotal = document.getElementById('liveTotal');
  const surpriseEl= document.getElementById('surprise');
  const adChecks = [...modalBody.querySelectorAll('.opt-input')].filter(x => SAUCES.some(s=>s.id===x.dataset.id));
  const exChecks = [...modalBody.querySelectorAll('.opt-input')].filter(x => EXTRAS.some(s=>s.id===x.dataset.id));
  let showedCombo = false;

  function extrasPerUnit(){
    let s = 0;
    [...adChecks, ...exChecks].forEach(cb => { if(cb.checked) s += Number(cb.dataset.price||0); });
    return s;
  }
  function renderTotal(){
    const qty = Math.max(1, Number(qtyEl.value||1));
    const isMini = !!product.isMini;
    const base = product.price * qty;
    const extras = extrasPerUnit() * qty;
    const discount = isMini ? Math.floor(qty/3)*7 : 0;
    liveTotal.textContent = `$${base + extras - discount}`;
    if (discount>0 && !showedCombo){ showedCombo=true; toast('¡Logro desbloqueado! Combo 3 minis aplicado', {icon:'⭐'}); beep(); }
    if (discount===0) showedCombo=false;
  }
  [qtyEl, ...adChecks, ...exChecks, surpriseEl].forEach(el => el.addEventListener('input', renderTotal));
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
      customer, total,
      items: [{
        id: product.id, name: product.name, qty,
        baseIngredients: product.base || [],
        aderezos: adSel, extras: exSel,
        surprise: !!surpriseEl.checked, notes
      }]
    };
    await createOrder(payload);
    modal.classList.add('hidden');
    toast('Pedido enviado.', {icon:'🛎️'});
  };
}

// --- Mix & Match de minis ---
function openMixMatch(){
  const modal    = document.getElementById('modal');
  const modalBody= document.getElementById('modalBody');
  const closeBtn = document.getElementById('closeModal');

  const rows = MINIS.map(m => `
    <div class="mix-row" data-mini="${m.id}">
      <div>${m.name} <span style="opacity:.7">($${m.price})</span></div>
      <div class="qty">
        <label>Cant.</label>
        <input type="number" min="0" value="0" data-qty>
      </div>
    </div>
  `).join('');

  const aderezosHtml = renderOptGrid(SAUCES);
  const extrasHtml   = renderOptGrid(EXTRAS);

  modalBody.innerHTML = `
    <h3>Combo Minis · Mix & Match</h3>
    <div class="row"><label>Tu nombre (opcional) <input id="cust" type="text" placeholder="Jugador 1"></label></div>
    <div class="row">${rows}</div>

    <div class="row">
      <h4>Aderezos extra (se aplican a todas) +$5 c/u</h4>
      ${aderezosHtml}
    </div>
    <div class="row">
      <h4>Ingredientes extra (se aplican a todas)</h4>
      ${extrasHtml}
    </div>

    <div class="row"><label>Notas para cocina <input id="notes" type="text" placeholder="Todas sin jitomate..."></label></div>

    <div id="totalBar" class="totalBar">
      <div><strong>Total: <span id="liveTotal">$0</span></strong></div>
      <button id="btnConfirm" class="btn-primary">Confirmar</button>
    </div>
  `;

  modal.classList.remove('hidden');
  closeBtn.onclick = ()=> modal.classList.add('hidden');

  const qtyEls = [...modalBody.querySelectorAll('[data-qty]')];
  const adChecks = [...modalBody.querySelectorAll('.opt-input')].filter(x => SAUCES.some(s=>s.id===x.dataset.id));
  const exChecks = [...modalBody.querySelectorAll('.opt-input')].filter(x => EXTRAS.some(s=>s.id===x.dataset.id));
  const liveTotal = document.getElementById('liveTotal');
  let showedCombo = false;

  function extrasPerUnit(){
    let s = 0; [...adChecks, ...exChecks].forEach(cb=>{ if(cb.checked) s += Number(cb.dataset.price||0); });
    return s;
  }
  function renderTotal(){
    const counts = qtyEls.map((el,i)=> ({ mini: MINIS[i], qty: Math.max(0, Number(el.value||0)) }));
    const totalMinis = counts.reduce((s,x)=>s+x.qty,0);
    let base = counts.reduce((s,x)=> s + x.qty * x.mini.price, 0);
    let extras = totalMinis * extrasPerUnit();
    const discount = Math.floor(totalMinis/3) * 7;
    liveTotal.textContent = `$${base + extras - discount}`;
    if (discount>0 && !showedCombo){ showedCombo=true; toast('¡Logro desbloqueado! Combo 3 minis aplicado', {icon:'⭐'}); beep(); }
    if (discount===0) showedCombo=false;
  }
  [...qtyEls, ...adChecks, ...exChecks].forEach(el => el.addEventListener('input', renderTotal));
  renderTotal();

  document.getElementById('btnConfirm').onclick = async ()=>{
    const customer = (document.getElementById('cust').value||'').trim();
    const notes = (document.getElementById('notes').value||'').trim();
    const counts = qtyEls.map((el,i)=> ({ mini: MINIS[i], qty: Math.max(0, Number(el.value||0)) }))
                         .filter(x=>x.qty>0);
    if(counts.length===0){ toast('Elige al menos 1 mini', {icon:'⚠️'}); return; }
    const totalMinis = counts.reduce((s,x)=>s+x.qty,0);
    const discount = Math.floor(totalMinis/3) * 7;
    const adSel = adChecks.filter(x=>x.checked).map(x=> SAUCES.find(s=>s.id===x.dataset.id)?.name );
    const exSel = exChecks.filter(x=>x.checked).map(x=> EXTRAS.find(s=>s.id===x.dataset.id)?.name );
    const total = counts.reduce((s,x)=> s + x.qty * x.mini.price, 0) + totalMinis*extrasPerUnit() - discount;

    const items = counts.map(x => ({
      id: x.mini.id, name: x.mini.name, qty: x.qty,
      baseIngredients: x.mini.base || [],
      aderezos: adSel, extras: exSel, notes
    }));

    await createOrder({ customer, total, items });
    document.getElementById('modal').classList.add('hidden');
    toast('Pedido enviado.', {icon:'🛎️'});
  };
}
