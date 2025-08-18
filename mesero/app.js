import { subscribeOrders } from '../shared/db.js';
import { money } from '../shared/util.js';
import { beep } from '../shared/notify.js';

let LAST={};
function row(o){
  const items = (o.items||[]).map(i=>i.name).join(', ');
  return `<div class="k-card"><h4>${o.name} ${o.table?`<span class="badge">Mesa ${o.table}</span>`:''}</h4>
  <div class="small">${items}</div>
  <div class="row"><b>${o.status}</b><span>${money(o.total||0)}</span></div></div>`;
}
subscribeOrders(list=>{
  document.getElementById('list').innerHTML = (list||[]).map(row).join('')||`<div class="small">Sin pedidos</div>`;
  (list||[]).forEach(o=>{ if(LAST[o.id] && LAST[o.id]!=='READY' && o.status==='READY'){ beep(1200); } LAST[o.id]=o.status; });
});
