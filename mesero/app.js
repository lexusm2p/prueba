
import { onOrdersSnapshot } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

const Status={ PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY' };
let LAST_READY_IDS = new Set();

onOrdersSnapshot((orders)=>{
  const by = orders.reduce((acc,o)=>{ const s=o.status||Status.PENDING; (acc[s] ||= []).push(o); return acc; },{});

  renderList('col-progress', by.IN_PROGRESS||[]);
  renderList('col-ready', by.READY||[]);
  renderList('col-pending', by.PENDING||[]);

  const currentReady = new Set((by.READY||[]).map(x=>x.id));
  for(const id of currentReady){
    if(!LAST_READY_IDS.has(id)){
      beep(); toast('Pedido listo para recoger 🛎️');
    }
  }
  LAST_READY_IDS = currentReady;
});

function renderList(containerId, list){
  const el = document.getElementById(containerId);
  el.innerHTML = list.map(renderCard).join('') || '<div class="empty">—</div>';
}

function renderCard(o){
  const items = (o.items||[]).map((it)=>{
    const ingr = (it.ingredients||[]).length ? `<div class='small'>Incluye: ${it.ingredients.join(', ')}</div>` : '';
    const ex   = (it.extras||[]).length ? `<div class='small'>Extras: ${it.extras.map(e=>e.name).join(', ')}</div>` : '';
    return `<div class='small'>• <strong>${it.name}</strong> × ${it.qty||1}${ingr}${ex}</div>`;
  }).join('');
  return `<article class="k-card">
    <div class="k-head"><div class="title">Pedido #${o.id.slice(-5).toUpperCase()}</div>
    <div class="sub">Cliente: <strong>${escapeHtml(o.customerName||'—')}</strong></div></div>
    <div class="k-body">${items || '—'}</div>
  </article>`;
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

