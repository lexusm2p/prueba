// /lib/recipes.js
// Catálogo + utilidades de formulación para salsas/aderezos de Seven de Burgers.
// - Escalado por rendimiento (ml) manteniendo proporciones
// - Listas de compra agregadas para varias preparaciones
// - Conversión de unidades comunes (ml/L, g/kg, cda↔ml, cdta↔ml)
// - Salida a texto/HTML/CSV
// - Búsqueda por id/nombre, versión más cercana, etc.
//
// Nota: las “versiones” están expresadas por rendimiento total (ml) del lote.
// Los ingredientes traen cantidad (q) y unidad (u). No se fuerza una conversión
// si la unidad es “pza/pzas” (piezas) u otras que no sean líquidas/sólidas típicas.

export const RECIPES = [
  { id:'ajo-habanero', name:'Aderezo de ajo habanero', versiones:[
    { ml:200, ingredientes:[
      {i:'Habanero (sin cola)', q:12.5, u:'g'},
      {i:'Ajo frito', q:15, u:'g'},
      {i:'Queso crema', q:25, u:'g'},
      {i:'Mayonesa', q:100, u:'ml'},
      {i:'Sal', q:1, u:'g'}
    ], pasos:['Freír el ajo','Licuar con habanero, queso crema y mayonesa','Ajustar sal','Refrigerar 12h'] }
  ]},
  { id:'chipotle', name:'Aderezo chipotle', versiones:[
    { ml:200, ingredientes:[
      {i:'Chipotle', q:25, u:'g'},
      {i:'Queso crema', q:25, u:'g'},
      {i:'Mayonesa', q:100, u:'ml'},
      {i:'Pimienta', q:1, u:'g'},
      {i:'Sal', q:1, u:'g'}
    ], pasos:['Licuar todo hasta cremoso','Refrigerar 12h'] }
  ]},
  { id:'chimichurri', name:'Salsa chimichurri', versiones:[
    { ml:200, ingredientes:[
      {i:'Chile de árbol', q:5, u:'pzas'},
      {i:'Ajo', q:2.5, u:'pzas'},
      {i:'Mostaza', q:0.5, u:'cda'},
      {i:'Huevo', q:1, u:'pza'},
      {i:'Perejil', q:8, u:'g'},
      {i:'Vinagre', q:65, u:'ml'},
      {i:'Aceite', q:110, u:'ml'},
      {i:'Sal', q:2, u:'g'}
    ], pasos:['Triturar chile y ajo','Emulsionar con huevo, vinagre, aceite','Añadir mostaza, perejil y sal'] }
  ]},
  { id:'cheddar', name:'Aderezo cheddar', versiones:[
    { ml:500, ingredientes:[
      {i:'Mantequilla', q:50, u:'g'},
      {i:'Harina', q:50, u:'g'},
      {i:'Leche', q:500, u:'ml'},
      {i:'Queso cheddar', q:200, u:'g'},
      {i:'Sal', q:2, u:'g'},
      {i:'Pimienta', q:1, u:'g'}
    ], pasos:['Hacer roux con mantequilla y harina','Incorporar leche','Fundir cheddar','Sazonar'] }
  ]},
  { id:'mostaza-dulce', name:'Aderezo de mostaza dulce', versiones:[
    { ml:200, ingredientes:[
      {i:'Mostaza amarilla', q:60, u:'ml'},
      {i:'Miel', q:40, u:'ml'},
      {i:'Mayonesa', q:80, u:'ml'},
      {i:'Vinagre', q:20, u:'ml'}
    ], pasos:['Mezclar todo y reposar 6h'] }
  ]},
  { id:'jalapeño', name:'Aderezo de jalapeño rostizado', versiones:[
    { ml:200, ingredientes:[
      {i:'Jalapeño', q:60, u:'g'},
      {i:'Ajo', q:5, u:'g'},
      {i:'Mayonesa', q:120, u:'ml'},
      {i:'Limón', q:10, u:'ml'}
    ], pasos:['Rostizar jalapeño y ajo','Licuar con mayonesa y limón'] }
  ]},
  { id:'curry', name:'Aderezo curry suave', versiones:[
    { ml:200, ingredientes:[
      {i:'Pasta de curry suave', q:10, u:'g'},
      {i:'Mayonesa', q:170, u:'ml'},
      {i:'Miel', q:20, u:'ml'}
    ], pasos:['Mezclar y reposar 6h'] }
  ]},
  { id:'secreta', name:'Salsa secreta Seven', versiones:[
    { ml:200, ingredientes:[
      {i:'Base mayo', q:140, u:'ml'},
      {i:'Pepinillo picado', q:20, u:'g'},
      {i:'Catsup', q:20, u:'ml'},
      {i:'Mostaza', q:10, u:'ml'},
      {i:'Pimentón', q:2, u:'g'}
    ], pasos:['Integrar y reposar 12h'] }
  ]},
];

