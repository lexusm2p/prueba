// /admin/app.js
// Panel Admin — Productos, Extras, Settings.
// Requiere funciones expuestas en /shared/db.js

import {
  subscribeProducts, upsertProduct, deleteProduct,
  subscribeExtras, setSauces, setIngredients,
  subscribeSettings, setSettings
} from '../shared/db.js';
import { toast, beep } from '../shared/notify.js';

/* ========================
   Helpers DOM / formatting
   ======================== */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const money = n => '$' + (Number(n||0).toFixed(0));
const txtToList = (t='') => t.split('\n').map(s=>s.trim()).filter(Boolean);
const csvToList = (t='') => t.split(',').map(s=>s.trim()).filter(Boolean);

/* ========================
   Productos
   ======================== */
const pId = $('#pId');
const pName = $('#pName');
const pType = $('#pType');
const pPrice = $('#pPrice');
const pIngredients = $('#pIngredients');
const pSalsaDefault = $('#pSalsaDefault');
const pSalsasSugeridas = $('#pSalsasSugeridas');
const pIcon = $('#pIcon');
const pBaseOf = $('#pBaseOf');
const pActive = $('#pActive');
const prodList = $('#prodList');

$('#btnResetProd').onclick = resetProdForm;
$('#btnSaveProd').onclick = saveProduct;

function resetProdForm(){
  pId.value = '';
  pName.value = '';
  pType.value = 'big';
  pPrice.value = 0;
  pIngredients.value = '';
  pSalsaDefault.value = '';
  pSalsasSugeridas.value = '';
  pIcon.value = '';
  pBaseOf.value = '';
  pActive.checked = true;
}

async function saveProduct(){
  const payload = {
    id: pId.value.trim() || undefined,
    name: pName.value.trim(),
    type: pType.value,
    price: Number(pPrice.value||0),
    ingredients: txtToList(pIngredients.value),
    salsaDefault: pSalsaDefault.value.trim() || null,
    salsasSugeridas: csvToList(pSalsasSugeridas.value),
    icon: pIcon.value.trim(),
    baseOf: pBaseOf.value.trim() || null,
    active: !!pActive.checked
  };

  if(!payload.name){ toast('Escribe un nombre'); return; }
  if(payload.type==='mini' && !payload.baseOf){
    // no es obligatorio, pero recomendado
    console.warn('Mini sin baseOf, se permite pero no heredará ingredientes.');
  }

  try{
    const id = await upsertProduct(payload);
    beep(); toast('Producto guardado: ' + id);
    resetProdForm();
  }catch(e){
    console.error(e); toast('Error guardando producto');
  }
}

