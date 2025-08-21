// /admin/app.js
import {
  listOrdersRange, listOrdersAggregates,    // reportes
  addPurchaseAndRollCost, listPurchases,    // compras + costo promedio
  listInventory, listVendors, saveVendor,   // inventario / proveedores
  listProducts, reloadCatalogFlag,          // productos
  readHappyHour, saveHappyHourSettings      // HH
} from '../shared/db.js';
import { toast } from '../shared/notify.js';

/* ───────── Tabs ───────── */
const tabs = document.getElementById('admTabs');
tabs.addEventListener('click',(e)=>{
  const t = e.target.closest('.tab'); if(!t) return;
  tabs.querySelectorAll('.tab').forEach(b=>{ b.classList.remove('is-active'); b.setAttribute('aria-selected','false'); });
  t.classList.add('is-active'); t.setAttribute('aria-selected','true');
  const target = t.dataset.tab;
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+target).classList.add('active');
});

/* ───────── Reportes ───────── */
const fromEl = document.getElementById('repFrom');
const toEl   = document.getElementById('repTo');
const typeEl = document.getElementById('repType');
document.getElementById('btnRepGen').onclick = runReports;

// default: últimos 7 días
const today = new Date(); const weekAgo = new Date(today); weekAgo.setDate(today.getDate()-7);
fromEl.value = weekAgo.toISOString().slice(0,10);
toEl.value   = today.toISOString().slice(0,10);

async function runReports(){
  try{
    const from = new Date(fromEl.value+'T00:00:00');
    const to   = new Date(toEl.value+'T23:59:59');
    const type = typeEl.value; // all|pickup|dinein
    const orders = await listOrdersRange(from, to, type);

    // KPIs básicos
    const kpi = await listOrdersAggregates(orders);
    setText('kpiOrders', kpi.orders);
    setMoney('kpiUnits', kpi.units);
    setMoney('kpiRevenue', kpi.revenue);
    setMoney('kpiAvg', kpi.avgTicket);

    // Top & Low
    fillTable('tblTop', kpi.topItems);
    fillTable('tblLow', kpi.lowItems);

    // Por hora
    const rows = kpi.byHour.map(h=>`<tr><td>${h.hour}:00</td><td>${h.orders}</td><td>${fmtMoney(h.revenue)}</td></tr>`).join('');
    document.querySelector('#tblHours tbody').innerHTML = rows || '<tr><td colspan="3">—</td></tr>';

    toast('Reporte listo');
  }catch(err){
    console.error(err); toast('No se pudo generar el reporte');
  }
}

function setText(id, v){ document.getElementById(id).textContent = String(v); }
function setMoney(id, v){ document.getElementById(id).textContent = fmtMoney(v); }
const fmtMoney = n => '$'+Number(n||0).toFixed(0);
function fillTable(id, arr){
  const tb = document.querySelector('#'+id+' tbody');
  tb.innerHTML = (arr&&arr.length) ? arr.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${r.units}</td><td>${fmtMoney(r.revenue)}</td></tr>`).join('')
                                   : '<tr><td colspan="3">—</td></tr>';
}

/* ───────── Compras ───────── */
document.getElementById('btnAddPurchase').onclick = async ()=>{
  const name = (document.getElementById('pName').value||'').trim();
  const qty  = Number(document.getElementById('pQty').value||0);
  const cost = Number(document.getElementById('pCost').value||0);
  const vendor = (document.getElementById('pVendor').value||'').trim();
  if(!name || qty<=0 || cost<=0){ toast('Completa ingrediente, cantidad y costo'); return; }
  try{
    await addPurchaseAndRollCost({ name, qty, cost, vendor });
    await renderPurchases(); await renderInventory();
    toast('Compra registrada y costo promedio actualizado');
  }catch(e){ console.error(e); toast('Error al registrar compra'); }
};
async function renderPurchases(){
  const rows = await listPurchases(25);
  const tb = document.querySelector('#tblPurch tbody');
  tb.innerHTML = rows.map(r=>`<tr>
    <td>${new Date(r.createdAt?.toDate?.() || r.createdAt || Date.now()).toLocaleString()}</td>
    <td>${escapeHtml(r.name)}</td><td>${r.qty}</td><td>${fmtMoney(r.cost)}</td><td>${escapeHtml(r.vendor||'-')}</td>
  </tr>`).join('');
}

/* ───────── Inventario ───────── */
document.getElementById('btnInvRefresh').onclick = renderInventory;
document.getElementById('invSearch').oninput = renderInventory;
async function renderInventory(){
  const q = (document.getElementById('invSearch').value||'').toLowerCase();
  const items = await listInventory();
  const tb = document.querySelector('#tblInv tbody');
  tb.innerHTML = items
    .filter(x=> x.name.toLowerCase().includes(q))
    .map(i=>`<tr>
      <td>${escapeHtml(i.name)}</td>
      <td>${(i.stock??0).toFixed(2)}</td>
      <td>${escapeHtml(i.um||'-')}</td>
      <td>${fmtMoney(i.costAvg||0)}</td>
      <td>${fmtMoney((i.stock||0)*(i.costAvg||0))}</td>
    </tr>`).join('');
}

/* ───────── Proveedores ───────── */
document.getElementById('btnSaveVendor').onclick = async ()=>{
  const name=(document.getElementById('vName').value||'').trim();
  const contact=(document.getElementById('vContact').value||'').trim();
  if(!name){ toast('Nombre del proveedor requerido'); return; }
  try{ await saveVendor({ name, contact }); await renderVendors(); toast('Proveedor guardado'); }
  catch(e){ console.error(e); toast('Error al guardar proveedor'); }
};
async function renderVendors(){
  const arr = await listVendors();
  const tb=document.querySelector('#tblVendors tbody');
  tb.innerHTML = arr.map(v=>`<tr><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.contact||'-')}</td><td>${v.id}</td></tr>`).join('');
}

/* ───────── Productos / Combos (solo lectura por ahora) ───────── */
document.getElementById('btnReloadCatalog').onclick = async ()=>{ await reloadCatalogFlag(); toast('Catálogo marcado para recargar'); };
async function renderProducts(){
  const arr = await listProducts();
  const tb = document.querySelector('#tblProducts tbody');
  tb.innerHTML = arr.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td>${p.type}</td><td>${fmtMoney(p.price)}</td><td>${p.active?'Sí':'No'}</td><td>${p.id}</td></tr>`).join('');
}

/* ───────── Happy Hour ───────── */
document.getElementById('btnSaveHappy').onclick = async ()=>{
  const enabled = document.getElementById('hhEnabled').value==='on';
  const disc = Number(document.getElementById('hhDisc').value||0);
  const msg  = (document.getElementById('hhMsg').value||'').trim();
  try{ await saveHappyHourSettings({ enabled, discount:disc, message:msg }); toast('Happy Hour actualizada'); }
  catch(e){ console.error(e); toast('No se pudo guardar HH'); }
};
async function loadHappy(){
  const hh = await readHappyHour();
  document.getElementById('hhEnabled').value = hh.enabled ? 'on' : 'off';
  document.getElementById('hhDisc').value = hh.discount||0;
  document.getElementById('hhMsg').value  = hh.message||'';
}

/* ───────── Helpers ───────── */
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

/* ───────── Cargas iniciales ───────── */
(async function boot(){
  await renderPurchases();
  await renderInventory();
  await renderVendors();
  await renderProducts();
  await loadHappy();
  // primer reporte
  runReports();
})();
