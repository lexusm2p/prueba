// /admin/app.js
// Reportes de ventas (Admin)
// Lee órdenes de /orders y /orders_archive usando db.getOrdersRange()
// Muestra: KPIs, Top/Low productos, ventas por hora y split Pickup/Mesa.

import { getOrdersRange } from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const money = n => '$' + (Number(n||0).toFixed(0));

// ---- Filtros: defaults (últimos 7 días) ----
(function setDefaultDates(){
  const today = new Date();
  const toStr = (d)=> d.toISOString().slice(0,10);
  const d7 = new Date(today); d7.setDate(d7.getDate()-7);
  $('#fFrom').value = toStr(d7);
  $('#fTo').value   = toStr(today);
})();

// ---- Click "Generar" ----
$('#btnRunReport').onclick = async ()=>{
  try{
    const from = parseDate($('#fFrom').value);
    const to   = endOfDay(parseDate($('#fTo').value));
    const orderType = $('#fType').value || null;
    const includeArchive = $('#fArchived').value === '1';

    if(!from || !to){ toast('Rango inválido'); return; }

    const orders = await getOrdersRange({ from, to, includeArchive, orderType });
    beep();
    renderReport(orders);
  }catch(e){
    console.error(e);
    toast('No se pudo generar el reporte');
  }
};

function parseDate(iso){ if(!iso) return null; const d=new Date(iso+'T00:00:00'); return isNaN(d)?null:d; }
function endOfDay(d){ if(!d) return null; const x=new Date(d); x.setHours(23,59,59,999); return x; }

// ---- Render principal ----
function renderReport(orders){
  // Normaliza esquema: soporta órdenes con items[] (nuevo) o item/qty (legacy)
  const lines = [];
  for (const o of orders){
    const when = o.createdAt? o.createdAt.toDate? o.createdAt.toDate() : new Date(o.createdAt) : null;
    const type = o.orderType || null; // 'pickup' | 'dinein' | null
    if (Array.isArray(o.items) && o.items.length){
      for (const l of o.items){
        lines.push({
          name: l.name || (l.id || 'Producto'),
          qty: Number(l.qty||1),
          revenue: Number(l.lineTotal || (l.unitPrice||0)*(l.qty||1)),
          when, type
        });
      }
    }else{
      // legacy: un solo item
      lines.push({
        name: o.item?.name || 'Producto',
        qty: Number(o.qty||1),
        revenue: Number(o.subtotal||0) || Number(o.item?.price||0)*Number(o.qty||1),
        when, type
      });
    }
  }

  // KPIs
  const orderCount = orders.length;
  const totalItems = lines.reduce((a,l)=> a + l.qty, 0);
  const revenue    = lines.reduce((a,l)=> a + l.revenue, 0);
  const atp        = orderCount ? (revenue / orderCount) : 0;
  $('#kpiOrders').textContent  = String(orderCount);
  $('#kpiItems').textContent   = String(totalItems);
  $('#kpiRevenue').textContent = money(revenue);
  $('#kpiATP').textContent     = money(atp);

  // Split por tipo
  let pickCnt=0, dineCnt=0, pickRev=0, dineRev=0;
  for (const o of orders){
    const t = o.orderType || '';
    const sub = Number(o.subtotal||0);
    if(t==='pickup'){ pickCnt++; pickRev += sub; }
    else if(t==='dinein'){ dineCnt++; dineRev += sub; }
  }
  $('#kpiSplit').textContent = `Pickup ${pickCnt} / Mesa ${dineCnt}`;

  // Top productos y baja rotación
  const agg = new Map(); // name -> {qty, revenue}
  for (const l of lines){
    const k = l.name;
    const a = agg.get(k) || { qty:0, revenue:0 };
    a.qty += l.qty; a.revenue += l.revenue;
    agg.set(k, a);
  }
  const rows = [...agg.entries()].map(([name, v])=>({ name, qty:v.qty, revenue:v.revenue }));
  const top  = [...rows].sort((a,b)=> b.qty - a.qty).slice(0,10);
  const low  = [...rows].sort((a,b)=> a.qty - b.qty).slice(0,10);

  // Ventas por hora
  const byHour = new Map(); // 'HH:00' -> {orders,revenue}
  const seenOrdersByHour = new Map(); // para contar órdenes únicas por hora
  for (const o of orders){
    const d = o.createdAt? (o.createdAt.toDate? o.createdAt.toDate() : new Date(o.createdAt)) : null;
    if(!d) continue;
    const key = String(d.getHours()).padStart(2,'0') + ':00';
    const stat = byHour.get(key) || { orders:0, revenue:0 };
    // cuenta órdenes (1 por orden) por hora
    const oid = o.id;
    const seenKey = key+'|'+oid;
    if(!seenOrdersByHour.has(seenKey)){
      stat.orders += 1;
      seenOrdersByHour.set(seenKey, true);
    }
    stat.revenue += Number(o.subtotal||0);
    byHour.set(key, stat);
  }
  const hourRows = [...byHour.entries()]
    .sort((a,b)=> a[0].localeCompare(b[0]))
    .map(([h, v])=>({ hour:h, orders:v.orders, revenue:v.revenue }));

  // Render tablas
  renderTable('#tblTop tbody', top);
  renderTable('#tblLow tbody', low);
  renderHours('#tblHours tbody', hourRows);
}

function renderTable(sel, data){
  const tb = document.querySelector(sel);
  if(!data.length){ tb.innerHTML = `<tr><td colspan="3" class="muted">—</td></tr>`; return; }
  tb.innerHTML = data.map(r=>`
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${r.qty}</td>
      <td class="num">${money(r.revenue)}</td>
    </tr>
  `).join('');
}

function renderHours(sel, data){
  const tb = document.querySelector(sel);
  if(!data.length){ tb.innerHTML = `<tr><td colspan="3" class="muted">—</td></tr>`; return; }
  tb.innerHTML = data.map(r=>`
    <tr>
      <td>${r.hour}</td>
      <td class="num">${r.orders}</td>
      <td class="num">${money(r.revenue)}</td>
    </tr>
  `).join('');
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }