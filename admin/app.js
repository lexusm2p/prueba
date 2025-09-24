// Admin — Seven de Burgers (estable y compacto)
// Reemplaza completamente /admin/app.js

import * as DB from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

const $ = (sel, root=document)=> root.querySelector(sel);
const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));

/* ================= Tabs ================= */
const tabs = $('#admTabs');
const panels = {
  reportes: $('#panel-reportes'),
  hist:     $('#panel-hist'),
  cobros:   $('#panel-cobros'),
  compras:  $('#panel-compras'),
  inventario: $('#panel-inventario'),
  proveedores: $('#panel-proveedores'),
  productos: $('#panel-productos'),
  temas: $('#panel-temas'),
  happy: $('#panel-happy'),
  recetas: $('#panel-recetas'),
  articulos: $('#panel-articulos'),
};

tabs?.addEventListener('click', e=>{
  const btn = e.target.closest('.tab[data-tab]');
  if(!btn) return;
  const name = btn.dataset.tab;
  $$('.tabs-admin .tab').forEach(b=>{
    b.classList.toggle('is-active', b.dataset.tab===name);
    b.setAttribute('aria-selected', String(b.dataset.tab===name));
  });
  Object.entries(panels).forEach(([k,el])=>{
    el?.classList.toggle('active', k===name);
  });
});

/* ============== Utilitarios ============== */
const money = (n)=> '$' + Number(n||0).toFixed(0);
const toMs = (t)=> {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds != null) return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
  const d = new Date(t); const ms = d.getTime(); return Number.isFinite(ms) ? ms : 0;
};
const fmtDate = (ms)=>{
  const d = new Date(ms||Date.now());
  return d.toLocaleString([], { dateStyle:'short', timeStyle:'short' });
};
const download = (filename, text)=>{
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'text/plain'}));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
};

