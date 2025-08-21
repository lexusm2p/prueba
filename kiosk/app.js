// kiosk/app.js
import { beep, toast } from '../shared/notify.js';
import { createOrder } from '../shared/db.js';

const state = { menu: null, mode: 'mini', taps: 0, tapTimer: null };

// --------- BRAND SECRET (7 taps) ----------
const brand = document.getElementById('brandTap');
brand.addEventListener('click', () => {
  state.taps++;
  if (state.tapTimer) clearTimeout(state.tapTimer);
  state.tapTimer = setTimeout(() => { state.taps = 0; }, 2000);
  if (state.taps >= 7) {
    document.getElementById('navRoles').style.display = 'flex';
    toast('Modo staff desbloqueado 🔓');
    state.taps = 0;
  }
});

// --------- SWITCH DE MODO ----------
document.getElementById('btnMinis').onclick = () => { state.mode = 'mini'; renderCards(); }
document.getElementById('btnBig').onclick   = () => { state.mode = 'big';  renderCards(); }

// --------- CARGA MENÚ ----------
async function loadMenu() {
  const res = await fetch('../data/menu.json', { cache: 'no-store' });
  state.menu = await res.json();
  renderCards();
}
function money(n) { return '$' + Number(n || 0).toFixed(0); }

// --------- LISTA DE TARJETAS ----------
function renderCards() {
  const grid = document.getElementById('cards'); grid.innerHTML = '';
  if (!state.menu) return;

  const items = state.mode === 'mini' ? state.menu.minis : state.menu.burgers;

  items.forEach(it => {
    const base = it.baseOf ? state.menu.burgers.find(b => b.id === it.baseOf) : it;
    const card = document.createElement('div'); card.className = 'card';

    const ingPreview = (base.ingredients || []).join(', ');
    const preview = ingPreview.length > 120 ? (ingPreview.slice(0, 117) + '…') : ingPreview;

    card.innerHTML = `
      <h3>${it.name}</h3>
      <div class="muted small">${preview}</div>
      <div class="row">
        <div class="price">${money(it.price)}</div>
        <div class="row" style="gap:8px">
          <button class="btn ghost small" data-a="ing">Ingredientes</button>
          <button class="btn small" data-a="order">Ordenar</button>
        </div>
      </div>
    `;
    grid.appendChild(card);

    card.querySelector('[data-a="ing"]').onclick   = () => alert(`${base.name || it.name}\n\nIngredientes:\n- ${(base.ingredients || []).join('\n- ')}`);
    card.querySelector('[data-a="order"]').onclick = () => openModal(it, base);
  });
}

// --------- MODAL DE ORDEN ----------
function openModal(item, base) {
  const modal = document.getElementById('modal'); modal.classList.add('open');
  const body  = document.getElementById('mBody');
  document.getElementById('mTitle').textContent = `${item.name} · ${money(item.price)}`;
  document.getElementById('mClose').onclick     = () => modal.classList.remove('open');

  const sauces = state.menu.extras.sauces;
  const ingr   = state.menu.extras.ingredients; // [{name,price}]
  const SP     = state.menu.extras.saucePrice;
  const DLC    = state.menu.extras.dlcPattyPrice || 20; // DLC Carne grande

  body.innerHTML = `
    <div class="field">
      <label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required />
    </div>

    <div class="field">
      <label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="1" />
    </div>

    ${item.mini ? `
      <div class="field">
        <label>Mejora (DLC)</label>
        <div class="ul-clean">
          <input type="checkbox" id="dlcPatty" />
          <label for="dlcPatty">DLC de Carne grande</label>
          <span class="tag">(+${money(DLC)})</span>
        </div>
      </div>
    ` : ''}

    <div class="hr"></div>

    <div class="field">
      <label>Aderezos extra</label>
      <div class="ul-clean" id="sauces">
        ${sauces.map((s, i) => `
          <input type="checkbox" id="s${i}" />
          <label for="s${i}">${s}</label>
          <span class="tag">(+${money(SP)})</span>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label>Ingredientes extra</label>
      <div class="ul-clean" id="ingrs">
        ${ingr.map((o, i) => `
          <input type="checkbox" id="e${i}" data-price="${o.price}" />
          <label for="e${i}">${o.name}</label>
          <span class="tag">(+${money(o.price)})</span>
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
  const inputs  = body.querySelectorAll('input[type=checkbox], #qty');

  const calc = () => {
    const qty = parseInt(qtyEl.value || '1', 10);

    // DLC de carne grande (solo minis)
    const dlc = item.mini && body.querySelector('#dlcPatty')?.checked ? DLC : 0;

    // Suma de aderezos extra (precio fijo SP)
    const extrasS = [...body.querySelectorAll('#sauces input:checked')].length * SP;

    // Suma de ingredientes extra por precio individual
    const extrasI = [...body.querySelectorAll('#ingrs input:checked')]
      .reduce((sum, el) => sum + Number(el.dataset.price || 0), 0);

    const subtotalUnit = item.price + dlc + extrasS + extrasI;
    const subtotal     = subtotalUnit * qty;

    totalEl.textContent = money(subtotal);
    return { qty, subtotal, dlcApplied: dlc > 0 };
  };

  inputs.forEach(i => i.addEventListener('change', calc));
  calc();

  document.getElementById('mConfirm').onclick = async () => {
    const name = document.getElementById('cName').value.trim();
    if (!name) { alert('Por favor escribe tu nombre.'); return; }

    const { qty, subtotal, dlcApplied } = calc();

    const saucesSel = [...body.querySelectorAll('#sauces input')]
      .map((el, i) => el.checked ? sauces[i] : null)
      .filter(Boolean);

    const ingrSel = [...body.querySelectorAll('#ingrs input')]
      .map((el, i) => el.checked ? { name: ingr[i].name, price: ingr[i].price } : null)
      .filter(Boolean);

    const surprise = document.getElementById('surprise').value === 'si';

    const order = {
      customer: name,
      items: [{
        id: item.id,
        name: dlcApplied && item.mini ? `${item.name} (DLC carne grande)` : item.name,
        price: item.price,
        qty,
        mini: !!item.mini
      }],
      baseIngredients: base.ingredients || [],
      suggested: base.suggested || item.suggested || null,
      extras: {
        sauces: saucesSel,
        ingredients: ingrSel,
        surprise,
        dlc: dlcApplied ? { name: 'DLC de Carne grande', price: DLC } : null
      },
      notes: document.getElementById('notes').value.trim(),
      total: subtotal
    };

    await createOrder(order);
    beep();
    if (item.mini && qty >= 3) { toast('¡Logro desbloqueado! 3 minis ⭐', '⭐'); }
    toast('Gracias por tu pedido, ' + name + ' ✨');
    document.getElementById('modal').classList.remove('open');
  };
}

loadMenu();
