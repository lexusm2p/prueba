import { onOrdersSnapshot, setStatus } from "../shared/db.js";

// Renderizado de columnas
function renderOrders(list){
  ["pending","progress","ready"].forEach(col=>{
    document.getElementById(`col-${col}`).innerHTML = "";
  });

  list.forEach(o=>{
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <h3>${o.item.name} x${o.qty}</h3>
      <div class="muted">Cliente: ${o.customer}</div>
      <div class="muted">Extras: ${(o.extras.sauces||[]).concat(o.extras.ingredients||[]).join(", ")}</div>
      <p>${o.notes||""}</p>
      <button class="btn small" data-next="progress">Preparar</button>
      <button class="btn small" data-next="ready">Listo</button>
      <button class="btn ghost small" data-next="delivered">Entregado</button>
    `;
    el.querySelectorAll("button").forEach(b=>{
      b.onclick = ()=> setStatus(o.id, b.dataset.next.toUpperCase());
    });

    const col = o.status==="PENDING" ? "pending" :
                o.status==="PROGRESS" ? "progress" : "ready";
    document.getElementById(`col-${col}`).appendChild(el);
  });
}

onOrdersSnapshot(renderOrders);
