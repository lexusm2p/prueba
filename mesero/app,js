
import { subscribeOrders } from '../shared/backend.js';
import { Status } from '../shared/status.js';
import { beep } from '../lib/notify.js';

const el = document.querySelector('#feed');
let knownReady = new Set();

function row(o){
  return `<div class="order">
    <h4>${o.itemName} × ${o.qty} — <span class="badge">${o.status}</span></h4>
    <div>Cliente: ${o.client||'—'}</div>
    <div>Total: $${o.total}</div>
  </div>`;
}

subscribeOrders((arr)=>{
  // if any new READY, beep once
  arr.filter(o=>o.status===Status.READY).forEach(o=>{
    if(!knownReady.has(o.id)){ knownReady.add(o.id); beep(); }
  });
  el.innerHTML = arr.map(row).join('') || '<small>Sin órdenes</small>';
}, {});
