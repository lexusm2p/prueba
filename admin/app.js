import { firebaseConfig } from "../shared/firebase-init.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, setDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
await signInAnonymously(auth).catch(console.error);

const $ = s=>document.querySelector(s);
const $$ = s=>Array.from(document.querySelectorAll(s));

// Tabs
$$('.tab').forEach(t=>t.addEventListener('click', ()=>{
  $$('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  ['finanzas','inventario','recetario'].forEach(id=>$('#tab-'+id).classList.add('hidden'));
  $('#tab-'+t.dataset.tab).classList.remove('hidden');
}));

// FINANZAS
function startOfDay(d=new Date()){ return new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0); }
function startOfWeek(d=new Date()){ const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); return new Date(d.getFullYear(),d.getMonth(),diff); }

async function loadFinanzas(){
  const qToday = query(collection(db,'orders'), where('createdAt','>=', startOfDay()));
  const qWeek = query(collection(db,'orders'), where('createdAt','>=', startOfWeek()));
  const [snapT, snapW] = await Promise.all([getDocs(qToday), getDocs(qWeek)]);
  function sum(snap){ let total=0, count=0; snap.forEach(d=>{ total+=d.data().total||0; count++; }); return { total, count };}
  const t = sum(snapT), w = sum(snapW);
  $('#finHoy').innerHTML = `<div>Total: <strong>$${t.total.toFixed(2)}</strong></div><div>Órdenes: ${t.count}</div>`;
  $('#finSemana').innerHTML = `<div>Total: <strong>$${w.total.toFixed(2)}</strong></div><div>Órdenes: ${w.count}</div>`;

  const qActive = query(collection(db,'orders'), where('createdAt','>=', startOfWeek()), orderBy('createdAt','desc'));
  const list = $('#ordersList'); list.innerHTML='';
  const s2 = await getDocs(qActive);
  s2.forEach(d=>{
    const o = d.data();
    const el = document.createElement('div'); el.className='k-card';
    el.innerHTML = `<div><strong>#${d.id.slice(-5).toUpperCase()}</strong> · $${o.total} · <span class="tiny">${o.status}</span></div>
    <div class="tiny">${o.kind} · ${o.source} ${o.table?('· '+o.table):''}</div>`;
    list.appendChild(el);
  });
}
loadFinanzas();

