import { createOrder } from "../shared/db.js";
import { toast, beep } from "../shared/notify.js";
import { MENU } from "../shared/menu-data.js";

// --- Estado ---
let cart = [];

// --- Renderizar menú ---
function renderMenu() {
  const container = document.getElementById("menu");
  container.innerHTML = "";

  MENU.forEach(item => {
    const card = document.createElement("div");
    card.className = "card pixel-card";

    card.innerHTML = `
      <h3>${item.nombre}</h3>
      <p class="precio">$${item.precio}</p>
      <button class="btn-order" data-id="${item.id}">Ordenar</button>
    `;

    container.appendChild(card);
  });

  // Botones de ordenar
  document.querySelectorAll(".btn-order").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      openModal(id);
    });
  });
}

// --- Modal de pedido ---
function openModal(id) {
  const item = MENU.find(b => b.id === id);
  const modal = document.getElementById("modal");
  const body = modal.querySelector(".modal-body");

  // Ingredientes + cambio de salsa
  let extrasHTML = `
    <h4>Ingredientes base:</h4>
    <ul>${item.ingredientes.map(i => `<li>${i}</li>`).join("")}</ul>

    <h4>¿Quieres potenciar el sabor?</h4>
    <p>Salsa sugerida: <strong>${item.salsaSugerida}</strong> (sin costo)</p>

    <select id="salsaCambio">
      <option value="">Mantener sugerida</option>
      ${MENU.salsas.map(s =>
        `<option value="${s}">${s}</option>`
      ).join("")}
    </select>

    <h4>Extras de sabor</h4>
    ${MENU.aderezos.map(a =>
      `<label><input type="checkbox" value="${a}" data-precio="5"> ${a} (+$5)</label><br>`
    ).join("")}

    <h4>Extras de proteína</h4>
    <label><input type="checkbox" id="carneExtra" data-precio="17"> Carne extra (+$17)</label><br>
    ${item.tipo === "mini" ? `<label><input type="checkbox" id="dlc" data-precio="12"> DLC: carne grande (+$12)</label>` : ""}
  `;

  body.innerHTML = `
    <h3>${item.nombre} - $${item.precio}</h3>
    ${extrasHTML}
    <div class="total">Total: <span id="totalPrecio">$${item.precio}</span></div>
    <button id="confirmarPedido">Confirmar pedido</button>
  `;

  // Evento confirmar
  body.querySelector("#confirmarPedido").addEventListener("click", () => {
    confirmarPedido(item);
  });

  // Eventos recalcular total
  body.querySelectorAll("input[type=checkbox], select").forEach(el => {
    el.addEventListener("change", () => updateTotal(item));
  });

  modal.classList.add("show");
}

// --- Calcular total ---
function updateTotal(item) {
  let total = item.precio;

  // Extras marcados
  document.querySelectorAll("#modal input[type=checkbox]:checked").forEach(chk => {
    total += parseInt(chk.dataset.precio);
  });

  document.getElementById("totalPrecio").innerText = `$${total}`;
}

// --- Confirmar pedido ---
async function confirmarPedido(item) {
  const modal = document.getElementById("modal");
  let total = item.precio;
  let extras = [];

  // Revisar cambios
  const salsaCambio = modal.querySelector("#salsaCambio").value;
  if (salsaCambio) {
    extras.push("Cambio de salsa: " + salsaCambio);
  }

  modal.querySelectorAll("input[type=checkbox]:checked").forEach(chk => {
    extras.push(chk.value);
    total += parseInt(chk.dataset.precio);
  });

  const pedido = {
    nombre: item.nombre,
    base: item.ingredientes,
    extras,
    precio: total,
    mesa: null, // kiosk no asigna mesa
    createdAt: new Date()
  };

  await createOrder(pedido);
  toast("Pedido agregado", {star:true});
  beep();
  closeModal();
}

// --- Cerrar modal ---
function closeModal() {
  document.getElementById("modal").classList.remove("show");
}

// --- Inicio ---
document.getElementById("modal").addEventListener("click", e => {
  if (e.target.id === "modal") closeModal();
});

renderMenu();