/* ============== REPORTES ============== */
$('#btnRepGen')?.addEventListener('click', async ()=>{
  try{
    const from = $('#repFrom')?.valueAsDate || new Date(new Date().setHours(0,0,0,0));
    const to   = $('#repTo')?.valueAsDate   || new Date();
    const type = $('#repType')?.value || 'all';
    const includeArchive = ($('#repHist')?.value||'Sí') === 'Sí';

    const rows = await DB.getOrdersRange({ from, to, includeArchive, orderType:type });

    // KPIs
    const ordersCount = rows.length;
    const totals = rows.map(calcTotal);
    const revenue = totals.reduce((a,b)=>a+b,0);
    const units   = rows.reduce((a,o)=> a + (Array.isArray(o.items)?o.items.reduce((s,it)=>s+(Number(it.qty||1)),0) : Number(o.qty||1)), 0);
    $('#kpiOrders').textContent = String(ordersCount);
    $('#kpiUnits').textContent  = String(units);
    $('#kpiRevenue').textContent= money(revenue);
    $('#kpiAvg').textContent    = money(ordersCount ? (revenue/ordersCount) : 0);

    // Top y Low
    const acc = new Map();
    for (const o of rows){
      const items = Array.isArray(o.items) ? o.items : (o.item ? [{ name:o.item.name, unitPrice:o.item.price, qty:o.qty||1 }] : []);
      for (const it of items){
        const key = String(it.name||'Producto');
        const prev = acc.get(key) || { name:key, units:0, revenue:0 };
        const line = (typeof it.lineTotal==='number') ? Number(it.lineTotal||0) : (Number(it.unitPrice||0) * Number(it.qty||1));
        prev.units += Number(it.qty||1);
        prev.revenue += line;
        acc.set(key, prev);
      }
    }
    const arr = Array.from(acc.values()).sort((a,b)=> b.units-a.units || b.revenue-a.revenue);
    fillTable($('#tblTop tbody'), arr.slice(0,10).map(r=>[r.name, r.units, money(r.revenue)]));
    fillTable($('#tblLow tbody'), arr.slice(-10).map(r=>[r.name, r.units, money(r.revenue)]));

    // Por hora
    const perHour = new Map();
    for (const o of rows){
      const ms = toMs(o.createdAt || o.timestamps?.createdAt);
      const h = new Date(ms).getHours();
      const k = String(h).padStart(2,'0') + ':00';
      const prev = perHour.get(k) || { k, orders:0, rev:0 };
      prev.orders += 1;
      prev.rev += calcTotal(o);
      perHour.set(k, prev);
    }
    const arrH = Array.from(perHour.values()).sort((a,b)=> a.k.localeCompare(b.k));
    fillTable($('#tblHours tbody'), arrH.map(r=>[r.k, r.orders, money(r.rev)]));

    toast('Reporte generado');
  }catch(e){
    console.error(e);
    toast('Error al generar reporte');
  }
});
function fillTable(tbody, rows){
  if (!tbody) return;
  tbody.innerHTML = rows.length ? rows.map(tr=>`<tr>${tr.map(td=>`<td>${td}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="9">—</td></tr>';
}
function calcTotal(o={}){
  const sub = (typeof o.subtotal === 'number') ? Number(o.subtotal||0) :
    (Array.isArray(o.items) ? o.items.reduce((s,it)=> s+((typeof it.lineTotal==='number')?Number(it.lineTotal||0):(Number(it.unitPrice||0)*Number(it.qty||1))), 0)
                             : Number(o.item?.price||0) * Number(o.qty||1));
  const tip = Number(o.tip||0);
  return sub + tip;
}

/* ============== HISTORIAL ============== */
$('#btnHistLoad')?.addEventListener('click', loadHist);
$('#btnHistCSV')?.addEventListener('click', exportHistCSV);
async function loadHist(){
  const from = $('#repFrom')?.valueAsDate || new Date(new Date().setHours(0,0,0,0));
  const to   = $('#repTo')?.valueAsDate   || new Date();
  const type = $('#histType')?.value || 'all';
  const q    = ($('#histSearch')?.value||'').trim().toLowerCase();
  const limitN = Number($('#histLimit')?.value||50);

  const rowsAll = await DB.getOrdersRange({ from, to, includeArchive:true, orderType:type });
  let rows = rowsAll;
  if (q){
    rows = rows.filter(o=>{
      const base = [o.id, o.customer, o.orderMeta?.phone, o.phone].map(x=>String(x||'').toLowerCase()).join(' ');
      return base.includes(q);
    });
  }
  rows = rows.slice(-limitN);

  const tb = $('#tblHist tbody');
  tb.innerHTML = rows.length ? rows.map(o=>{
    const itemsTxt = Array.isArray(o.items) ? o.items.map(it=>`${it.qty||1}× ${it.name||'Item'}`).join(', ') : (o.item? `${o.qty||1}× ${o.item?.name||'Item'}` : '—');
    const st = String(o.status||'').toUpperCase();
    return `<tr>
      <td>${fmtDate(toMs(o.createdAt||o.timestamps?.createdAt))}</td>
      <td class="break">${o.customer||'-'}</td>
      <td>${o.orderMeta?.type || o.orderType || '-'}</td>
      <td class="break">${itemsTxt}</td>
      <td class="right">${money(calcTotal(o))}</td>
      <td>${st}</td>
      <td class="right">
        <button class="btn small ghost" data-a="open" data-id="${o.id}">Ver</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7">—</td></tr>';

  tb.onclick = (e)=>{
    const btn = e.target.closest('button[data-a="open"]'); if(!btn) return;
    const id = btn.dataset.id;
    window.open(`../track/?id=${encodeURIComponent(id)}`,'_blank');
  };

  toast('Historial cargado');
}
function exportHistCSV(){
  const rows = $$('#tblHist tbody tr').map(tr=> Array.from(tr.children).slice(0,6).map(td=> `"${td.textContent.replace(/"/g,'""')}"`).join(','));
  const header = ['Fecha','Cliente','Tipo','Artículos','Total','Estado'].join(',');
  download(`historial_${Date.now()}.csv`, [header, ...rows].join('\n'));
}

/* ============== COBROS ============== */
let unsubCob = null;
$('#btnCobrosRefresh')?.addEventListener('click', startCobros);
startCobros();
function startCobros(){
  unsubCob?.(); unsubCob = DB.subscribeActiveOrders(list=>{
    const pendingCharge = (list||[]).filter(o=> String(o.status||'').toUpperCase()==='DELIVERED' && !o.paid);
    fillTable($('#tblPorCobrar tbody'), pendingCharge.map(o=>[
      fmtDate(toMs(o.createdAt||o.timestamps?.createdAt)),
      o.customer||'-',
      o.orderMeta?.type || o.orderType || '-',
      `<div class="right">${money(calcTotal(o))}</div>`,
      o.orderMeta?.payMethodPref || '-',
      `<div class="right"><button class="btn small" data-a="charge" data-id="${o.id}">Cobrar</button></div>`
    ]));

    const hist = (list||[]).filter(o=> !!o.paid);
    const total = hist.reduce((s,o)=> s+Number(o.totalCharged||calcTotal(o)), 0);
    const by = { efectivo:0, tarjeta:0, transferencia:0, otro:0 };
    for (const o of hist){
      const m = String(o.payMethod||'otro').toLowerCase();
      if (by[m]==null) by.otro += Number(o.totalCharged||calcTotal(o)); else by[m] += Number(o.totalCharged||calcTotal(o));
    }
    $('#kpiCobrosCount').textContent = String(hist.length);
    $('#kpiCobrosTotal').textContent = money(total);
    $('#kpiCobrosEfe').textContent   = money(by.efectivo);
    $('#kpiCobrosTar').textContent   = money(by.tarjeta);
    $('#kpiCobrosTrans').textContent = money(by.transferencia);

    fillTable($('#tblCobrosHist tbody'), hist.map(o=>[
      fmtDate(toMs(o.paidAt||o.updatedAt||Date.now())),
      o.customer||'-',
      o.orderMeta?.type || o.orderType || '-',
      `<div class="right">${money(o.totalCharged||calcTotal(o))}</div>`,
      o.payMethod||'-'
    ]));
  });

  $('#tblPorCobrar tbody')?.addEventListener('click', async e=>{
    const btn = e.target.closest('button[data-a="charge"]'); if(!btn) return;
    const id = btn.dataset.id;
    btn.disabled = true;
    try{
      const method = prompt('Método (efectivo/tarjeta/transferencia):','efectivo');
      if (method==null) return;
      await DB.updateOrder(id, { paid:true, paidAt: new Date(), payMethod: method, totalCharged: null });
      await DB.setOrderStatus(id, 'DONE', {});
      toast('Cobro registrado');
    }catch(err){
      console.error(err); toast('Error al cobrar');
    }finally{ btn.disabled=false; }
  });
}

/* ============== COMPRAS ============== */
$('#btnAddPurchase')?.addEventListener('click', async ()=>{
  try{
    const name = $('#pName')?.value?.trim();
    const qty  = Number($('#pQty')?.value||0);
    const cost = Number($('#pCost')?.value||0);
    const vendor = $('#pVendor')?.value?.trim();
    if (!name || !(qty>0)) { toast('Completa nombre y cantidad'); return; }
    const purchase = { name, qty, totalCost: cost, vendor };
    await DB.recordPurchase({ itemId: name, qty, unitCost: (qty>0? (cost/qty) : 0), vendor, name });
    toast('Compra registrada');
    $('#pName').value=''; $('#pQty').value=''; $('#pCost').value=''; $('#pVendor').value='';
  }catch(e){ console.error(e); toast('Error al registrar compra'); }
});

/* ============== INVENTARIO ============== */
let INV_CACHE = [];
function renderInv(){
  const q = ($('#invSearch')?.value||'').toLowerCase();
  const list = INV_CACHE.filter(x=> !q || String(x.name||'').toLowerCase().includes(q));
  fillTable($('#tblInv tbody'), list.map(it=>{
    const val = Number(it.currentStock||0) * Number(it.costAvg||0);
    return [it.name||'-', Number(it.currentStock||0), it.unit||'-', money(it.costAvg||0), money(val)];
  }));
}
$('#btnInvRefresh')?.addEventListener('click', ()=> renderInv());
$('#invSearch')?.addEventListener('input', ()=> renderInv());
DB.subscribeInventory(list=>{ INV_CACHE = list||[]; renderInv(); });

/* ============== PROVEEDORES ============== */
$('#btnSaveVendor')?.addEventListener('click', async ()=>{
  try{
    const name = $('#vName')?.value?.trim();
    const contact = $('#vContact')?.value?.trim();
    if (!name){ toast('Completa el nombre'); return; }
    await DB.upsertSupplier({ name, contact, active:true });
    toast('Proveedor guardado'); $('#vName').value=''; $('#vContact').value='';
  }catch(e){ console.error(e); toast('Error al guardar proveedor'); }
});
DB.subscribeSuppliers(list=>{
  fillTable($('#tblVendors tbody'), (list||[]).map(v=>[v.name||'-', v.contact||'-', v.id||'-']));
});

/* ============== PRODUCTOS (sólo lectura por ahora) ============== */
$('#btnReloadCatalog')?.addEventListener('click', async ()=>{
  const cat = await DB.fetchCatalogWithFallback();
  const count = ['burgers','minis','drinks','sides'].reduce((s,k)=> s + (Array.isArray(cat[k])?cat[k].length:0), 0);
  toast(`Catálogo refrescado (${count} items)`);
});
DB.subscribeProducts(items=>{
  fillTable($('#tblProducts tbody'), (items||[]).map(p=>[
    p.name||'-', p.type||'-', money(p.price||0),
    p.active? '<span class="k-badge ok">Sí</span>':'<span class="k-badge warn">No</span>',
    p.id||'-'
  ]));
});

/* ============== RECETAS (sólo lectura + modal WIP) ============== */
let RECIPES = [];
DB.subscribeRecipes(list=>{
  RECIPES = list||[];
  fillTable($('#tblRecipes tbody'), RECIPES.map(r=>[
    r.name||'-', (r.baseYieldMl||0)+' ml', r.outputName||'-', (Array.isArray(r.ingredients)?r.ingredients.length:0),
    `<button class="btn small ghost" data-a="open" data-id="${r.id}">Ver</button>`
  ]));
});
$('#tblRecipes tbody')?.addEventListener('click', e=>{
  const btn = e.target.closest('button[data-a="open"]'); if(!btn) return;
  const rec = RECIPES.find(x=> x.id===btn.dataset.id); if(!rec) return;
  const modal = $('#rcpModal'); const body = $('#rcpBody'); const title = $('#rcpTitle');
  title.textContent = rec.name || 'Receta';
  body.innerHTML = `<div class="muted small">Rinde base: ${rec.baseYieldMl||0} ml</div>` +
    `<ul>${(rec.ingredients||[]).map(i=>`<li>${i.qty||''} ${i.unit||''} — ${i.name||''}</li>`).join('')}</ul>`;
  modal.style.display='grid';
});
$('#rcpClose')?.addEventListener('click', ()=> { $('#rcpModal').style.display='none'; });

/* ============== ARTÍCULOS (CRUD básico) ============== */
let ART_CACHE = [];
function renderArt(){
  const q = ($('#artSearch')?.value||'').toLowerCase();
  const rows = ART_CACHE.filter(a=> !q || String(a.name||'').toLowerCase().includes(q) || String(a.desc||'').toLowerCase().includes(q));
  const tb = $('#tblArticulos tbody');
  tb.innerHTML = rows.length ? rows.map(a=>`
    <tr>
      <td class="break">${a.name||'-'}</td>
      <td>${money(a.price||0)}</td>
      <td>${a.active?'<span class="badge-active">Sí</span>':'<span class="badge-inactive">No</span>'}</td>
      <td>
        <button class="btn small ghost" data-a="edit" data-id="${a.id}">Editar</button>
        <button class="btn small ghost" data-a="del" data-id="${a.id}">Borrar</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="4">—</td></tr>';
}
DB.subscribeArticles(list=>{ ART_CACHE = list||[]; renderArt(); });
$('#artSearch')?.addEventListener('input', renderArt);
$('#btnAddArticulo')?.addEventListener('click', ()=> openArticleModal());
$('#tblArticulos tbody')?.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const id = btn.dataset.id;
  const a = ART_CACHE.find(x=>x.id===id);
  if (btn.dataset.a==='edit') openArticleModal(a);
  if (btn.dataset.a==='del')  deleteArticle(id);
});

async function deleteArticle(id){
  if (!id) return;
  if (!confirm('¿Eliminar artículo?')) return;
  try{
    await DB.deleteArticle(id);
    toast('Artículo eliminado');
  }catch(e){ console.error(e); toast('Error al eliminar'); }
}

function openArticleModal(a={}){
  const modal = document.createElement('div');
  modal.className='modal open';
  modal.innerHTML = `
    <div class="modal-card" id="artModal">
      <div class="modal-head"><div class="display-font">${a?.id?'Editar':'Nuevo'} artículo</div>
        <button class="btn small ghost" data-close>Cerrar</button></div>
      <div class="modal-body">
        <div class="field"><label>Nombre</label><input id="artName" type="text" value="${a?.name||''}"></div>
        <div class="field"><label>Precio</label><input id="artPrice" type="number" min="0" step="0.01" value="${a?.price||0}"></div>
        <div class="field"><label>Activo</label>
          <select id="artActive"><option value="1"${a?.active!==false?' selected':''}>Sí</option><option value="0"${a?.active===false?' selected':''}>No</option></select>
        </div>
        <div class="field"><label>Descripción</label><textarea id="artDesc">${a?.desc||''}</textarea></div>
      </div>
      <div class="modal-foot">
        <div class="row" style="justify-content:flex-end; gap:8px">
          <button class="btn small" data-save>Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', async (e)=>{
    if (e.target.matches('[data-close]') || e.target===modal){ modal.remove(); return; }
    if (e.target.matches('[data-save]')){
      const name = $('#artName', modal).value.trim();
      const price = Number($('#artPrice', modal).value||0);
      const active = $('#artActive', modal).value === '1';
      const desc = $('#artDesc', modal).value.trim();
      if(!name){ toast('Nombre requerido'); return; }
      try{
        const payload = { id: a?.id, name, price, active, desc };
        await DB.upsertArticle(payload);
        toast('Artículo guardado');
        modal.remove();
      }catch(err){ console.error(err); toast('Error al guardar'); }
    }
  });
}