/* ========================
   Utilidades y constantes
   ======================== */

// Conversión básica de unidades (aproximada estándar cocina)
const UNIT = {
  // líquidos
  ml:    { kind: 'vol', toBase: 1, fromBase: 1 },
  l:     { kind: 'vol', toBase: 1000, fromBase: 1/1000 },
  cda:   { kind: 'vol', toBase: 15, fromBase: 1/15 },   // cucharada
  cdta:  { kind: 'vol', toBase: 5,  fromBase: 1/5  },   // cucharadita
  // sólidos
  g:     { kind: 'mass', toBase: 1, fromBase: 1 },
  kg:    { kind: 'mass', toBase: 1000, fromBase: 1/1000 },
  // piezas: no convertible automáticamente
  pza:   { kind: 'each' },
  pzas:  { kind: 'each' },
};

// Normaliza etiquetas de unidad (minúsculas y sin acentos simples)
function normU(u='') {
  return String(u).trim().toLowerCase()
    .replace(/cucharadas?/g,'cda')
    .replace(/cucharaditas?|cdtas?/g,'cdta')
    .replace(/^pz(as)?$/,'pzas')
    .replace(/^pieza(s)?$/,'pzas')
    .replace(/^pza$/,'pza');
}

// ¿Se pueden convertir (misma “clase”: vol vs mass)?
function areCompatibleUnits(u1, u2){
  const a = UNIT[normU(u1)], b = UNIT[normU(u2)];
  return a && b && a.kind && b.kind && a.kind === b.kind;
}

// Convierte cantidad entre unidades compatibles (líquidos/masas)
// Si no son compatibles, retorna null (para que el caller decida qué hacer)
export function convertQty(q, fromU, toU){
  const f = UNIT[normU(fromU)], t = UNIT[normU(toU)];
  if (!f || !t || f.kind !== t.kind || !f.toBase || !t.fromBase) return null;
  const base = q * f.toBase;
  return base * t.fromBase;
}

// Redondeo “bonito” para cocina
function nice(n){
  if (!isFinite(n)) return n;
  if (Math.abs(n) >= 100) return Math.round(n);
  if (Math.abs(n) >= 10)  return Math.round(n*10)/10;
  return Math.round(n*100)/100;
}

/* ========================
   Búsqueda y selección
   ======================== */

/** Busca receta por id (exacto) o por nombre (case-insensitive, contiene). */
export function findRecipe(query){
  const q = String(query||'').trim().toLowerCase();
  if (!q) return null;
  return RECIPES.find(r => r.id === q) ||
         RECIPES.find(r => r.name.toLowerCase().includes(q)) ||
         null;
}

/** Retorna la versión cuyo rendimiento (ml) es el más cercano al solicitado. */
export function closestVersion(recipe, targetMl){
  if (!recipe || !Array.isArray(recipe.versiones) || !recipe.versiones.length) return null;
  const t = Number(targetMl||0);
  if (!isFinite(t) || t<=0) return recipe.versiones[0];
  return recipe.versiones
    .map(v => ({ v, d: Math.abs((v.ml||0) - t) }))
    .sort((a,b)=> a.d - b.d)[0].v;
}

/* ========================
   Escalado de versiones
   ======================== */

/**
 * Escala una versión a un rendimiento objetivo (ml).
 * - Mantiene proporciones de todos los ingredientes.
 * - Intenta conservar unidad original; si se solicita “preferUnitByKind”
 *   puede priorizar ml/l o g/kg para que queden números “bonitos”.
 *
 * @param {object} recipe - receta del catálogo.
 * @param {number} targetMl - rendimiento deseado (ml).
 * @param {object} [opts]
 *    - baseVersionMl?: fuerza a usar como base la versión que tenga este ml (si existe);
 *      si no, se usa la más cercana.
 *    - preferUnitByKind?: { vol: 'ml'|'l'|'cda'|'cdta', mass: 'g'|'kg' }
 * @returns {object} { ml, ingredientes:[{i,q,u}], pasos, scale }
 */
