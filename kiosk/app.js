import { firebaseConfig } from "../shared/firebase-init.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
await signInAnonymously(auth).catch(console.error);

const SAUCES = [
  "Aderezo Ajo Habanero","Aderezo Chipotle","Salsa Chimichurri","Aderezo Cheddar",
  "Mostaza Dulce","Jalapeño Rostizado","Curry Suave","Salsa Secreta Seven"
];
const PACK_PRICE = 10, MAX_IN_PACK = 3, VASITO_PRICE = 4;

const MINI_CATALOG = [
  { id:"mini_starter",  name:"Starter Mini",   price:27 },
  { id:"mini_koopa",    name:"Koopa Crunch Mini",   price:27 },
  { id:"mini_fatality", name:"Fatality Flame Mini", price:37 },
  { id:"mini_mega",     name:"Mega Byte Mini",      price:37 },
  { id:"mini_hadouken", name:"Hadouken Mini",       price:37 },
  { id:"mini_nintendo", name:"Nintendo Nostalgia Mini", price:37 },
  { id:"mini_boss",     name:"Final Boss Mini",     price:47 }
];

let minisToPick = 0, pickedMinis = [], selectedSauces = new Set();
const $ = s=>document.querySelector(s); const $$ = s=>Array.from(document.querySelectorAll(s));
const show = s=>$(s).classList.remove('hidden'); const hide = s=>$(s).classList.add('hidden');

document.addEventListener('DOMContentLoaded', () => {
  $('#btnGoMinis').addEventListener('click', openMinis);
  $('#btnGoBig').addEventListener('click', ()=> window.location.href="../index.html#burgers");

  $$('#view-minis .chip').forEach(btn=>btn.addEventListener('click', ()=>{
    minisToPick = parseInt(btn.dataset.minis,10);
    pickedMinis=[]; renderMiniList(); renderSummary();
  }));

  $('#packEnabled').addEventListener('change', renderSummary);
  $('#vasitos').addEventListener('change', renderSummary);
  $('#surprise').addEventListener('change', renderSummary);

  $('#btnConfirmMinis').addEventListener('click', confirmMinisOrder);
  $('#btnBackHome').addEventListener('click', ()=>{ hide('#view-minis'); show('#home-choice'); });
});

function openMinis(){ hide('#home-choice'); show('#view-minis'); renderMiniList(); renderSauces(); renderSummary(); }

function renderMiniList(){
  const cont = $('#miniList'); cont.innerHTML='';
  MINI_CATALOG.forEach(item=>{
    const selectedCount = pickedMinis.filter(id=>id===item.id).length;
    const canAdd = pickedMinis.length < minisToPick || minisToPick===7;
    const card = document.createElement('div');
    card.className = 'card mini';
    card.innerHTML = `
      <div class="row"><div>
        <strong>${item.name}</strong><br/><span>$${item.price}</span>
      </div><div>
        <button class="small" data-add="${item.id}" ${canAdd?'':'disabled'}>Añadir</button>
        <button class="small ghost" data-rem="${item.id}" ${selectedCount>0?'':'disabled'}>Quitar</button>
      </div></div>
      <div class="tiny">Elegidas: ${selectedCount}</div>`;
    cont.appendChild(card);
  });
  $$('#miniList [data-add]').forEach(b=>b.addEventListener('click', ()=>{
    if (minisToPick===0) minisToPick=1;
    if (minisToPick===7 && pickedMinis.length>=7) return;
    if (minisToPick!==7 && pickedMinis.length>=minisToPick) return;
    pickedMinis.push(b.dataset.add); renderMiniList(); renderSummary();
  }));
  $$('#miniList [data-rem]').forEach(b=>b.addEventListener('click', ()=>{
    const i = pickedMinis.indexOf(b.dataset.rem); if (i>-1){ pickedMinis.splice(i,1); renderMiniList(); renderSummary(); }
  }));
}

function renderSauces(){
  const box = $('#saucePicker'); box.innerHTML=''; selectedSauces = new Set();
  SAUCES.forEach(name=>{
    const id = 'sauce_'+name.replace(/\W+/g,'_');
    const lbl = document.createElement('label'); lbl.className='tag';
    lbl.innerHTML = `<input type="checkbox" id="${id}"> ${name}`;
    box.appendChild(lbl);
    lbl.querySelector('input').addEventListener('change', e=>{
      if (e.target.checked){
        if ($('#packEnabled').checked && selectedSauces.size>=MAX_IN_PACK) { e.target.checked=false; return; }
        selectedSauces.add(name);
      } else { selectedSauces.delete(name); }
      renderSummary();
    });
  });
}

function calcTotals(){
  const minisTotal = pickedMinis.reduce((s,id)=> s + (MINI_CATALOG.find(m=>m.id===id)?.price||0), 0);
  let packTotal = 0, extraSauces = 0;
  if ($('#packEnabled').checked){
    packTotal += 10;
    if (selectedSauces.size>MAX_IN_PACK){ extraSauces = selectedSauces.size - MAX_IN_PACK; packTotal += extraSauces * 5; }
  } else if (selectedSauces.size>0){ packTotal += selectedSauces.size * 5; }
  let vasitosTotal = 0;
  if ($('#vasitos').checked){ const count = selectedSauces.size || ($('#surprise').checked?1:0); vasitosTotal = count * 4; }
  const total = minisTotal + packTotal + vasitosTotal;
  return { minisTotal, packTotal, vasitosTotal, total };
}

function renderSummary(){
  const s = calcTotals();
  const lines = [];
  lines.push(`<div><strong>Minis seleccionadas:</strong> ${pickedMinis.length} · $${s.minisTotal}</div>`);
  if ($('#packEnabled').checked){ lines.push(`<div>Pack Power-Ups 3×$10: $${s.packTotal} ${selectedSauces.size?('· '+[...selectedSauces].join(', ')):( $('#surprise').checked ? '· SORPRESA' : '' )}</div>`); }
  else if (selectedSauces.size>0){ lines.push(`<div>Aderezos sueltos: ${selectedSauces.size} · $${s.packTotal}</div>`); }
  if ($('#vasitos').checked){ lines.push(`<div>Vasitos: $${s.vasitosTotal}</div>`); }
  $('#orderSummary').innerHTML = `<div class="box">${lines.join('')}<hr/><div class="total"><strong>Total: $${s.total}</strong></div></div>`;
}

async function confirmMinisOrder(){
  if (pickedMinis.length===0) return alert('Elige al menos 1 mini');
  const { total } = calcTotals();
  const order = {
    ts: Date.now(), source:'kiosk', kind:'minis',
    items: pickedMinis.map(id=>{ const m = MINI_CATALOG.find(x=>x.id===id); return { sku:id, name:m.name, price:m.price }; }),
    saucesPack: $('#packEnabled').checked ? { enabled:true, selected:[...selectedSauces], surprise:$('#surprise').checked||false, applied:true, packPrice:10 } : null,
    vasitos: $('#vasitos').checked ? ([...selectedSauces].length || ($('#surprise').checked?1:0)) : 0,
    vasitoPrice: $('#vasitos').checked ? 4 : 0,
    total, status:'PENDING', notes:''
  };
  try{
    await addDoc(collection(db,"orders"), { ...order, createdAt: serverTimestamp() });
    pickedMinis=[]; selectedSauces=new Set();
    alert('¡Pedido enviado!');
    hide('#view-minis'); show('#home-choice');
  }catch(e){ console.error(e); alert('Error al enviar el pedido.'); }
}
