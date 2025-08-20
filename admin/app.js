import { db, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, doc, getDocs } from '../lib/firebase.js';
import { toast } from '../lib/toast.js';

const tabs=['ventas','compras','inventario','recetario']; function showTab(t){ tabs.forEach(x=> document.getElementById('tab-'+x).hidden=(x!==t)); }
document.querySelectorAll('[data-tab]').forEach(b=> b.onclick=()=> showTab(b.dataset.tab)); showTab('ventas');

// Ventas
const vRows=document.getElementById('v-rows'); const vTotal=document.getElementById('v-total');
function fmt(d){ const dt=d?.toDate?.()||new Date(); return dt.toLocaleString(); }
function renderVentas(rows){ vRows.innerHTML=''; let total=0;
  rows.forEach(([id,o])=>{ total+=Number(o.total||0); const tr=document.createElement('tr');
    tr.innerHTML=`<td>${fmt(o.createdAt)}</td><td>${o.product}</td><td>${o.qty}</td><td>${o.table||''}</td><td>${o.server||o.customer||''}</td><td>${o.status}</td><td>$${o.total||0}</td>`;
    vRows.appendChild(tr); }); vTotal.textContent=total.toFixed(0);
}
onSnapshot(query(collection(db,'orders'), orderBy('createdAt','desc')), snap=>{ const arr=[]; snap.forEach(d=>arr.push([d.id,d.data()])); renderVentas(arr); });
document.getElementById('v-refresh').onclick=()=>toast('Actualizado');

// Compras
const pForm=document.getElementById('p-form'); const pRows=document.getElementById('p-rows');
pForm.onsubmit=async e=>{ e.preventDefault();
  const item=document.getElementById('p-item').value.trim(); const qty=parseFloat(document.getElementById('p-qty').value||'0');
  const unit=document.getElementById('p-unit').value.trim(); const cost=parseFloat(document.getElementById('p-cost').value||'0');
  if(!item||!cost){ toast('Completa insumo y costo'); return; }
  await addDoc(collection(db,'purchases'),{ item, qty, unit, cost, createdAt:serverTimestamp() });
  pForm.reset(); toast('Compra registrada');
};
onSnapshot(query(collection(db,'purchases'), orderBy('createdAt','desc')), snap=>{
  pRows.innerHTML=''; snap.forEach(d=>{ const p=d.data(); const tr=document.createElement('tr'); const dt=p.createdAt?.toDate?.()||new Date();
    tr.innerHTML=`<td>${dt.toLocaleString()}</td><td>${p.item}</td><td>${p.qty||''}</td><td>${p.unit||''}</td><td>$${p.cost||0}</td>`; pRows.appendChild(tr); });
});

// Inventario
const iForm=document.getElementById('i-form'); const iRows=document.getElementById('i-rows');
iForm.onsubmit=async e=>{ e.preventDefault();
  const item=document.getElementById('i-item').value.trim(); const qty=parseFloat(document.getElementById('i-qty').value||'0');
  const min=parseFloat(document.getElementById('i-min').value||'0'); const max=parseFloat(document.getElementById('i-max').value||'0');
  const unit=document.getElementById('i-unit').value.trim(); if(!item){ toast('Nombre de insumo requerido'); return; }
  const snap=await getDocs(collection(db,'inventory')); let id=null; snap.forEach(d=>{ if(d.data().item===item) id=d.id; });
  if(id){ await updateDoc(doc(db,'inventory',id),{ item, qty, min, max, unit }); } else {
    await addDoc(collection(db,'inventory'),{ item, qty, min, max, unit, createdAt:serverTimestamp() });
  }
  iForm.reset(); toast('Inventario actualizado');
};
onSnapshot(query(collection(db,'inventory'), orderBy('item')), snap=>{
  iRows.innerHTML=''; snap.forEach(d=>{ const it=d.data(); const id=d.id; const tr=document.createElement('tr');
    const alert=(it.qty||0) < (it.min||0) ? 'style="color:#ffb3b3"' : '';
    tr.innerHTML=`<td ${alert}>${it.item}</td><td>${it.qty||0}</td><td>${it.min||0}</td><td>${it.max||0}</td><td>${it.unit||''}</td>
    <td><button class="btn" data-id="${id}" data-a="inc">+1</button> <button class="btn" data-id="${id}" data-a="dec">-1</button></td>`;
    iRows.appendChild(tr); });
});
iRows.addEventListener('click', async e=>{ const b=e.target.closest('button[data-id]'); if(!b) return;
  const id=b.dataset.id; const a=b.dataset.a; const ref=doc(db,'inventory',id);
  const row=b.closest('tr'); const current=parseFloat(row.children[1].textContent||'0'); const delta=a==='inc'?1:-1;
  const next=Math.max(0,current+delta); await updateDoc(ref,{ qty: next });});

// Recetario (resumen)
const rList=document.getElementById('r-list');
const recipes=[
  {name:'Aderezo de ajo habanero (200ml)', items:['Habanero 25 g','Ajo frito 30 g','Queso crema 50 g','Mayonesa 200 ml','Sal c/n']},
  {name:'Aderezo chipotle (200ml)', items:['Chipotle 50 g','Queso crema 50 g','Mayonesa 200 ml','Pimienta c/n','Sal c/n']},
  {name:'Salsa chimichurri (200ml)', items:['Chile de árbol 10 pzas','Ajos 5 pzas','Mostaza 1 cda','Huevos 2','Perejil c/n','Vinagre 1/3 taza','Aceite 3/4 taza','Sal c/n']},
  {name:'Aderezo cheddar (500ml)', items:['Queso cheddar 200 g','Leche 1 L','Harina 100 g','Mantequilla 100 g','Sal/Pimienta/Menta']},
  {name:'Mostaza dulce (200ml)', items:['Mostaza 120 ml','Miel 60 ml','Vinagre 20 ml']},
  {name:'Jalapeño rostizado (200ml)', items:['Jalapeño 100 g','Mayonesa 120 ml','Ajo 1 diente','Sal c/n']},
  {name:'Curry suave (200ml)', items:['Mayonesa 180 ml','Curry 1 cda','Miel 1 cda','Limón 1 cda','Sal c/n']},
  {name:'Salsa secreta Seven (200ml)', items:['Mayonesa 150 ml','Kétchup 40 ml','Mostaza 10 ml','Pepinillo 1 cda','Pimentón 1 cdta','Ajo polvo 1/2 cdta']},
];
rList.innerHTML=recipes.map(r=>`<div class="card"><h3>${r.name}</h3><div class="sub">${r.items.join(' · ')}</div></div>`).join('');
