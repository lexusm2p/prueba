import { db, onSnapshot, collection, query, where, orderBy, updateDoc, doc, getDocs } from '../lib/firebase.js';
import { beep } from '../lib/notify.js'; import { toast } from '../lib/toast.js';
import { RECIPES } from '../lib/recipes.js';

const colPending  = document.getElementById('col-pending');
const colProgress = document.getElementById('col-progress');
const colReady    = document.getElementById('col-ready');

function groupByTicket(rows){
  const map = new Map();
  for(const [id,o] of rows){
    const k = o.ticketId || id;
    if(!map.has(k)) map.set(k, []);
    map.get(k).push([id,o]);
  }
  return map;
}
function sumTicket(list){
  let total=0, qty=0;
  list.forEach(([,o])=>{ total += Number(o.total||0); qty += Number(o.qty||0); });
  return {total, qty};
}
function ticketStatus(list){
  const statuses = new Set(list.map(([,o])=>o.status));
  if(statuses.has('IN_PROGRESS')) return 'IN_PROGRESS';
  if(statuses.has('PENDING') && !statuses.has('IN_PROGRESS') && !statuses.has('READY')) return 'PENDING';
  if(statuses.has('READY') && statuses.size===1) return 'READY';
  if(statuses.has('READY')) return 'IN_PROGRESS';
  return [...statuses][0] || 'PENDING';
}
function lineHTML(o){
  const base = (o.base && o.base.length)? o.base : (RECIPES[o.product]||[]);
  const extras = o.extras?.length? `<div class="sub">Extras: ${o.extras.join(', ')}</div>`:'';
  const aders  = o.aderezos?.length? `<div class="sub">Aderezos: ${o.aderezos.join(', ')}</div>`:'';
  const notes  = o.notes? `<div class="sub">Notas: ${o.notes}</div>`:'';
  return `<div class="card" style="background:#0e1f2c">
    <div class="row"><strong>${o.product}</strong><span class="right sub">×${o.qty}</span></div>
    ${base.length? `<div class="sub"><b>Base:</b> ${base.join(', ')}</div>`:''}
    <div class="sub">Sugerida: <b>${o.suggested||'—'}</b></div>
    ${aders}${extras}${notes}
  </div>`;
}
function mountTicket(k, list, into){
  const any = list[0][1];
  const who = any.customer || any.server || 'Cliente';
  const {total, qty} = sumTicket(list);
  const status = ticketStatus(list);
  const wrap = document.createElement('div'); wrap.className='card'; wrap.dataset.ticket=k;
  wrap.innerHTML = `
    <div class="row">
      <h3>Ticket ${k}</h3>
      <div class="right price">$${Math.round(total)}</div>
    </div>
    <div class="sub">Para: ${who} · Piezas: ${qty}</div>
    ${list.map(([,o])=> lineHTML(o)).join('')}
    <div class="row" style="margin-top:10px">
      ${status==='PENDING'    ? `<button class="btn" data-a="take">Tomar</button>`:''}
      ${status==='IN_PROGRESS'? `<button class="btn" data-a="ready">Listo</button>`:''}
      ${status==='READY'      ? `<button class="btn" data-a="deliver">Entregar</button>`:''}
    </div>
  `;
  wrap.addEventListener('click', async e=>{
    const btn = e.target.closest('button[data-a]'); if(!btn) return;
    const a = btn.dataset.a;
    const q = query(collection(db,'orders'), where('ticketId','==',k));
    const snap = await getDocs(q);
    const ops = [];
    snap.forEach(d=> ops.push(updateDoc(doc(db,'orders',d.id), { status:
      a==='take' ? 'IN_PROGRESS' : a==='ready' ? 'READY' : 'ARCHIVED'
    })));
    await Promise.all(ops);
    if(a==='ready'){ beep(); toast('Pedido listo ✅'); }
  });
  into.appendChild(wrap);
}
function mountColumns(map){
  const P=[],I=[],R=[];
  map.forEach((list,k)=>{
    const st = ticketStatus(list);
    if(st==='PENDING') P.push([k,list]);
    else if(st==='IN_PROGRESS') I.push([k,list]);
    else if(st==='READY') R.push([k,list]);
  });
  function render(list,into){
    into.innerHTML='';
    if(!list.length){ into.innerHTML='<div class="empty">Sin elementos</div>'; return; }
    list.forEach(([k,rows])=> mountTicket(k,rows,into));
  }
  render(P,colPending); render(I,colProgress); render(R,colReady);
}

const q = query(collection(db,'orders'), where('status','!=','ARCHIVED'), orderBy('status'), orderBy('createdAt'));
onSnapshot(q,(snap)=>{
  const arr=[]; snap.forEach(d=> arr.push([d.id,d.data()]));
  const map = groupByTicket(arr);
  mountColumns(map);
});
