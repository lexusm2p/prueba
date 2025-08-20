// admin/app.js
import { ensureAuth, subscribeActiveOrders, ordersCol, purchasesCol, addPurchase, inventoryCol, upsertInventory, adjustStock } from "../lib/firebase.js";
import { RECIPES } from "../lib/recipes.js";
import { getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = sel => document.querySelector(sel);
const tabs = document.querySelectorAll('.tabs button');
const sections = document.querySelectorAll('.tab');

tabs.forEach(b=> b.onclick = ()=>{
  sections.forEach(s=> s.classList.remove('active'));
  $('#tab-'+b.dataset.tab).classList.add('active');
});

ensureAuth().then(()=>{
  // Finanzas
  subscribeActiveOrders(snap => {
    const list = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderFinances(list);
  });
  // Inventario
  loadInventory();
  $('#inv-add').onclick = saveInventory;
  // Compras
  loadPurchases();
  $('#b-save').onclick = savePurchase;
  // Recetas
  renderRecipes();
});

// --- Finanzas: totales por estado & listado corto ---
function renderFinances(list){
  const delivered = list.filter(o=>o.status==='DELIVERED');
  const ready = list.filter(o=>o.status==='READY');
  const inprog = list.filter(o=>o.status==='IN_PROGRESS');
  const pending = list.filter(o=>o.status==='PENDING');
  const sum = a => a.reduce((s,o)=> s + Number(o.total||0), 0);

  $('#fin-cards').innerHTML = `
    <div class="card"><div>Ingresos del día (DELIVERED)</div><div class="kpi">$${sum(delivered)}</div></div>
    <div class="card"><div>Listos por entregar</div><div class="kpi">${ready.length}</div></div>
    <div class="card"><div>En proceso</div><div class="kpi">${inprog.length}</div></div>
  `;

  $('#fin-list').innerHTML = list.slice(0,10).map(o=>{
    const count = (o.items||[]).reduce((s,it)=>s+(it.qty||1),0);
    return `<div class="card">
      <div><strong>${o.customer||'-'}</strong> · ${o.status} · $${o.total||0}</div>
      <div style="opacity:.8">${count} items</div>
    </div>`;
  }).join('');
}

// --- Compras ---
async function loadPurchases(){
  const qy = query(purchasesCol(), orderBy('createdAt','desc'));
  const snap = await getDocs(qy);
  $('#b-list').innerHTML = snap.docs.map(d=>{
    const p = d.data();
    return `<div class="card">${p.item} — ${p.qty} ${p.unit} · $${p.cost}</div>`;
  }).join('');
}
async function savePurchase(){
  const item = $('#b-item').value.trim();
  const qty  = Number($('#b-qty').value||0);
  const unit = $('#b-unit').value.trim();
  const cost = Number($('#b-cost').value||0);
  if(!item || !qty || !unit){ alert('Completa la compra'); return; }
  await addPurchase({ item, qty, unit, cost });
  $('#b-item').value=''; $('#b-qty').value=''; $('#b-unit').value=''; $('#b-cost').value='';
  loadPurchases();
}

// --- Inventario ---
async function loadInventory(){
  const snap = await getDocs(inventoryCol());
  $('#inv-list').innerHTML = snap.docs.map(d=>{
    const it = { id:d.id, ...d.data() };
    const warn = (it.stock||0) < (it.min||0);
    return `<div class="card">
      <div><strong>${it.id}</strong> — stock: <span class="${warn?'bad':'good'}">${it.stock||0}</span> · min:${it.min||0} · max:${it.max||0}</div>
      <div style="margin-top:6px">
        <button data-id="${it.id}" data-a="minus">-1</button>
        <button data-id="${it.id}" data-a="plus">+1</button>
      </div>
    </div>`;
  }).join('') || '<div class="card" style="opacity:.7">Sin insumos</div>';

  document.querySelectorAll('[data-a="minus"]').forEach(b=> b.onclick = async()=>{ await adjustStock(b.dataset.id, -1); loadInventory(); });
  document.querySelectorAll('[data-a="plus"]').forEach(b=> b.onclick = async()=>{ await adjustStock(b.dataset.id, +1); loadInventory(); });
}
async function saveInventory(){
  const id = $('#inv-name').value.trim();
  const stock = Number($('#inv-stock').value||0);
  const min = Number($('#inv-min').value||0);
  const max = Number($('#inv-max').value||0);
  if(!id){ alert('Pon un nombre/ID de ingrediente'); return; }
  await upsertInventory(id, { stock, min, max });
  $('#inv-name').value=''; $('#inv-stock').value=''; $('#inv-min').value=''; $('#inv-max').value='';
  loadInventory();
}

// --- Recetario ---
function renderRecipes(){
  $('#rec-list').innerHTML = RECIPES.map(r=>{
    const body = r.versiones.map(v=>{
      const ing = v.ingredientes.map(i=>`${i.i}: ${i.q}${i.u}`).join('<br>');
      const pasos = (v.pasos||[]).map(p=>`• ${p}`).join('<br>');
      return `<div class="card"><div><strong>${v.ml} ml</strong></div><div>${ing}</div><div style="margin-top:6px;opacity:.9">${pasos}</div></div>`;
    }).join('');
    return `<div class="card">
      <div style="font-weight:800">${r.name}</div>
      <div class="grid">${body}</div>
    </div>`;
  }).join('');
}
