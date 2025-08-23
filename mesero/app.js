// /mesero/app.js
import { subscribeOrders, archiveDelivered } from '../shared/db.js';
import { beep, toast } from '../shared/notify.js';

const colIP = document.getElementById('colIP');
const colR  = document.getElementById('colR');

let LAST_IDS_READY = new Set();

subscribeOrders((list = [])=>{
  const arr = Array.isArray(list) ? list : [];
  const ip = arr.filter(x=>x?.status==='IN_PROGRESS');
  const r  = arr.filter(x=>x?.status==='READY');

  // Beep si aparece nuevo READY
  const nowReadyIds = new Set(r.map(x=>x.id));
  for (const id of nowReadyIds) if (!LAST_IDS_READY.has(id)) beep(160, 1100);
  LAST_IDS_READY = nowReadyIds;

  colIP.innerHTML = ip.map(o=>card(o,false)).join('') || '<div class="muted">—</div>';
  colR.innerHTML  = r.map(o=>card(o,true)).join('')  || '<div class="muted">—</div>';
});

function card(o={}, deliver=false){
  // Compatibilidad: usa o.items si existe; si no, intenta item/qty
  const items = Array.isArray(o.items) && o.items.length
    ? o.items
    : (o.item ? [{ name:o.item.name, qty:o.qty||1 }] : []);

  const count = items.reduce((n,i)=> n + (i?.qty||1), 0);
  const names = items.map(i=>i?.name).filter(Boolean).slice(0,2).join(', ');

  const isPickup = (o.orderType === 'pickup');
  const meta = (o.orderType === 'dinein')
    ? `Mesa ${o.table||'?'}`
    : (isPickup ? 'Pickup' : (o.orderType||'—'));

  const phoneLine = isPickup && o.phone
    ? `<div class="muted small">📞 <b>${escapeHtml(String(o.phone))}</b></div>`
    : '';

  return `<div class="k-card" data-id="${o.id}">
    <h4>${escapeHtml(o.customer||'-')} · ${count} it.</h4>
    <div class="muted small">${escapeHtml(names || '—')}</div>
    <div class="muted small">Tipo: <b>${escapeHtml(meta)}</b></div>
    ${phoneLine}
    ${o.notes?`<div class="muted small">Notas: ${escapeHtml(o.notes)}</div>`:''}
    <div class="k-actions" style="margin-top:6px">
      ${deliver?'<button class="btn small secondary" data-a="deliver">Entregar</button>':''}
    </div>
  </div>`;
}

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a="deliver"]'); if(!btn) return;
  const id = btn.closest('.k-card')?.dataset?.id; if(!id) return;
  try{
    await archiveDelivered(id);
    beep(); toast('Pedido entregado ✔️');
  }catch(err){
    console.error(err);
    toast('No se pudo entregar');
  }
});

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[m]));
}
