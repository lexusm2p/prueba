// /admin/app.js
// Admin: mantiene lo que ya tenías + agrega CRUD de catálogo conectado a Firestore.

import { beep, toast } from '../shared/notify.js';

// ⬇️ NUEVO: utilidades de catálogo desde shared/db.js
import { subscribeProducts, upsertProduct, deleteProduct } from '../shared/db.js';

// ========== TUS COSAS EXISTENTES (si las usas aquí) ==========
// import { subscribeOrders, setStatus, archiveDelivered } from '../shared/db.js';
// Mantengo esas líneas comentadas si este admin ya no maneja órdenes.
// Si las necesitas, vuelve a habilitarlas y agrega la UI correspondiente.

// ------------------------------------------------------------------
// 1) UI helpers
// ------------------------------------------------------------------
const $ = (sel)=> document.querySelector(sel);
const $$ = (sel)=> Array.from(document.querySelectorAll(sel));

function parseList(text){
  // Convierte textarea "uno por línea" en array limpio
  return String(text||'')
    .split('\n')
    .map(s=>s.trim())
    .filter(Boolean);
}
function parseCsv(text){
  // Convierte "a, b, c" en ["a","b","c"]
  return String(text||'')
    .split(',')
    .map(s=>s.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------
// 2) Lista en tiempo real del catálogo
// ------------------------------------------------------------------
const rowsEl = $('#catRows');
let CURRENT = []; // cache para edición

subscribeProducts((items)=>{
  CURRENT = items || [];
  if(!CURRENT.length){
    rowsEl.innerHTML = `<tr><td colspan="8" class="muted">Sin productos</td></tr>`;
    return;
  }
  rowsEl.innerHTML = CURRENT.map(p=>`
    <tr data-id="${p.id}">
      <td>${p.id||''}</td>
      <td>${p.name||''}</td>
      <td>${p.category||''}</td>
      <td>$${Number(p.price||0).toFixed(0)}</td>
      <td>${p.mini? 'Sí':'No'}</td>
      <td>${p.baseOf||''}</td>
      <td>${p.active!==false? 'Sí':'No'}</td>
      <td style="white-space:nowrap">
        <button class="btn small ghost" data-a="edit">Editar</button>
        <button class="btn small danger" data-a="del">Borrar</button>
      </td>
    </tr>
  `).join('');
});

// ------------------------------------------------------------------
// 3) Handlers fila (editar/eliminar)
// ------------------------------------------------------------------
rowsEl.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-a]'); if(!btn) return;
  const tr = btn.closest('tr[data-id]'); if(!tr) return;
  const id = tr.dataset.id;
  const prod = CURRENT.find(x=>x.id===id);
  if(!prod) return;

  if(btn.dataset.a==='edit'){
    loadForm(prod);
  }
  if(btn.dataset.a==='del'){
    if(!confirm(`¿Eliminar "${prod.name}"?`)) return;
    await deleteProduct(id);
    toast('Producto eliminado');
  }
});

// ------------------------------------------------------------------
// 4) Formulario Nuevo/Editar
// ------------------------------------------------------------------
$('#btnNew').onclick = ()=> {
  resetForm();
  $('#formTitle').textContent = 'Nuevo producto';
};

$('#btnFormCancel').onclick = ()=> resetForm();

$('#btnFormSave').onclick = async ()=>{
  const data = readForm();
  if(!data.name){ alert('Nombre es obligatorio'); return; }
  if(isNaN(data.price)){ alert('Precio inválido'); return; }
  try{
    const id = await upsertProduct(data);
    toast('Guardado');
    beep();
    resetForm();
    // Opcional: enfocar fila recién guardada
  }catch(e){
    console.error(e);
    toast('Error al guardar');
  }
};

// Cargar en form para edición
function loadForm(p){
  $('#formTitle').textContent = `Editar: ${p.name}`;
  $('#fId').value = p.id || '';
  $('#fName').value = p.name || '';
  $('#fCat').value = p.category || 'burger';
  $('#fPrice').value = Number(p.price||0);
  $('#fMini').value = p.mini ? 'true':'false';
  $('#fBaseOf').value = p.baseOf || '';
  $('#fSalsaDef').value = p.salsaDefault || '';
  $('#fSalsasSug').value = (p.salsasSugeridas||[]).join(', ');
  $('#fIngr').value = (p.ingredients||[]).join('\n');
  $('#fIcon').value = p.icon || '';
  $('#fActive').value = (p.active!==false) ? 'true':'false';
}

// Limpiar a “nuevo”
function resetForm(){
  $('#formTitle').textContent = 'Nuevo producto';
  $('#fId').value = '';
  $('#fName').value = '';
  $('#fCat').value = 'burger';
  $('#fPrice').value = '';
  $('#fMini').value = 'false';
  $('#fBaseOf').value = '';
  $('#fSalsaDef').value = '';
  $('#fSalsasSug').value = '';
  $('#fIngr').value = '';
  $('#fIcon').value = '';
  $('#fActive').value = 'true';
}

// Leer valores del form
function readForm(){
  const id = ($('#fId').value||'').trim(); // opcional
  const category = $('#fCat').value;
  const isMini = $('#fMini').value === 'true';

  // Caso especial: categoría "config" te deja setear precios globales de extras
  if(category==='config'){
    return {
      id: id || 'config', // único
      name: 'Config',
      price: 0,
      category: 'config',
      mini: false,
      baseOf: null,
      ingredients: [],
      salsaDefault: null,
      salsasSugeridas: [],
      icon: $('#fIcon').value || '',
      active: $('#fActive').value==='true',
      // Sobre-escribe con tus números
      // Puedes aprovechar los campos de price/nota para algo más si lo deseas
    };
  }

  return {
    id: id || undefined, // si viene vacío, se crea nuevo con id autogenerado
    name: ($('#fName').value||'').trim(),
    price: Number($('#fPrice').value||0),
    category,
    mini: isMini,
    baseOf: ($('#fBaseOf').value||'').trim() || null,
    ingredients: parseList($('#fIngr').value),
    salsaDefault: ($('#fSalsaDef').value||'').trim() || null,
    salsasSugeridas: parseCsv($('#fSalsasSug').value),
    icon: ($('#fIcon').value||'').trim(),
    active: $('#fActive').value==='true'
  };
}
