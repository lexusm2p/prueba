// Kiosko — UI de tarjetas con icono + modal de compra
// - Muestra icono pixelado por producto (sin listar ingredientes en la tarjeta)
// - Botón "Ingredientes" abre un pop-up simple con la lista
// - Modal corrige el total ($0) y recalcula siempre
// - 7 toques al logo revelan el nav de roles

import { beep, toast } from '../shared/notify.js';
import { createOrder } from '../shared/db.js';

const state = { menu: null, mode: 'mini', taps: 0 };

// ---- easter egg: 7 taps para mostrar navegación interna ----
const brand = document.getElementById('brandTap');
brand.addEventListener('click', () => {
  state.taps++;
  if (state.taps >= 7) {
    document.getElementById('navRoles').style.display = 'flex';
  }
  // ventana corta para contar taps
  setTimeout(() => (state.taps = 0), 900);
});

// ---- tabs minis / grandes ----
document.getElementById('btnMinis').onclick = () => {
  state.mode = 'mini';
  renderCards();
};
document.getElementById('btnBig').onclick = () => {
  state.mode = 'big';
  renderCards();
};

// ---- carga de menú ----
async function loadMenu() {
  const res = await fetch('../data/menu.json', { cache: 'no-store' });
  state.menu = await res.json();
  renderCards();
}
loadMenu();

const money = (n) => '$' + Number(n || 0).toFixed(0);

// Mapa opcional: asociar id -> icono pixelado (sube tus PNGs a /assets/icons/)
const ICONS = {
  // big
  starter: '../assets/icons/starter.png',
  koopa: '../assets/icons/koopa.png',
  fatality: '../assets/icons/fatality.png',
  mega: '../assets/icons/mega.png',
  hadouken: '../assets/icons/hadouken.png',
  nintendo: '../assets/icons/nintendo.png',
  finalboss: '../assets/icons/finalboss.png',
  // minis
  starter_m: '../assets/icons/starter.png',
  koopa_m: '../assets/icons/koopa.png',
  fatality_m: '../assets/icons/fatality.png',
  mega_m: '../assets/icons/mega.png'
};
const FALLBACK_ICON = '../assets/icons/burger.png'; // si faltara algún icono

// ---- render de tarjetas (sin ingredientes en la tarjeta) ----
function renderCards() {
  if (!state.menu) return;
  const grid = document.getElementById('cards');
  grid.innerHTML = '';

  const items = state.mode === 'mini' ? state.menu.minis : state.menu.burgers;

  items.forEach((it) => {
    const base = it.baseOf
      ? state.menu.burgers.find((b) => b.id === it.baseOf)
      : it;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${it.name}</h3>
      <div class="icon-wrap">
        <img class="icon" src="${ICONS[it.id] || ICONS[base.id] || FALLBACK_ICON}" alt="${it.name}">
      </div>
      <div class="row">
        <div class="price">${money(it.price)}</div>
        <div class="row" style="gap:8px">
          <button class="pill" data-a="ing">Ingredientes</button>
          <button class="btn small" data-a="order">Ordenar</button>
        </div>
      </div>
    `;
    grid.appendChild(card);

    // ver ingredientes (popup simple)
    card.querySelector('[data-a="ing"]').onclick = () => {
      const list = (base.ingredients || []).map((x) => `• ${x}`).join('\n');
      alert(`${base.name || it.name}\n\nIngredientes:\n${list}`);
    };

    // abrir modal de compra
    card.querySelector('[data-a="order"]').onclick = () => openModal(it, base);
  });
}

// ---- modal de compra ----
function openModal(item, base) {
  const modal = document.getElementById('modal');
  modal.classList.add('open');

  const body = document.getElementById('mBody');
  const title = document.getElementById('mTitle');
  const totalEl = document.getElementById('mTotal');

  title.textContent = `${item.name} · ${money(item.price)}`;
  document.getElementById('mClose').onclick = () => modal.classList.remove('open');

  const sauces = state.menu.extras.sauces;
  const ingr = state.menu.extras.ingredients;
  const SP = Number(state.menu.extras.saucePrice || 0);
  const IP = Number(state.menu.extras.ingredientPrice || 0);

  body.innerHTML = `
    <div class="field">
      <label>Tu nombre</label>
      <input id="cName" type="text" placeholder="Escribe tu nombre" required/>
    </div>

    <div class="field">
      <label>Cantidad</label>
      <input id="qty" type="number" min="1" max="9" value="1"/>
    </div>

    <div class="hr"></div>

    <div class="field">
      <label>Aderezos extra</label>
      <div class="ul-clean" id="sauces">
        ${sauces
          .map(
            (s, i) =>
              `<input type="checkbox" id="s${i}"/><label for="s${i}">${s}</label><span class="tag">(+${money(SP)})</span>`
          )
          .join('')}
      </div>
    </div>

    <div class="field">
      <label>Ingredientes extra</label>
      <div class="ul-clean" id="ingrs">
        ${ingr
          .map(
            (s, i) =>
              `<input type="checkbox
