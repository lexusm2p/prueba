import { subscribeRecentOrders, subscribeInventory, setInventoryItem, addPurchase, setConfig, getConfig } from '../lib/firebase.js';
import { MENU, MINIS, SAUCES, EXTRAS, DEFAULT_COSTS } from '../lib/menu.js';

const panel = document.querySelector('#panel');
const tabs = document.querySelectorAll('.tab');
tabs.forEach(t=>t.addEventListener('click',()=>{
  tabs.forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  load(t.dataset.tab);
}));

let ORDERS = [];
let INV = {};
let COSTS = {...DEFAULT_COSTS};

// Suscripciones
subscribeRecentOrders((snap)=>{ ORDERS = snap.docs.map(d=>({id:d.id,...d.data()})); if(current==='ventas') renderVentas(); });
subscribeInventory((snap)=>{ INV={}; snap.forEach(d=>INV[d.id]=d.data()); if(current==='inventario') renderInventario(); });
// Cargar costos desde config
(async ()=>{
  const doc = await getConfig('costs');
  if(doc.exists()) COSTS = { ...COSTS, ...doc.data() };
})();

let current='ventas';
load('ventas');

function load(tab){
  current = tab;
  if(tab==='ventas') renderVentas();
  if(tab==='inventario') renderInventario();
  if(tab==='recetario') renderRecetario();
  if(tab==='compras') renderCompras();
  if(tab==='ajustes') renderAjustes();
}

// --------- Ventas ---------
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
function isToday(ts){ if(!ts) return false; const d=new Date(ts.seconds*1000); const n=new Date(); return d.toDateString()===n.toDateString(); }
function isLast7(ts){ if(!ts) return false; const d=new Date(ts.seconds*1000); const n=new Date(); const diff=(n-d)/86400000; return diff<=7; }

function renderVentas(){
  const today = ORDERS.filter(o=>isToday(o.createdAt));
  const week = ORDERS.filter(o=>isLast7(o.createdAt));
  const totalToday = sum(today.map(o=>o.total||0));
  const totalWeek = sum(week.map(o=>o.total||0));
  const ticketsToday = today.length;
  const avgToday = ticketsToday? (totalToday/ticketsToday).toFixed(2):'0.00';

  const last = ORDERS.slice(0,20).map(o=>`
    <tr><td>${o.customer||'-'}</td><td>${o.status}</td><td>$${o.total||0}</td><td>${o.createdAt? new Date(o.createdAt.seconds*1000).toLocaleString() : '-'}</td></tr>
  `).join('');

  panel.innerHTML = `
    <h3>Resumen de ventas</h3>
    <div class="grid cols-3">
      <div class="card"><h4>Hoy</h4><p>$${totalToday.toFixed(2)}</p><p class="small dim">Tickets: ${ticketsToday} · Ticket prom: $${avgToday}</p></div>
      <div class="card"><h4>Últimos 7 días</h4><p>$${totalWeek.toFixed(2)}</p></div>
      <div class="card"><h4>Órdenes totales</h4><p>${ORDERS.length}</p></div>
    </div>
    <h4>Últimos pedidos</h4>
    <table class="table"><thead><tr><th>Cliente</th><th>Estado</th><th>Total</th><th>Fecha</th></tr></thead><tbody>${last||'<tr><td colspan="4" class="dim">Sin datos</td></tr>'}</tbody></table>
  `;
}

