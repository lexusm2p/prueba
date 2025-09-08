/* ============== Historial de pedidos ============== */
let HIST_RAW = [];
let HIST_ROWS = [];

const HIST_LIMIT_DEFAULT = 50;

// Listeners UI
q('#btnHistLoad')?.addEventListener('click', ()=> loadHistory());
q('#histSearch')?.addEventListener('input', renderHistoryTable);
q('#histType')?.addEventListener('change', renderHistoryTable);
q('#histState')?.addEventListener('change', renderHistoryTable);
q('#histLimit')?.addEventListener('input', renderHistoryTable);
q('#btnHistCSV')?.addEventListener('click', exportHistoryCSV);

// Carga desde Firestore usando TUS inputs existentes de reportes
async function loadHistory(){
  try{
    const from = new Date((q('#repFrom')?.value||'') + 'T00:00:00');
    const to   = new Date((q('#repTo')?.value||'')   + 'T23:59:59');

    const orderTypeSel = (q('#histType')?.value || 'all');
    const orderType = orderTypeSel === 'all' ? null : orderTypeSel;

    const includeArchive = (q('#repHist')?.value !== 'No');

    const list = await getOrdersRange({ from, to, includeArchive, orderType });

    // Normalizamos timestamps y ordenamos por fecha DESC
    HIST_RAW = (list||[]).map(o=>{
      const d = o.createdAt?.toDate?.() || o.createdAt || new Date();
      return { ...o, __ts: new Date(d).getTime() || 0 };
    }).sort((a,b)=> b.__ts - a.__ts);

    renderHistoryTable();
    toast(`Historial cargado: ${HIST_RAW.length} pedidos`);
  }catch(e){
    console.error(e);
    toast('No se pudo cargar historial');
  }
}