// INVENTARIO
async function renderInv(){
  const tbody = $('#invTable tbody'); tbody.innerHTML='';
  const snap = await getDocs(collection(db,'inventory'));
  snap.forEach(d=>{
    const it = { id:d.id, ...d.data() };
    const tr = document.createElement('tr');
    const low = (it.min_qty!=null && it.qty!=null && it.qty<=it.min_qty);
    tr.innerHTML = `
      <td>${it.name||''}</td>
      <td>${it.unit||''}</td>
      <td>${it.qty!=null?it.qty:''}</td>
      <td>${it.min_qty!=null?it.min_qty:''}</td>
      <td>
        <button class="btn" data-act="add" data-id="${it.id}">+1</button>
        <button class="btn" data-act="sub" data-id="${it.id}">-1</button>
        <button class="btn danger" data-act="del" data-id="${it.id}">Borrar</button>
      </td>`;
    if (low) tr.style.outline = '1px solid var(--warn)';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-act]').forEach(btn=>btn.addEventListener('click', async ()=>{
    const id = btn.dataset.id; const act = btn.dataset.act;
    if (act==='del'){ await updateDoc(doc(db,'inventory',id), { qty:0 }); return renderInv(); }
    const ref = doc(db,'inventory',id);
    const snap = await (await getDocs(collection(db,'inventory'))).docs.find(x=>x.id===id);
    const cur = snap?.data()?.qty||0;
    const next = act==='add' ? cur+1 : Math.max(0, cur-1);
    await updateDoc(ref,{ qty: next }); renderInv();
  }));
}
$('#btnAddInv').addEventListener('click', async ()=>{
  const name = prompt('Nombre del ítem'); if (!name) return;
  const unit = prompt('Unidad (kg, pza, ml, etc)')||'';
  const qty = Number(prompt('Cantidad inicial')||'0');
  const min_qty = Number(prompt('Mínimo sugerido')||'0');
  await addDoc(collection(db,'inventory'), { name, unit, qty, min_qty, createdAt: serverTimestamp() });
  renderInv();
});
$('#btnSeedInv').addEventListener('click', async ()=>{
  const base = [
    {name:'Pan mini', unit:'pza', qty:40, min_qty:20},
    {name:'Pan grande', unit:'pza', qty:20, min_qty:10},
    {name:'Carne 85g', unit:'pza', qty:40, min_qty:20},
    {name:'Queso amarillo', unit:'reb', qty:50, min_qty:20},
    {name:'Queso blanco', unit:'reb', qty:50, min_qty:20},
    {name:'Tocino', unit:'g', qty:1000, min_qty:400},
    {name:'Salchicha', unit:'pza', qty:20, min_qty:10},
    {name:'Jamón', unit:'reb', qty:30, min_qty:10},
    {name:'Piña', unit:'reb', qty:20, min_qty:8},
    {name:'Lechuga', unit:'pza', qty:8, min_qty:3},
    {name:'Jitomate', unit:'pza', qty:20, min_qty:8},
    {name:'Cebolla', unit:'pza', qty:15, min_qty:6},
    {name:'Salsas base', unit:'ml', qty:3000, min_qty:1000}
  ];
  for (const it of base){ await addDoc(collection(db,'inventory'), { ...it, createdAt: serverTimestamp() }); }
  renderInv();
});
renderInv();

// RECETARIO (estático con opción de seed)
const RECETAS = [
  {name:"Aderezo Ajo Habanero", vol:["200 ml"], ing:["25 g habanero","30 g ajo frito","50 g queso crema","200 ml mayonesa"], notas:"Procesar, reposo 12 h"},
  {name:"Aderezo Chipotle", vol:["200 ml"], ing:["50 g chipotle","50 g queso crema","200 ml mayonesa"], notas:"Procesar"},
  {name:"Salsa Chimichurri", vol:["200 ml"], ing:["Chiles de árbol, ajo, huevo, perejil, vinagre, mostaza, aceite, sal"], notas:"Reposo 12–24 h"},
  {name:"Aderezo Cheddar", vol:["500 ml"], ing:["200 g cheddar","1 L leche","100 g harina","100 g mantequilla","sal, pimienta, menta"], notas:"Roux + leche + queso"},
  {name:"Mostaza Dulce", vol:["200 ml"], ing:["Mostaza, miel, vinagre suave, pizca sal"], notas:"Mezclar"},
  {name:"Jalapeño Rostizado", vol:["200 ml"], ing:["Jalapeño asado, mayonesa, ajo, limón"], notas:"Procesar"},
  {name:"Curry Suave", vol:["200 ml"], ing:["Curry, mayo, yogur, toque limón"], notas:"Emulsionar"},
  {name:"Salsa Secreta Seven", vol:["200 ml"], ing:["Base mayo + especias (secreta)"], notas:"Reservada"}
];
function renderRecetas(){
  const box = $('#recetasBox'); box.innerHTML='';
  RECETAS.forEach(r=>{
    const el=document.createElement('div'); el.className='k-card';
    el.innerHTML = `<strong>${r.name}</strong> · <span class="tiny">${r.vol.join(' / ')}</span><div class="tiny">${r.ing.join(', ')}</div><div class="tiny">${r.notas}</div>`;
    box.appendChild(el);
  });
}
$('#btnSeedRecetas').addEventListener('click', async ()=>{
  for (const r of RECETAS){
    await addDoc(collection(db,'recipes'), { ...r, createdAt: serverTimestamp() });
  }
  alert('Recetario sembrado');
});
renderRecetas();