// --------- Inventario ---------
function renderInventario(){
  const items = Object.entries(INV).map(([id,row])=>`
    <tr>
      <td>${id}</td>
      <td><input type="number" data-id="${id}" data-k="stock" value="${row.stock||0}"></td>
      <td><input type="number" data-id="${id}" data-k="min" value="${row.min||0}"></td>
      <td><input type="number" data-id="${id}" data-k="unitCost" value="${row.unitCost||0}"></td>
    </tr>`).join('');
  panel.innerHTML = `
    <h3>Inventario</h3>
    <p class="small dim">Edita y presiona "Guardar".</p>
    <table class="table"><thead><tr><th>Item</th><th>Stock</th><th>Mínimo</th><th>Costo unit</th></tr></thead><tbody>${items||'<tr><td colspan="4" class="dim">Sin datos</td></tr>'}</tbody></table>
    <div class="actions"><button id="seed" class="btn ghost">Cargar básicos</button><button id="save" class="btn">Guardar</button></div>
  `;
  panel.querySelector('#save').onclick = async ()=>{
    const inputs = panel.querySelectorAll('input[data-id]');
    for(const el of inputs){
      await setInventoryItem(el.dataset.id, { [el.dataset.k]: Number(el.value) });
    }
    alert('Inventario actualizado');
  };
  panel.querySelector('#seed').onclick = async ()=>{
    const basics = {
      pan:{stock:30,min:12,unitCost:10/6},
      carne85g:{stock:50,min:20,unitCost:10},
      quesoAmarillo:{stock:50,min:20,unitCost:195/40},
      quesoBlanco:{stock:50,min:20,unitCost:12/8},
      lechuga:{stock:12,min:6,unitCost:30/12},
      jitomateRodaja:{stock:60,min:24,unitCost:3/6},
      cebollaAro:{stock:60,min:24,unitCost:10/12},
      piñaRodaja:{stock:20,min:10,unitCost:2.5},
      tocinoTira:{stock:80,min:30,unitCost:235/40},
      jamonReb:{stock:40,min:20,unitCost:3.66},
      salchichaPorcion:{stock:40,min:20,unitCost:5.5/2},
      salsaBase20ml:{stock:200,min:80,unitCost:0.5},
      bote1oz:{stock:100,min:40,unitCost:0.6},
    };
    for(const [id,row] of Object.entries(basics)){ await setInventoryItem(id,row); }
    alert('Básicos cargados');
  };
}

// --------- Recetario ---------
function renderRecetario(){
  const cards = [...MENU, ...MINIS].map(m=>`
    <div class="card">
      <h4>${m.name} <span class="badge">$${m.price}</span></h4>
      <div class="small dim">${m.ingredients? m.ingredients.join(', ') : m.desc||''}</div>
    </div>`).join('');
  panel.innerHTML = `<h3>Recetario / Fichas</h3><div class="grid">${cards}</div>`;
}

// --------- Compras ---------
function renderCompras(){
  panel.innerHTML = `
    <h3>Registrar compra</h3>
    <div class="grid">
      <label>Item (ID exacto de inventario) <input id="item"></label>
      <label>Cantidad <input id="qty" type="number" value="1"></label>
      <label>Costo total <input id="cost" type="number" value="0"></label>
      <button id="save" class="btn">Registrar y sumar a inventario</button>
    </div>
    <p class="small dim">Tip: IDs comunes: pan, carne85g, quesoAmarillo, quesoBlanco, lechuga, jitomateRodaja, cebollaAro, piñaRodaja, tocinoTira, jamonReb, salchichaPorcion, salsaBase20ml, bote1oz.</p>
  `;
  panel.querySelector('#save').onclick = async ()=>{
    const item = panel.querySelector('#item').value.trim();
    const qty = Number(panel.querySelector('#qty').value||0);
    const cost = Number(panel.querySelector('#cost').value||0);
    if(!item || qty<=0) return alert('Completa los datos');
    await addPurchase({ item, qty, cost });
    // actualizar inventario sumando
    await setInventoryItem(item, { stock: ( (window._invSnap?.[item]?.stock)||0 ) + qty, unitCost: cost/qty });
    alert('Compra registrada');
  };
}

// --------- Ajustes ---------
function renderAjustes(){
  panel.innerHTML = `
    <h3>Costos y precios</h3>
    <div class="grid">
      ${Object.entries(COSTS).map(([k,v])=>`
        <label>${k} <input data-k="${k}" type="number" step="0.01" value="${Number(v).toFixed(2)}"></label>
      `).join('')}
    </div>
    <div class="actions"><button id="save" class="btn">Guardar</button></div>
    <p class="small dim">Estos costos se usan para COGS estimado. Puedes afinarlos conforme cambien tus proveedores.</p>
  `;
  panel.querySelector('#save').onclick = async ()=>{
    const inputs = panel.querySelectorAll('input[data-k]');
    const data = {}; inputs.forEach(i=> data[i.dataset.k] = Number(i.value));
    await setConfig('costs', data);
    alert('Costos guardados');
  };
}