export function scaleRecipe(recipe, targetMl, opts={}){
  if (!recipe) throw new Error('scaleRecipe: receta inválida');
  const base = (opts.baseVersionMl
    ? recipe.versiones.find(v=> Number(v.ml)===Number(opts.baseVersionMl))
    : closestVersion(recipe, targetMl)) || recipe.versiones[0];

  const from = Number(base.ml||0);
  const to   = Number(targetMl||from);
  if (!from || !to) throw new Error('scaleRecipe: ml inválidos');

  const scale = to / from;
  const pref  = opts.preferUnitByKind || {};

  const ingredientes = base.ingredientes.map(row=>{
    const u0 = normU(row.u);
    let q = Number(row.q||0) * scale;
    let u = row.u;

    // Sugerir cambio de unidad si aplica (para números más cómodos)
    const meta = UNIT[u0];
    if (meta && meta.kind === 'vol' && pref.vol && pref.vol !== u0){
      const conv = convertQty(q, u0, pref.vol);
      if (conv!=null) { q = conv; u = pref.vol; }
    } else if (meta && meta.kind === 'mass' && pref.mass && pref.mass !== u0){
      const conv = convertQty(q, u0, pref.mass);
      if (conv!=null) { q = conv; u = pref.mass; }
    }

    return { i: row.i, q: nice(q), u };
  });

  return {
    ml: to,
    ingredientes,
    pasos: Array.isArray(base.pasos) ? [...base.pasos] : [],
    scale,
  };
}

/** Atajo: escalar por id de receta. */
export function scaleRecipeById(id, targetMl, opts={}){
  const r = findRecipe(id);
  if (!r) throw new Error(`Receta no encontrada: ${id}`);
  return scaleRecipe(r, targetMl, opts);
}

/* ========================
   Listas de compra
   ======================== */

/**
 * Agrega múltiples lotes (receta + ml objetivo + repeticiones) y devuelve
 * una lista de compra consolidada intentando unificar unidades compatibles.
 *
 * @param {Array<{id:string|object, ml:number, reps?:number}>} batches
 *   - id puede ser string (id receta) o la receta completa.
 * @param {object} [opts]
 *   - preferUnitByKind?: como en scaleRecipe
 * @returns {Array<{i:string, q:number, u:string}>}
 */
export function buildShoppingList(batches=[], opts={}){
  const acc = new Map(); // key: nombre + unidadBaseKind (para evitar mezclar piezas con gramos, etc.)

  const prefer = opts.preferUnitByKind || {};
  const keyOf = (name, unitKind) => `${name}__${unitKind||'na'}`;

  for (const b of (batches||[])){
    const rec = (typeof b.id === 'string') ? findRecipe(b.id) : b.id;
    if (!rec) continue;
    const reps = Math.max(1, Number(b.reps||1));
    const scaled = scaleRecipe(rec, b.ml, { preferUnitByKind: prefer });
    for (const ing of scaled.ingredientes){
      const uNorm = normU(ing.u);
      const meta  = UNIT[uNorm];
      const kind  = meta?.kind || 'na';
      // Guardamos en la unidad actual; si ya existe con la misma “clase”, intentamos convertir.
      const k = keyOf(ing.i, kind);
      if (!acc.has(k)){
        acc.set(k, { i: ing.i, q: Number(ing.q)*reps, u: ing.u });
      } else {
        const prev = acc.get(k);
        const conv = convertQty(ing.q, ing.u, prev.u);
        if (conv==null){
          // Si no convertimos, acumulamos como entrada separada por unidad exacta
          // Ej.: “Huevo pza” no se mezcla con “Huevo g”.
          const k2 = keyOf(`${ing.i} (${uNorm})`, 'na');
          const exists = acc.get(k2);
          if (exists) exists.q += Number(ing.q)*reps;
          else acc.set(k2, { i:`${ing.i} (${ing.u})`, q:Number(ing.q)*reps, u:ing.u });
        } else {
          prev.q += Number(conv)*reps;
        }
      }
    }
  }

  // Post-procesa para “bonito”: si ml >= 1000 ⇒ L, si g >=1000 ⇒ kg (cuando conviene)
  const out = [...acc.values()].map(row=>{
    const u0 = normU(row.u);
    const meta = UNIT[u0];
    if (meta?.kind === 'vol'){
      if (prefer.vol === 'l' || (prefer.vol==null && row.q >= 1000)){
        const conv = convertQty(row.q, u0, 'l');
        if (conv!=null) return { i: row.i, q: nice(conv), u:'l' };
      }
      if (prefer.vol === 'ml') return { i: row.i, q: nice(row.q), u:'ml' };
    }
    if (meta?.kind === 'mass'){
      if (prefer.mass === 'kg' || (prefer.mass==null && row.q >= 1000)){
        const conv = convertQty(row.q, u0, 'kg');
        if (conv!=null) return { i: row.i, q: nice(conv), u:'kg' };
      }
      if (prefer.mass === 'g') return { i: row.i, q: nice(row.q), u:'g' };
    }
    return { i: row.i, q: nice(row.q), u: row.u };
  });

  // Orden: sólidos (kg/g), líquidos (l/ml), piezas, resto; por nombre
  const orderRank = u=>{
    const n = normU(u);
    if (n==='kg'||n==='g') return 1;
    if (n==='l'||n==='ml'||n==='cda'||n==='cdta') return 2;
    if (n==='pza'||n==='pzas') return 3;
    return 9;
  };
  out.sort((a,b)=> orderRank(a.u)-orderRank(b.u) || a.i.localeCompare(b.i,'es',{sensitivity:'base'}));
  return out;
}

