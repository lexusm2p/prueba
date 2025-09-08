// /shared/db.js
// Módulo de acceso a Firestore: órdenes activas del día, reportes por rango,
// settings (ETA/HappyHour/Theme), inventario, artículos, recetas, catálogo.
// ----------------------------------------------------------------

import {
  db, ensureAuth,
  serverTimestamp, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  onSnapshot, query, where, orderBy, limit, Timestamp
} from './firebase.js';

/* =============== Utilidades de fecha =============== */
// Regresa un Date a las 00:00:00 de hoy (local)
export function startOfToday() {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}
// Convierte Date→Timestamp Firestore
export function toTs(d) {
  return Timestamp.fromDate(d);
}

/* =============== Órdenes =============== */

// 📡 Solo órdenes ACTIVAS de HOY (menor costo + velocidad en cocina/mesero/kiosko)
export function subscribeActiveOrders(cb) {
  const active = ['PENDING','COOKING','IN_PROGRESS','READY'];

  const qy = query(
    collection(db, 'orders'),
    where('createdAt', '>=', toTs(startOfToday())),
    where('status', 'in', active),
    orderBy('createdAt', 'asc')
  );
  // Requiere índice compuesto: orders | status(Asc), createdAt(Asc)
  return onSnapshot(qy, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(list);
  });
}

// Compatibilidad para kiosk (usa un “shim”): si llaman subscribeOrders, usamos las activas
export const subscribeOrders = (cb)=> subscribeActiveOrders(cb);

// 📥 Crear orden (kiosko/mesero)
export async function createOrder(payload) {
  await ensureAuth();
  const ref = await addDoc(collection(db, 'orders'), {
    ...payload,
    status: 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

// 🔁 Cambiar estado (cocina/admin)
export async function setOrderStatus(id, status) {
  await ensureAuth();
  await updateDoc(doc(db, 'orders', id), {
    status,
    updatedAt: serverTimestamp()
  });
}

// 🔎 Reporte por rango (admin)
export async function getOrdersRange({ from, to, includeArchive = false, orderType = null }) {
  const _from = toTs(new Date(from));
  const _to   = toTs(new Date(to));

  const colName = includeArchive ? 'orders_archive' : 'orders';
  const pieces = [
    where('createdAt', '>=', _from),
    where('createdAt', '<=', _to),
    orderBy('createdAt', 'asc')
  ];
  if (orderType) pieces.unshift(where('orderType', '==', orderType));

  // Nota: en entornos de hosting estático puede no haber módulos din. de Firestore; intentamos ambos.
  let snap;
  try{
    const { getDocs } = await import('https://cdn.skypack.dev/@firebase/firestore');
    snap = await getDocs(query(collection(db, colName), ...pieces));
  }catch{
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    snap = await getDocs(query(collection(db, colName), ...pieces));
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* =============== Settings (ETA, HappyHour, Theme) =============== */

const SETTINGS = 'settings';

// ⏱️ ETA
export async function setETA(minutes) {
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'eta'), { minutes, updatedAt: serverTimestamp() }, { merge: true });
}
// Devuelve minutos (número) o null si no hay doc
export function subscribeETA(cb) {
  return onSnapshot(doc(db, SETTINGS, 'eta'), (d) => cb(d.data()?.minutes ?? null));
}

// 🎉 Happy Hour
export async function setHappyHour(payload) {
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'happyHour'), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}
export function subscribeHappyHour(cb) {
  return onSnapshot(doc(db, SETTINGS, 'happyHour'), (d) => cb(d.data() ?? null));
}

// 🎨 THEME
export async function setTheme({ name, overrides = {} }) {
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'theme'), { name, overrides, updatedAt: serverTimestamp() }, { merge: true });
}
export function subscribeTheme(cb) {
  return onSnapshot(doc(db, SETTINGS, 'theme'), (d) => cb(d.data() ?? null));
}