function renderHistoryTable(){
  const tb = q('#tblHist tbody'); if(!tb) return;

  const term = (q('#histSearch')?.value || '').toLowerCase().trim();
  const state = (q('#histState')?.value || 'all');
  const limit = Number(q('#histLimit')?.value || HIST_LIMIT_DEFAULT);

  // Filtrado
  let rows = HIST_RAW.filter(o=>{
    if (state !== 'all' && String(o.status||'').toUpperCase() !== state) return false;
    if (term){
      const hay = [
        o.customerName || '',
        o.orderMeta?.phone || '',
        o.id || '',
      ].join(' ').toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  // Límite
  if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);

  HIST_ROWS = rows;

  tb.innerHTML = (rows.length ? rows.map(o=>{
    const d = fmtDateTime(o.__ts);
    const name = esc(o.customerName || '—');
    const typ = esc(o.orderMeta?.type || o.type || '—');
    const items = (o.items||[]).reduce((a,i)=> a + Number(i.qty||1), 0);
    const total = fmtMoney(o.subtotal || 0);
    const st = String(o.status||'').toUpperCase();

    return `<tr>
      <td>${d}</td>
      <td>${name}<div class="muted small">${esc(o.orderMeta?.phone || '')}</div></td>
      <td>${typ}</td>
      <td>${items}</td>
      <td>${total}</td>
      <td>${badge(st)}</td>
      <td class="right">
        <button class="btn small ghost" data-a="hist-detail" data-id="${escAttr(o.id||'')}">Ver</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7">—</td></tr>');

}

// Detalle (modal)
document.addEventListener('click', (e)=>{
  const b = e.target.closest('[data-a="hist-detail"]'); if(!b) return;
  const id = b.dataset.id;
  const o = HIST_RAW.find(x=> x.id === id);
  if (o) openOrderModal(o);
});

function openOrderModal(o){
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.setAttribute('role','dialog');
  wrap.setAttribute('aria-modal','true');
  wrap.style.display = 'grid';

  const itemsHtml = (o.items||[]).map(it=>{
    const qty = Number(it.qty||1);
    const up  = Number(it.unitPrice||0);
    const lt  = Number(it.lineTotal ?? (qty*up));
    return `<tr>
      <td>${esc(it.name || it.id || '—')}</td>
      <td>${qty}</td>
      <td>${fmtMoney(up)}</td>
      <td>${fmtMoney(lt)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4">—</td></tr>';

  const meta = o.orderMeta||{};
  const dt = fmtDateTime(o.__ts);

  wrap.innerHTML = `
    <div class="modal-card" style="max-width:760px">
      <div class="modal-head">
        <div>Pedido #${esc(o.id||'')}</div>
        <button class="btn ghost small" id="ordClose">Cerrar</button>
      </div>
      <div class="modal-body">
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
          <div class="field"><label>Fecha</label><div>${dt}</div></div>
          <div class="field"><label>Cliente</label><div>${esc(o.customerName||'—')}</div></div>
          <div class="field"><label>Teléfono</label><div>${esc(meta.phone||'')}</div></div>
          <div class="field"><label>Tipo</label><div>${esc(meta.type || o.type || '—')}</div></div>
          <div class="field"><label>Estado</label><div>${badge(String(o.status||'').toUpperCase())}</div></div>
          <div class="field"><label>Total</label><div>${fmtMoney(o.subtotal||0)}</div></div>
          <div class="field" style="grid-column:1/-1"><label>Notas</label><div>${esc(o.notes||meta.notes||'')}</div></div>
        </div>

        <div class="field"><label>Artículos</label>
          <div class="table-wrap" style="overflow:auto;max-height:300px;border:1px solid rgba(255,255,255,.08);border-radius:10px">
            <table class="table">
              <thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Importe</th></tr></thead>
              <tbody>${itemsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <div class="total-bar">
          <div></div>
          <div class="row" style="gap:8px">
            <button class="btn ghost small" id="ordCopy">Copiar resumen</button>
            <button class="btn" id="ordClose2">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = ()=> wrap.remove();
  wrap.querySelector('#ordClose')?.addEventListener('click', close);
  wrap.querySelector('#ordClose2')?.addEventListener('click', close);
  wrap.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });

  wrap.querySelector('#ordCopy')?.addEventListener('click', ()=>{
    const lines = [];
    lines.push(`Pedido ${o.id} — ${fmtDateTime(o.__ts)}`);
    lines.push(`Cliente: ${o.customerName||'-'}  Tel: ${o.orderMeta?.phone||'-'}`);
    lines.push(`Tipo: ${o.orderMeta?.type || o.type || '-'}`);
    lines.push(`Estado: ${o.status||'-'}`);
    lines.push('');
    (o.items||[]).forEach(it=>{
      const qty = Number(it.qty||1);
      const up  = Number(it.unitPrice||0);
      const lt  = Number(it.lineTotal ?? (qty*up));
      lines.push(`- ${it.name||it.id||'Item'} x${qty}  ${fmtMoney(up)}  = ${fmtMoney(lt)}`);
    });
    lines.push('');
    lines.push(`Total: ${fmtMoney(o.subtotal||0)}`);
    navigator.clipboard?.writeText(lines.join('\n'));
    toast('Resumen copiado');
  });
}

function exportHistoryCSV(){
  if (!HIST_ROWS.length){ beep(); toast('Nada para exportar'); return; }
  const head = ['id','fecha','cliente','telefono','tipo','estado','articulos','total'];
  const rows = HIST_ROWS.map(o=>{
    const items = (o.items||[]).reduce((a,i)=> a + Number(i.qty||1), 0);
    return [
      safe(o.id),
      new Date(o.__ts).toISOString(),
      safe(o.customerName||''),
      safe(o.orderMeta?.phone||''),
      safe(o.orderMeta?.type || o.type || ''),
      safe(o.status||''),
      String(items),
      String(Number(o.subtotal||0).toFixed(2))
    ];
  });
  const csv = [head, ...rows].map(r=> r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `historial_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('CSV exportado');
}

function csvCell(s){
  const str = String(s ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g,'""')}"`;
  return str;
}
function safe(s){ return String(s??''); }
function fmtDateTime(ts){
  if (!ts) return '—';
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
function badge(state){
  const s = String(state||'').toUpperCase();
  const color =
    s==='READY'    ? '#3ddc84' :
    s==='COOKING'  ? '#ffd166' :
    s==='CHARGED'  ? '#7aa2ff' :
    s==='CANCELLED'? '#ff7b7b' : '#aaa';
  return `<span style="display:inline-block;padding:.15rem .5rem;border-radius:999px;background:${color}22;color:${color};border:1px solid ${color}33">${s||'—'}</span>`;
}

// Carga inicial opcional cuando se abre la pestaña de historial
document.addEventListener('click', (e)=>{
  const t = e.target.closest('.tab[data-tab="hist"]'); if(!t) return;
  // Si no hay datos, intentamos cargar con los rangos actuales
  if (!HIST_RAW.length) loadHistory();
});