function renderProducts(list){
  if(!list || list.length===0){
    prodList.innerHTML = `<div class="muted small" style="padding:10px">Sin productos aún.</div>`;
    return;
  }
  prodList.innerHTML = list.map(p=>`
    <div class="item" data-id="${p.id}">
      <div>
        <div><b>${escapeHtml(p.name||'-')}</b> ${p.active?'<span class="pill">activo</span>':'<span class="pill" style="background:#3a1820">inactivo</span>'}</div>
        <div class="muted small">
          ${p.type==='mini' ? 'Mini' : 'Grande'} · ${money(p.price)}
          ${p.baseOf? ` · baseOf: <code>${escapeHtml(p.baseOf)}</code>`:''}
        </div>
      </div>
      <div class="row" style="gap:6px">
        <button class="btn ghost small" data-a="edit">Editar</button>
        <button class="btn danger small" data-a="del">Borrar</button>
      </div>
    </div>
  `).join('');

  prodList.onclick = async (e)=>{
    const btn = e.target.closest('button[data-a]'); if(!btn) return;
    const row = btn.closest('[data-id]'); const id = row.dataset.id;
    const p = list.find(x=>x.id===id); if(!p) return;

    if(btn.dataset.a==='edit'){
      // Cargar en el form
      pId.value = p.id || '';
      pName.value = p.name || '';
      pType.value = p.type || 'big';
      pPrice.value = Number(p.price||0);
      pIngredients.value = (p.ingredients||[]).join('\n');
      pSalsaDefault.value = p.salsaDefault || '';
      pSalsasSugeridas.value = (p.salsasSugeridas||[]).join(', ');
      pIcon.value = p.icon || '';
      pBaseOf.value = p.baseOf || '';
      pActive.checked = p.active!==false;
      toast('Editando: '+ (p.name||p.id));
    }

    if(btn.dataset.a==='del'){
      const ok = confirm('¿Eliminar producto "'+(p.name||id)+'"?');
      if(!ok) return;
      try{
        await deleteProduct(id);
        beep(); toast('Producto eliminado');
      }catch(e){
        console.error(e); toast('Error al eliminar');
      }
    }
  };
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

// Suscripción en vivo
subscribeProducts(renderProducts);

/* ========================
   Extras (aderezos / ingredientes)
   ======================== */
const tblSauces = $('#tblSauces tbody');
const tblIngs   = $('#tblIngs tbody');

$('#btnAddSauceRow').onclick = ()=> addRow(tblSauces, {name:'', price:0});
$('#btnAddIngRow').onclick   = ()=> addRow(tblIngs,   {name:'', price:0});

$('#btnSaveSauces').onclick = async ()=>{
  const items = tableToItems(tblSauces);
  try{
    await setSauces(items);
    beep(); toast('Aderezos guardados');
  }catch(e){
    console.error(e); toast('Error guardando aderezos');
  }
};
$('#btnSaveIngs').onclick = async ()=>{
  const items = tableToItems(tblIngs);
  try{
    await setIngredients(items);
    beep(); toast('Ingredientes extra guardados');
  }catch(e){
    console.error(e); toast('Error guardando ingredientes');
  }
};

function addRow(tbody, item){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" value="${escapeHtml(item.name||'')}" placeholder="Nombre"/></td>
    <td style="text-align:right"><input type="number" min="0" step="1" value="${Number(item.price||0)}" style="width:90px;text-align:right"/></td>
    <td style="text-align:right"><button class="btn ghost small" type="button" data-a="rm">×</button></td>
  `;
  tbody.appendChild(tr);
  tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
}
function tableToItems(tbody){
  return Array.from(tbody.querySelectorAll('tr')).map(tr=>{
    const [iName, iPrice] = tr.querySelectorAll('input');
    return { name: (iName.value||'').trim(), price: Number(iPrice.value||0) };
  }).filter(x=>x.name);
}

subscribeExtras(({sauces, ingredients})=>{
  // Render sauces
  tblSauces.innerHTML = '';
  (sauces||[]).forEach(s=> addRow(tblSauces, s));
  if ((sauces||[]).length===0) addRow(tblSauces, {name:'Aderezo chipotle', price:8});

  // Render ingredients
  tblIngs.innerHTML = '';
  (ingredients||[]).forEach(i=> addRow(tblIngs, i));
  if ((ingredients||[]).length===0) addRow(tblIngs, {name:'Tocino', price:10});
});

/* ========================
   Settings (app)
   ======================== */
const sDlc        = $('#sDlc');
const sSaucePrice = $('#sSaucePrice');
const sIngPrice   = $('#sIngPrice');
$('#btnSaveSettings').onclick = async ()=>{
  const patch = {
    dlcCarneMini: Number(sDlc.value||12),
    saucePrice:   Number(sSaucePrice.value||8),
    ingredientPrice: Number(sIngPrice.value||10),
  };
  try{
    await setSettings(patch);
    beep(); toast('Settings guardados');
  }catch(e){
    console.error(e); toast('Error guardando settings');
  }
};

subscribeSettings((cfg)=>{
  if(!cfg) return;
  if(cfg.dlcCarneMini!=null) sDlc.value = Number(cfg.dlcCarneMini);
  if(cfg.saucePrice!=null)   sSaucePrice.value = Number(cfg.saucePrice);
  if(cfg.ingredientPrice!=null) sIngPrice.value = Number(cfg.ingredientPrice);
});
