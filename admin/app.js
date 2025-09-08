/* ============== HISTORIAL (panel-hist) ============== */
let HIST_ALL = [];
let HIST_TIMER = null;

const histSearchEl = document.getElementById('histSearch');
const histTypeEl   = document.getElementById('histType');
const histStateEl  = document.getElementById('histState');
const histLimitEl  = document.getElementById('histLimit');

document.getElementById('btnHistLoad')?.addEventListener('click', ()=> loadHistory());
document.getElementById('btnHistCSV')?.addEventListener('click', exportHistoryCSV);
histSearchEl?.addEventListener('input', renderHistory);
histTypeEl?.addEventListener('change', renderHistory);
histStateEl?.addEventListener('change', renderHistory);
histLimitEl?.addEventListener('input', renderHistory);

// ── Auto‑refresh cada 10s si la pestaña Historial está activa ────────────────
tabs.addEventListener('click', (e)=>{
  const t = e.target.closest('.tab'); if (!t) return;
  if (t.dataset.tab === 'hist'){ startHistAutoRefresh(); loadHistory(); }
  else { stopHistAutoRefresh(); }
});
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden) stopHistAutoRefresh();
  else if (isHistActive()) startHistAutoRefresh();
});
function isHistActive(){ return document.getElementById('panel-hist')?.classList.contains('active'); }
function startHistAutoRefresh(){ stopHistAutoRefresh(); HIST_TIMER = setInterval(()=>{ if(isHistActive()) loadHistory(false); }, 10000); }
function stopHistAutoRefresh(){ if (HIST_TIMER){ clearInterval(HIST_TIMER); HIST_TIMER=null; } }

// ── Carga de historial (hoy por defecto; límite configurable) ────────────────
async function loadHistory(showToast = true){
  try{
    // Si quieres forzar SIEMPRE hoy, ignora los inputs de reportes aquí:
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0);
    const to   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);

    const includeArchive = (document.getElementById('repHist')?.value !== 'No');

    // Traemos TODO el día y filtramos/limitamos en UI
    const ords = await getOrdersRange({ from, to, includeArchive, orderType: null });

    HIST_ALL = (ords||[]).map(o=>{
      const t = o.createdAt?.toDate?.() || o.createdAt || new Date();
      const when = new Date(t);
      const num = o.number ?? o.orderNumber ?? o.no ?? null;
      const custName = o.customerName ?? o.customer?.name ?? o.client?.name ?? '';
      const phone = o.customerPhone ?? o.customer?.phone ?? o.client?.phone ?? '';
      const state = (o.state || o.status || '').toString().toUpperCase();
      const type  = (o.orderType || o.type || '').toString().toLowerCase();
      const total = Number(o.total ?? o.subtotal ?? 0);
      const items = (o.items||[]).map(i => ({ name: i.name || i.id || '', qty: Number(i.qty||1) }));
      return { id:o.id, _ts:when.getTime(), when, num, custName, phone, state, type, total, items };
    }).sort((a,b)=> b._ts - a._ts);

    // Si la pestaña no tiene un límite aún, por UX pon 5
    if (histLimitEl && !histLimitEl.dataset.touched){
      histLimitEl.value = '5';
    }

    renderHistory();
    if (showToast) toast('Historial actualizado');
  }catch(err){
    console.error(err);
    toast('No se pudo cargar el historial');
  }
}