/* ======== HAPPY HOUR (vinculado a DB) ======== */
$('#btnSaveHappy')?.addEventListener('click', async ()=>{
  try{
    const enabled = ($('#hhEnabled')?.value==='on');
    const discountPercent = Number($('#hhDisc')?.value||0);
    const bannerText = $('#hhMsg')?.value||'';
    const durationMin = Number($('#hhDurMin')?.value||0) || null;
    const endsAt = $('#hhEndsAt')?.value ? new Date($('#hhEndsAt').value).getTime() : null;
    await DB.setHappyHour({ enabled, discountPercent, bannerText, durationMin, endsAt });
    toast('Happy Hour guardado');
  }catch(e){ console.error(e); toast('Error en Happy Hour'); }
});
DB.subscribeHappyHour(hh=>{
  const pill = $('#hhCountdown');
  if (!pill) return;
  if (!hh?.enabled){ pill.textContent='Inactivo'; pill.className='muted small'; return; }
  const endsMs = Number(hh.endsAt||0);
  const left = Math.max(0, endsMs - Date.now());
  const min = Math.floor(left/60000), sec = Math.floor((left%60000)/1000);
  pill.textContent = `Activo · faltan ${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  pill.className = 'muted small is-running';
});

/* ============== Init triggers por defecto ============== */
(function bootstrap(){
  // Activa primera pestaña por si HTML no marcó active
  if (!$('.tabs-admin .tab.is-active')) {
    const first = $('.tabs-admin .tab'); first?.click();
  }
  // Autocargar algunos paneles
  $('#btnRepGen')?.click();
  loadHist().catch(()=>{});
})();