// 🧰 Settings agregados (Admin espera varios flags/thresholds)
// Intenta leer /settings/app; si no existe, arma un objeto combinando docs sueltos.
export function subscribeSettings(cb){
  let combined = {};
  const emit = ()=> cb({ ...combined });

  // 1) Preferimos un doc “app” único si existe
  const unsubApp = onSnapshot(doc(db, SETTINGS, 'app'), (snap)=>{
    if (snap.exists()){
      combined = { ...combined, ...snap.data() };
      emit();
    }
  });

  // 2) Además escuchamos HH/Theme/ETA para aportar campos útiles
  const unsubHH = onSnapshot(doc(db, SETTINGS, 'happyHour'), (snap)=>{
    combined = { ...combined, happyHour: snap.data() ?? null };
    emit();
  });
  const unsubTheme = onSnapshot(doc(db, SETTINGS, 'theme'), (snap)=>{
    combined = { ...combined, theme: snap.data() ?? null };
    emit();
  });
  const unsubETA = onSnapshot(doc(db, SETTINGS, 'eta'), (snap)=>{
    const v = snap.data();
    combined = { ...combined, eta: v ?? null };
    emit();
  });

  // Defaults suaves para no romper UI de Admin/Recetario
  combined = {
    lowStockThreshold: 5,
    defaultSuggestMlPerOrder: 20,
    sauceCupItemId: null,
    ...combined
  };
  emit();

  return ()=>{ try{unsubApp();}catch{} try{unsubHH();}catch{} try{unsubTheme();}catch{} try{unsubETA();}catch{} };
}

/* =============== Inventario / Compras / Proveedores =============== */

