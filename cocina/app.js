import { firebaseConfig } from "../shared/firebase-init.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
await signInAnonymously(auth).catch(console.error);

const $ = s=>document.querySelector(s);
const ordersBox = $('#orders');
const beep = $('#beep');

const q = query(collection(db,"orders"), where("status","in",["PENDING","EN_PREPARACION","READY"]), orderBy("ts","asc"));
onSnapshot(q, (snap)=>{
  ordersBox.innerHTML = '';
  snap.forEach(docu=>{
    const o = { id:docu.id, ...docu.data() };
    ordersBox.appendChild(renderOrder(o));
  });
});

function renderOrder(o){
  const el = document.createElement('div');
  el.className = 'k-card';
  const itemsList = (o.items||[]).map(it=>`<div>• ${it.name} <span class="tiny">($${it.price})</span></div>`).join('');
  const saucesInfo = o.saucesPack?.enabled
    ? `<div class="badge">PACK 3 (½ porción)</div><div class="tiny">${(o.saucesPack.selected && o.saucesPack.selected.length) ? o.saucesPack.selected.join(', ') : (o.saucesPack.surprise ? 'SORPRESA' : '—')}</div>`
    : '';
  const tableInfo = o.table ? `<div class="tiny">Mesa/Orden: <strong>${o.table}</strong> ${o.customer?('· '+o.customer):''}</div>` : '';
  const notes = o.notes ? `<div class="tiny">Notas: ${o.notes}</div>` : '';

  el.innerHTML = `
    <div><strong>#${o.id.slice(-5).toUpperCase()}</strong> · <span class="tiny">${o.status}</span></div>
    ${tableInfo}
    <div class="tiny">Total: $${o.total}</div>
    <hr/>
    <div>${itemsList}</div>
    <div style="margin-top:6px">${saucesInfo} ${(o.vasitos && o.vasitos>0)?('<div class="badge">VASITOS x'+o.vasitos+'</div>'):''}</div>
    ${notes}
    <div class="k-actions">
      ${o.status!=="EN_PREPARACION" ? '<button class="k-btn warn" data-act="prep">En preparación</button>' : ''}
      ${o.status!=="READY" ? '<button class="k-btn ready" data-act="ready">Listo</button>' : ''}
      <button class="k-btn danger" data-act="delivered">Entregado</button>
    </div>
  `;

  el.querySelectorAll('[data-act]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const act = btn.dataset.act;
      const ref = doc(db,"orders",o.id);
      if (act==="prep"){ await updateDoc(ref,{status:"EN_PREPARACION"}); }
      else if (act==="ready"){ await updateDoc(ref,{status:"READY"}); try{ beep.currentTime=0; beep.play(); }catch(e){} }
      else if (act==="delivered"){ await updateDoc(ref,{status:"DELIVERED"}); el.remove(); }
    });
  });

  return el;
}
