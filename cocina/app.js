import { db, onSnapshot, collection, query, where, orderBy, updateDoc, doc } from '../lib/firebase.js';
import { beep } from '../lib/notify.js'; import { toast } from '../lib/toast.js';

const colPending=document.getElementById('col-pending');
const colProgress=document.getElementById('col-progress');
const colReady=document.getElementById('col-ready');

function card(o,id){ const wrap=document.createElement('div'); wrap.className='card'; wrap.dataset.id=id;
  wrap.innerHTML=`<div class="row"><h3>${o.product} x${o.qty}</h3><div class="right price">$${o.total||0}</div></div>
  <div class="sub">Mesa ${o.table||'-'} · ${o.customer||o.server||'Cliente'}</div>
  <div class="sub">Sugerida: <b>${o.suggested||'—'}</b></div>
  ${o.aderezos?.length? `<div class="sub">Aderezos: ${o.aderezos.join(', ')}</div>`:''}
  ${o.extras?.length? `<div class="sub">Extras: ${o.extras.join(', ')}</div>`:''}
  ${o.notes? `<div class="sub">Notas: ${o.notes}</div>`:''}
  <div class="row" style="margin-top:10px">
    ${o.status==='PENDING'? `<button class="btn" data-a="take">Tomar</button>`:''}
    ${o.status==='IN_PROGRESS'? `<button class="btn" data-a="ready">Listo</button>`:''}
    ${o.status==='READY'? `<button class="btn" data-a="deliver">Entregar</button>`:''}
  </div>`;
  wrap.addEventListener('click', async e=>{ const btn=e.target.closest('button[data-a]'); if(!btn) return;
    const a=btn.dataset.a;
    if(a==='take')   await updateDoc(doc(db,'orders',id),{status:'IN_PROGRESS'});
    if(a==='ready')  { await updateDoc(doc(db,'orders',id),{status:'READY'}); beep(); toast('Pedido listo ✅'); }
    if(a==='deliver'){ await updateDoc(doc(db,'orders',id),{status:'ARCHIVED'}); }
  });
  return wrap;
}
function mount(list,into){ into.innerHTML=''; if(!list.length){ into.innerHTML='<div class="empty">Sin elementos</div>'; return; } list.forEach(([id,o])=> into.appendChild(card(o,id))); }
const q=query(collection(db,'orders'), where('status','!=','ARCHIVED'), orderBy('status'), orderBy('createdAt'));
onSnapshot(q,(snap)=>{ const P=[],I=[],R=[]; snap.forEach(d=>{ const o=d.data();
  if(o.status==='PENDING') P.push([d.id,o]); else if(o.status==='IN_PROGRESS') I.push([d.id,o]); else if(o.status==='READY') R.push([d.id,o]); });
  mount(P,colPending); mount(I,colProgress); mount(R,colReady);
});