export function subscribeInventory(cb) {
  const qy = query(collection(db, 'inventory'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}

// Upsert simple de ítem
export async function upsertInventoryItem(item) {
  await ensureAuth();
  const ref = item.id ? doc(db,'inventory', item.id) : doc(collection(db,'inventory'));
  await setDoc(ref, { ...item, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

// Movimiento de inventario (delta puede ser positivo o negativo). type/meta informativos.
export async function adjustStock(itemId, delta = 0, type = 'adjust', meta = {}){
  if (!itemId) return;
  await ensureAuth();

  // Registrar movimiento (bitácora)
  await addDoc(collection(db,'inventory_movements'), {
    itemId, delta: Number(delta||0), type, meta: meta || {}, createdAt: serverTimestamp()
  });

  // Actualizar stock actual (lectura + update simple)
  try{
    const ref = doc(db,'inventory', itemId);
    const snap = await getDoc(ref);
    const prev = Number(snap.data()?.currentStock || 0);
    await updateDoc(ref, {
      currentStock: prev + Number(delta||0),
      updatedAt: serverTimestamp()
    });
  }catch(e){
    // si no existe el item, ignoramos (o podrías crearlo)
    console.warn('[db.adjustStock] no se pudo actualizar stock:', e);
  }
}

export function subscribeSuppliers(cb) {
  const qy = query(collection(db, 'suppliers'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertSupplier(supp) {
  await ensureAuth();
  const ref = supp.id ? doc(db,'suppliers', supp.id) : doc(collection(db,'suppliers'));
  await setDoc(ref, { ...supp, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

// Compra (puedes extender para recalcular costAvg)
export async function recordPurchase(purchase) {
  await ensureAuth();
  await addDoc(collection(db,'purchases'), {
    ...purchase,
    createdAt: serverTimestamp()
  });
}

/* =============== Recetario / Producción =============== */

export function subscribeRecipes(cb) {
  const qy = query(collection(db, 'recipes'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}

/**
 * produceBatch — versión compatible con tu Admin:
 *   produceBatch({ recipeId, outputQty })
 * - Guarda un documento en "productions".
 * - (Opcional) ajusta stock del producto terminado si configuras recipe.outputItemId
 *   en tus documentos de recipe (Admin ya lo usa para avisos LOW).
 */
export async function produceBatch({ recipeId, outputQty }){
  if (!recipeId || !(outputQty > 0)) throw new Error('recipeId y outputQty requeridos');
  await ensureAuth();

  // guardamos producción básica
  const ref = await addDoc(collection(db, 'productions'), {
    recipeId,
    outputQty,
    createdAt: serverTimestamp()
  });

  // intento opcional de sumar stock del producto terminado
  try{
    const r = await getDoc(doc(db, 'recipes', recipeId));
    const outId = r.data()?.outputItemId;
    if (outId && outputQty > 0){
      await adjustStock(outId, Number(outputQty||0), 'production', { recipeId });
    }
  }catch(e){ console.warn('[db.produceBatch] no se pudo ajustar stock:', e); }

  return ref.id;
}

/* =============== Artículos (CRUD) =============== */

export function subscribeArticles(cb) {
  const qy = query(collection(db, 'articles'), orderBy('updatedAt','desc'), limit(100));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertArticle(article) {
  await ensureAuth();
  const ref = article.id ? doc(db,'articles', article.id) : doc(collection(db,'articles'));
  await setDoc(ref, { ...article, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}
export async function deleteArticle(id) {
  await ensureAuth();
  await updateDoc(doc(db,'articles', id), { deletedAt: serverTimestamp() });
}

/* =============== Productos & Catálogo (lectura) =============== */

// Solo lectura para Admin (si no existe, emitimos [])
export function subscribeProducts(cb){
  try{
    const qy = query(collection(db, 'products'), orderBy('name','asc'));
    return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
  }catch(e){
    console.warn('[db] subscribeProducts fallback vacío:', e);
    cb([]); return ()=>{};
  }
}

/**
 * Catálogo con fallback para Kiosko:
 *  1) /settings/catalog
 *  2) /catalog/public
 *  3) /shared/catalog.json
 *  4) catálogo mínimo local
 */
export async function fetchCatalogWithFallback(){
  // 1) /settings/catalog
  try{
    const r1 = await getDoc(doc(db, SETTINGS, 'catalog'));
    if (r1.exists()){
      return normalizeCatalog(r1.data() || {});
    }
  }catch(e){ console.warn('[db] settings/catalog no disponible:', e); }

  // 2) /catalog/public
  try{
    const r2 = await getDoc(doc(collection(db, 'catalog'), 'public'));
    if (r2.exists()){
      return normalizeCatalog(r2.data() || {});
    }
  }catch(e){ console.warn('[db] catalog/public no disponible:', e); }

  // 3) archivo estático
  try{
    const res = await fetch('../shared/catalog.json', { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      return normalizeCatalog(json);
    }
  }catch(e){ console.warn('[db] catalog.json no disponible:', e); }

  // 4) mínimo para no romper UI
  return normalizeCatalog({
    minis:[], burgers:[], drinks:[], sides:[],
    extras:{ sauces:[], ingredients:[], ingredientPrice:0, saucePrice:0, dlcCarneMini:12 },
    appSettings:{ miniMeatGrams:45, meatGrams:85, defaultSuggestMlPerOrder:20, lowStockThreshold:5 },
    happyHour:{ enabled:false, discountPercent:0, bannerText:'', applyEligibleOnly:true, endsAt:null }
  });
}

function normalizeCatalog(raw){
  const num = (v, d=0)=> (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    minis: raw.minis || [],
    burgers: raw.burgers || [],
    drinks: raw.drinks || [],
    sides: raw.sides || [],
    extras: {
      sauces: raw.extras?.sauces || [],
      ingredients: raw.extras?.ingredients || [],
      ingredientPrice: num(raw.extras?.ingredientPrice, 0),
      saucePrice: num(raw.extras?.saucePrice, 0),
      dlcCarneMini: num(raw.extras?.dlcCarneMini, 12)
    },
    appSettings: {
      miniMeatGrams: num(raw.appSettings?.miniMeatGrams, 45),
      meatGrams:     num(raw.appSettings?.meatGrams, 85),
      defaultSuggestMlPerOrder: num(raw.appSettings?.defaultSuggestMlPerOrder, 20),
      lowStockThreshold: num(raw.appSettings?.lowStockThreshold, 5)
    },
    happyHour: {
      enabled: !!raw?.happyHour?.enabled,
      discountPercent: num(raw?.happyHour?.discountPercent, 0),
      bannerText: String(raw?.happyHour?.bannerText || ''),
      applyEligibleOnly: (raw?.happyHour?.applyEligibleOnly !== false),
      endsAt: (raw?.happyHour?.endsAt ?? null)
    }
  };
}

/* =============== Clientes (helpers para kiosko) =============== */

export async function fetchCustomer(phoneDigits){
  try{
    const id = String(phoneDigits || '').replace(/\D+/g,'');
    if (!id) return null;
    const r = await getDoc(doc(db, 'customers', id));
    return r.exists() ? { id, ...r.data() } : null;
  }catch(e){ console.warn('[db] fetchCustomer:', e); return null; }
}

export async function upsertCustomerFromOrder(order){
  try{
    const phone = String(order?.phone || '').replace(/\D+/g,'');
    if (!phone) return;
    await setDoc(doc(db, 'customers', phone), {
      phone,
      name: order?.customer || null,
      lastOrderAt: serverTimestamp()
    }, { merge:true });
  }catch(e){ console.warn('[db] upsertCustomerFromOrder:', e); }
}

export async function attachLastOrderRef(phoneDigits, orderId){
  try{
    const id = String(phoneDigits || '').replace(/\D+/g,'');
    if (!id) return;
    await setDoc(doc(db, 'customers', id), {
      lastOrderId: orderId,
      lastOrderAt: serverTimestamp()
    }, { merge:true });
  }catch(e){ console.warn('[db] attachLastOrderRef:', e); }
}