/* ========================
   Salidas (render helpers)
   ======================== */

/** Texto “bonito” de una formulación escalada. */
export function recipeToText({ name, ml, ingredientes, pasos }){
  const head = `${name} — Rendimiento: ${nice(ml)} ml`;
  const list = ingredientes.map(x=> `- ${x.i}: ${nice(x.q)} ${x.u}`).join('\n');
  const steps = (pasos||[]).map((p,i)=> `${i+1}. ${p}`).join('\n');
  return `${head}\n\nIngredientes:\n${list}\n\nPasos:\n${steps}`;
}

/** HTML minimalista (string) para imprimir/mostrar. */
export function recipeToHTML({ name, ml, ingredientes, pasos }){
  const esc = s => String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const rows = ingredientes.map(x=> `<tr><td>${esc(x.i)}</td><td style="text-align:right">${esc(nice(x.q))}</td><td>${esc(x.u)}</td></tr>`).join('');
  const li = (pasos||[]).map(p=> `<li>${esc(p)}</li>`).join('');
  return `
  <article style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;max-width:720px">
    <h2 style="margin:0 0 .25rem 0">${esc(name)}</h2>
    <div style="color:#667; margin-bottom:.75rem">Rendimiento: ${esc(nice(ml))} ml</div>
    <table style="border-collapse:collapse;width:100%;margin:.5rem 0">
      <thead><tr><th style="text-align:left">Ingrediente</th><th style="text-align:right">Cant.</th><th>Unidad</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${li ? `<ol style="margin:.75rem 0 0 1.2rem">${li}</ol>` : ''}
  </article>`.trim();
}

/** CSV de ingredientes (i;q;u). */
export function ingredientsToCSV(ings){
  const esc = s => `"${String(s).replace(/"/g,'""')}"`;
  const head = 'ingrediente,cantidad,unidad';
  const rows = (ings||[]).map(x=> [esc(x.i), nice(x.q), esc(x.u)].join(','));
  return [head, ...rows].join('\n');
}

/** CSV de lista de compra consolidada. */
export function shoppingListToCSV(list){
  return ingredientsToCSV(list);
}

/* ========================
   Atajos de alto nivel
   ======================== */

/**
 * Devuelve una formulación escalada por id + ml objetivo lista para
 * imprimir/mostrar, con varias salidas auxiliares.
 *
 * @param {string} id
 * @param {number} ml
 * @param {object} [opts] ver scaleRecipe
 * @returns {object} {
 *   meta:{id,name},
 *   batch:{ml, ingredientes, pasos, scale},
 *   text, html, csv
 * }
 */
export function getScaledRecipePackage(id, ml, opts={}){
  const r = findRecipe(id);
  if (!r) throw new Error(`Receta no encontrada: ${id}`);
  const batch = scaleRecipe(r, ml, opts);
  return {
    meta: { id:r.id, name:r.name },
    batch,
    text: recipeToText({ name:r.name, ...batch }),
    html: recipeToHTML({ name:r.name, ...batch }),
    csv: ingredientsToCSV(batch.ingredientes),
  };
}

/**
 * Construye lista de compra para múltiples recetas y devuelve tanto
 * la lista consolidada como CSV.
 *
 * @param {Array<{id:string, ml:number, reps?:number}>} batches
 * @param {object} [opts] ver buildShoppingList
 * @returns {{ list:Array, csv:string }}
 */
export function getShoppingListPackage(batches, opts={}){
  const list = buildShoppingList(batches, opts);
  return { list, csv: shoppingListToCSV(list) };
}

/* ========================
   Utilidades menores
   ======================== */

/** Devuelve ids y nombres (para UI). */
export function listRecipeOptions(){
  return RECIPES.map(r => ({ id:r.id, name:r.name, versiones:r.versiones.map(v=>v.ml) }));
}

/** Añade una versión a una receta (in-memory). Útil en herramientas internas. */
export function addVersionToRecipe(id, version){
  const r = findRecipe(id);
  if (!r) throw new Error('Receta no encontrada');
  if (!version || !version.ml || !Array.isArray(version.ingredientes)) throw new Error('Versión inválida');
  r.versiones.push(version);
  r.versiones.sort((a,b)=> (a.ml||0)-(b.ml||0));
  return r;
}

/** Duplica una receta con nuevo id/nombre (in-memory). */
export function cloneRecipe(id, { newId, newName }){
  const r = findRecipe(id);
  if (!r) throw new Error('Receta no encontrada');
  const copy = JSON.parse(JSON.stringify(r));
  copy.id = String(newId||`${r.id}-copy`);
  copy.name = String(newName||`${r.name} (copia)`);
  RECIPES.push(copy);
  return copy;
}