// ── Pintado + búsqueda/filters/limit ─────────────────────────────────────────
function renderHistory(){
  const tb = document.querySelector('#tblHist tbody'); if (!tb) return;
  const qraw  = (histSearchEl?.value || '').trim();
  const qstr  = qraw.toLowerCase();
  const typeF = histTypeEl?.value || 'all';
  const stateF= (histStateEl?.value || 'all').toUpperCase();

  // marca que el usuario tocó el límite (para no pisarlo luego)
  if (histLimitEl) histLimitEl.dataset.touched = '1';
  const limit = Math.max(1, Number(histLimitEl?.value||5) || 5);

  const rows = HIST_ALL.filter(o=>{
    if (typeF !== 'all' && o.type !== typeF) return false;
    if (stateF !== 'ALL' && o.state !== stateF) return false;
    if (!qstr) return true;

    const id    = (o.id||'').toLowerCase();
    const num   = (o.num==null ? '' : String(o.num)).toLowerCase();
    const name  = (o.custName||'').toLowerCase();
    const phone = (o.phone||'').toLowerCase();
    const type  = (o.type||'').toLowerCase();
    const state = (o.state||'').toLowerCase();
    const items = o.items.map(i=> `${i.name} x${i.qty}`).join(' ').toLowerCase();

    // Si escribe solo dígitos, permite match exacto con número de pedido
    if (qraw && /^\d+$/.test(qraw) && num === qraw) return true;

    return id.includes(qstr) || num.includes(qstr) || name.includes(qstr) ||
           phone.includes(qstr) || type.includes(qstr) || state.includes(qstr) ||
           items.includes(qstr);
  }).slice(0, limit);

  const html = rows.map(o=>{
    const d = o.when;
    const fecha = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const tag = o.type==='pickup' ? 'Pickup' : (o.type==='dinein' ? 'Mesa' : (o.type||'-'));
    const itemsText = o.items.map(i=> `${esc(i.name)} x${i.qty}`).join(', ');
    const numTxt = (o.num!=null) ? `#${esc(o.num)}` : (o.id||'—');
    const badgeCls = (o.state==='READY' || o.state==='CHARGED') ? 'ok' : 'warn';

    return `<tr>
      <td>${fecha}</td>
      <td>${esc(o.custName||'—')}<div class="muted small">${esc(o.phone||'')}</div></td>
      <td>${esc(tag)}</td>
      <td style="max-width:420px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis">${itemsText||'—'}</td>
      <td class="right">${fmtMoney(o.total)}</td>
      <td><span class="k-badge ${badgeCls}">${esc(o.state||'-')}</span></td>
      <td class="right"><span class="muted small mono">${numTxt}</span></td>
    </tr>`;
  }).join('');

  tb.innerHTML = html || '<tr><td colspan="7">—</td></tr>';
}

// ── Exportar CSV respetando lo filtrado/limitado ─────────────────────────────
function exportHistoryCSV(){
  const qraw  = (histSearchEl?.value || '').trim();
  const qstr  = qraw.toLowerCase();
  const typeF = histTypeEl?.value || 'all';
  const stateF= (histStateEl?.value || 'all').toUpperCase();
  const limit = Math.max(1, Number(histLimitEl?.value||5) || 5);

  const rows = HIST_ALL.filter(o=>{
    if (typeF !== 'all' && o.type !== typeF) return false;
    if (stateF !== 'ALL' && o.state !== stateF) return false;
    if (!qstr) return true;
    const id    = (o.id||'').toLowerCase();
    const num   = (o.num==null ? '' : String(o.num)).toLowerCase();
    const name  = (o.custName||'').toLowerCase();
    const phone = (o.phone||'').toLowerCase();
    const type  = (o.type||'').toLowerCase();
    const state = (o.state||'').toLowerCase();
    const items = o.items.map(i=> `${i.name} x${i.qty}`).join(' ').toLowerCase();
    if (qraw && /^\d+$/.test(qraw) && num === qraw) return true;
    return id.includes(qstr) || num.includes(qstr) || name.includes(qstr) ||
           phone.includes(qstr) || type.includes(qstr) || state.includes(qstr) ||
           items.includes(qstr);
  }).slice(0, limit);

  const header = ['Fecha','Numero/ID','Cliente','Teléfono','Tipo','Estado','Artículos','Total'];
  const lines = [header.join(',')];
  for (const o of rows){
    const d = o.when;
    const fecha = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const numTxt = (o.num!=null) ? `#${o.num}` : (o.id||'');
    const items = o.items.map(i=> `${i.name} x${i.qty}`).join(' | ');
    const csvRow = [
      fecha, numTxt, o.custName||'', o.phone||'',
      o.type||'', o.state||'', items, Number(o.total||0).toFixed(2)
    ].map(csvEscape).join(',');
    lines.push(csvRow);
  }
  const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `historial_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}
function csvEscape(v){ const s = String(v??''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

// ── Carga automática: últimos 5 de hoy al abrir Admin ───────────────────────
(function autoLoadHistOnBoot(){
  try{
    // arranca con 5
    if (histLimitEl) { histLimitEl.value = '5'; histLimitEl.dataset.touched = '1'; }
    loadHistory(false);
  }catch(_){}
})();
