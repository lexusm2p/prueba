
import { subscribeOrders, listDeliveredBetween, startOfDay, endOfDay, listInventory, upsertInventory, getSettingsInventory, setSettingsInventory } from '../shared/db.js';
import { toast } from '../shared/notify.js';
import { BURGERS } from '../shared/menu-data.js';

function money(n){ return '$'+Number(n||0).toFixed(0); }
const tabs=document.getElementById('tabs');

// Tabs
tabs.addEventListener('click',(e)=>{
  const t=e.target.closest('.tab'); if(!t) return;
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tabpanel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('panel-'+t.dataset.tab).classList.add('active');
});

// ---------- Ventas del día ----------
const vCount=document.getElementById('vCount');
const vTotal=document.getElementById('vTotal');
const vAvg=document.getElementById('vAvg');
const vList=document.getElementById('vList');
const oCount=document.getElementById('oCount');
const oList=document.getElementById('oList');

async function loadVentas(){
  const from = startOfDay(new Date());
  const to   = endOfDay(new Date());
  const delivered = await listDeliveredBetween(from, to);
  const cnt = delivered.length;
  const tot = delivered.reduce((a,o)=> a + (Array.isArray(o.items)?o.orderTotal:o.subtotal||0), 0);
  vCount.textContent = cnt;
  vTotal.textContent = money(tot);
  vAvg.textContent = money(cnt? (tot/cnt):0);
  vList.innerHTML = delivered.map(o=>`${o.customer||'-'} · ${Array.isArray(o.items)?o.items.length+' items':o.item?.name} · ${money(Array.isArray(o.items)?o.orderTotal:o.subtotal)}`).join('<br>') || '—';
}

// En curso (snapshot vivo)
subscribeOrders(list=>{
  const open = list.filter(o=>o.status!=='READY' && o.status!=='DELIVERED');
  oCount.textContent = open.length;
  oList.innerHTML = open.map(o=>`${o.customer||'-'} · ${Array.isArray(o.items)?o.items.length+' items':o.item?.name}`).join('<br>') || '—';
});

// ---------- Inventario (auto min/max) ----------
const pLead=document.getElementById('pLead');
const pSafety=document.getElementById('pSafety');
const pReview=document.getElementById('pReview');
const pSave=document.getElementById('pSave');
const invBody=document.getElementById('invBody');
const invRefresh=document.getElementById('invRefresh');

// Mapear ingredientes del menú a claves de inventario
const BASE_MAP = new Set(['Pan','Carne','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza','Piña','Tocino','Jamón','Salchicha','Salsa Cheddar','Salsa Habanero','Aderezo Chipotle','Salsa Chimichurri','Cebolla caramelizada']);

// Cargar parámetros
async function loadParams(){
  const s = await getSettingsInventory();
  pLead.value = s.leadTimeDays ?? 3;
  pSafety.value = s.safetyStockDays ?? 2;
  pReview.value = s.reviewDays ?? 4;
}
pSave.onclick = async ()=>{
  await setSettingsInventory({ 
    leadTimeDays:Number(pLead.value||0),
    safetyStockDays:Number(pSafety.value||0),
    reviewDays:Number(pReview.value||0)
  });
  toast('Parámetros guardados');
  await buildInventoryTable();
};

// Calcular consumo promedio diario de últimos 14 días desde archive
async function computeUsage14(){
  const today = new Date();
  const from = new Date(today.getTime() - 14*24*60*60*1000);
  from.setHours(0,0,0,0);
  const to = endOfDay(today);
  const delivered = await listDeliveredBetween(from, to);

  const usage = {}; // { ingrediente: unidadesConsumed }
  function addUse(name, units){
    if(!name) return;
    if(!usage[name]) usage[name]=0;
    usage[name]+=units;
  }

  delivered.forEach(o=>{
    const items = Array.isArray(o.items) ? o.items : [{
      item:o.item, qty:o.qty, baseIngredients:o.baseIngredients, extras:o.extras
    }];
    items.forEach(it=>{
      const isMini = !!it.item?.mini;
      const factor = isMini ? 0.5 : 1; // minis usan ~50%
      // base
      (it.baseIngredients||[]).forEach(n=>{
        if(BASE_MAP.has(n)) addUse(n, (it.qty||1)*factor);
      });
      // extras ingredients (por porción)
      (it.extras?.ingredients||[]).forEach(n=>{
        addUse(n, (it.qty||1)); // cada extra seleccionado cuenta 1 porción por unidad
      });
      // extras sauces (por porción)
      (it.extras?.sauces||[]).forEach(n=>{
        // normaliza nombres a inventario si están dentro de BASE_MAP (algunas salsas están)
        addUse(n.replace('Aderezo ','Salsa '), (it.qty||1));
      });
      // carne extra si existiera se contaría en it.extras.patty
    });
  });

  // promedio diario
  const days = 14;
  const avg = {};
  Object.keys(usage).forEach(k=>{
    avg[k] = usage[k] / days;
  });
  return avg;
}

async function ensureInventorySeed(){
  const list = await listInventory();
  if(list.length) return list;
  // seed default items (stock 0)
  const seed = Array.from(BASE_MAP).map(n=>({ name:n, unit:'porción', stock:0 }));
  for(const it of seed){ await upsertInventory(it); }
  return await listInventory();
}

async function buildInventoryTable(){
  const [avg, settings, inv] = await Promise.all([ computeUsage14(), getSettingsInventory(), ensureInventorySeed() ]);
  const L = Number(settings.leadTimeDays||0);
  const S = Number(settings.safetyStockDays||0);
  const R = Number(settings.reviewDays||0);

  invBody.innerHTML = inv.map(it=>{
    const name = it.name;
    const stock = Number(it.stock||0);
    const u = it.unit || 'porción';
    const avgDay = Number(avg[name]||0);
    // Min/Max (días de cobertura): min = avg*(L+S); max = avg*(L+S+R)
    const minRec = Math.ceil(avgDay * (L+S));
    const maxRec = Math.ceil(avgDay * (L+S+R));
    const toBuy = Math.max(0, maxRec - stock);
    return `<tr data-id="${it.id}">
      <td>${name}</td>
      <td>${u}</td>
      <td><input type="number" class="small" value="${stock}" data-f="stock"></td>
      <td>${avgDay.toFixed(2)}</td>
      <td>${minRec}</td>
      <td>${maxRec}</td>
      <td><b>${toBuy}</b></td>
      <td><button class="btn small" data-a="save">Guardar</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="muted">Sin inventario</td></tr>';

  // wire save buttons
  invBody.querySelectorAll('button[data-a="save"]').forEach(btn=>{
    btn.onclick = async ()=>{
      const tr = btn.closest('tr'); const id = tr.dataset.id;
      const stock = Number(tr.querySelector('input[data-f="stock"]').value||0);
      await upsertInventory({ id, stock, name: tr.children[0].textContent.trim(), unit: tr.children[1].textContent.trim() });
      toast('Inventario actualizado');
      await buildInventoryTable();
    };
  });
}

document.getElementById('invRefresh').onclick = buildInventoryTable;

loadParams().then(()=>{
  loadVentas();
  buildInventoryTable();
});
