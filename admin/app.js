
import { addPurchase, getPurchases, getInventory, setInventory, getArchive, getUsers, setUsers } from '../shared/backend.js';
import { COSTS } from '../data/costs.js';

const tabs = document.querySelectorAll('.tabs button');
const sections = document.querySelectorAll('.tab');
tabs.forEach(b=> b.onclick = ()=>{
  tabs.forEach(x=>x.classList.remove('active')); sections.forEach(s=>s.classList.remove('active'));
  b.classList.add('active'); document.getElementById(b.dataset.tab).classList.add('active');
});

// Compras
const listCompras = document.querySelector('#listCompras');
function renderCompras(){
  const arr = getPurchases().slice().reverse();
  listCompras.innerHTML = arr.map(p=>`<div class="card"><div class="row"><b>${p.item}</b><span>${p.qty} @ $${p.unit}</span></div><small>${new Date(p.ts).toLocaleString()}</small></div>`).join('') || '<small>Sin compras</small>';
}
document.querySelector('#add').onclick = ()=>{
  const item = document.querySelector('#item').value.trim();
  const qty = Number(document.querySelector('#qty').value||0);
  const unit = Number(document.querySelector('#unit').value||0);
  if(!item || !qty || !unit) return alert('Completa todos los campos');
  addPurchase({item, qty, unit});
  document.querySelector('#item').value=''; document.querySelector('#qty').value=''; document.querySelector('#unit').value='';
  renderCompras(); renderInventario();
};
renderCompras();

// Inventario (simple key/value)
const invEl = document.querySelector('#inv');
function renderInventario(){
  const inv = getInventory();
  invEl.innerHTML = Object.keys(inv).sort().map(k=>`<div class="card"><div class="row"><b>${k}</b><span>${inv[k]}</span></div></div>`).join('') || '<small>Sin inventario</small>';
}
renderInventario();

// Finanzas
const finEl = document.querySelector('#fin');
function renderFinanzas(){
  const arch = getArchive();
  let ventas=0, costo=0, utilidad=0;
  arch.forEach(o=>{
    ventas += Number(o.total||0);
    const name = o.itemName;
    let c=0;
    c += (COSTS.burgers[name] || COSTS.minis[name] || COSTS.combo[name] || 0);
    c += (o.aderezos?.length||0) * (COSTS.aderezo||0);
    for (const x of o.extras||[]) c += (COSTS.extras[x]||0);
    costo += c;
  });
  utilidad = ventas - costo;
  finEl.innerHTML = `<div class="card"><div>Ventas: <b>$${ventas.toFixed(2)}</b></div><div>Costos: <b>$${costo.toFixed(2)}</b></div><div>Utilidad: <b>$${utilidad.toFixed(2)}</b></div></div>`;
}
renderFinanzas();

// Usuarios
const usersEl = document.querySelector('#users');
function renderUsers(){
  const list = getUsers();
  usersEl.innerHTML = list.map((u,i)=>`<div class="card"><div class="row"><b>${u.name}</b><span>${u.role}</span></div><div>PIN: ${u.pin}</div></div>`).join('');
}
renderUsers();
