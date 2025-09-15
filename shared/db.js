// /shared/db.js
// Firestore + catálogo con fallback (Firestore → /data/menu.json → /shared/catalog.json)
// Órdenes, settings (ETA/HH/Theme), inventario, recetas/producción, artículos, products (opcional) y clientes.
// + Coleccionables (stickers/tarjetas) server‑backed con límites y suscripción
// + Stub opcional para WhatsApp vía webhook en settings
// + Modo PRUEBA (training): evita escrituras cuando opts.training=true
// + FIXES: subscribeOrder() y logPrepMetric() (usados por /kiosk/track.js); normalización robusta de HH; helpers extra.

import {
  db, ensureAuth,
  serverTimestamp, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  onSnapshot, query, where, orderBy, limit, Timestamp, increment
} from './firebase.js';

/* =============== Training / Modo PRUEBA =============== */
export function isTrainingTrigger(s=''){
  return /^\s*prueba\s*$/i.test(String(s));
}
async function guardWrite(isTraining, realWriteFn, fakeValue=null){
  if (!isTraining) return await realWriteFn();
  await new Promise(r=>setTimeout(r, 60)); // simula latencia
  return fakeValue ?? { ok:true, _training:true };
}

/* =============== Utilidades de fecha =============== */
export function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
export function toTs(d) { return Timestamp.fromDate(new Date(d)); }

/* =============== Helpers varios =============== */
function toMillisFlexible(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw?.seconds != null) {
    return (raw.seconds * 1000) + Math.floor((raw.nanoseconds || 0) / 1e6);
  }
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}
function normalizePhone(raw=''){
  return String(raw).replace(/\D+/g,'').slice(0,15);
}

/* =============== Catálogo: fetch con fallback =============== */
// Normaliza el catálogo a la forma esperada por el kiosko/admin
function normalizeCatalog(cat = {}) {
  const safe = (x, def=[]) => Array.isArray(x) ? x : (x ? [x] : def);
  const appSettings = {
    miniMeatGrams: Number(cat?.appSettings?.miniMeatGrams ?? 45),
    meatGrams: Number(cat?.appSettings?.meatGrams ?? 85),
    defaultSuggestMlPerOrder: Number(cat?.appSettings?.defaultSuggestMlPerOrder ?? 20),
    lowStockThreshold: Number(cat?.appSettings?.lowStockThreshold ?? 5)
  };

  // endsAt normalizado SIEMPRE a milisegundos (o null)
  const happyHour = {
    enabled: !!cat?.happyHour?.enabled,
    discountPercent: Number(cat?.happyHour?.discountPercent ?? 0),
    bannerText: String(cat?.happyHour?.bannerText ?? ''),
    applyEligibleOnly: cat?.happyHour?.applyEligibleOnly !== false,
    endsAt: toMillisFlexible(cat?.happyHour?.endsAt ?? null)
  };

  // Ahora el catálogo se unifica en un solo array 'products' para ser dinámico
  const allProducts = [
    ...safe(cat.burgers).map(p => ({...p, category: p.category || 'burgers'})),
    ...safe(cat.minis).map(p => ({...p, category: p.category || 'minis'})),
    ...safe(cat.drinks).map(p => ({...p, category: p.category || 'drinks'})),
    ...safe(cat.sides).map(p => ({...p, category: p.category || 'sides'})),
  ];

  return {
    products: allProducts,
    extras: {
      sauces: safe(cat?.extras?.sauces ?? []),
      ingredients: safe(cat?.extras?.ingredients ?? []),
      ingredientPrice: Number(cat?.extras?.ingredientPrice ?? 0),
      saucePrice: Number(cat?.extras?.saucePrice ?? 0),
      dlcCarneMini: Number(cat?.extras?.dlcCarneMini ?? 0)
    },
    appSettings,
    happyHour
  };
}

// Ruta relativa segura desde /kiosk/ y /admin/
function guessDataPath() {
  // /kiosk/* -> ../data/menu.json
  // /admin/* -> ../data/menu.json
  return '../data/menu.json';
}

export async function fetchCatalogWithFallback() {
  // 1) Firestore: /settings/catalog (o /catalog/public)
  try {
    const d1 = await getDoc(doc(db, 'settings', 'catalog'));
    if (d1.exists()) return normalizeCatalog(d1.data());
  } catch {}

  try {
    const d2 = await getDoc(doc(db, 'catalog', 'public'));
    if (d2.exists()) return normalizeCatalog(d2.data());
  } catch {}

  // 2) Archivo en /data/menu.json
  try {
    const res = await fetch(guessDataPath(), { cache: 'no-store' });
    if (res.ok) return normalizeCatalog(await res.json());
  } catch {}

  // 3) Fallback adicional /shared/catalog.json
  try {
    const res2 = await fetch('../shared/catalog.json', { cache:'no-store' });
    if (res2.ok) return normalizeCatalog(await res2.json());
  } catch {}

  // 4) Último recurso: catálogo vacío “seguro”
  return normalizeCatalog({});
}

// Solo lectura para Admin (tabla de productos derivados del catálogo)
export function subscribeProducts(cb) {
  (async () => {
    const cat = await fetchCatalogWithFallback();
    // La función fetchCatalogWithFallback ya devuelve un formato unificado en 'products'
    cb(cat.products || []);
  })();
}

/* =============== Órdenes =============== */
// 🔎 Un pedido por ID (usado por track.js cuando llega ?oid=)
export function subscribeOrder(id, cb){
  if (!id) return ()=>{};
  return onSnapshot(doc(db, 'orders', id), (snap)=>{
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function subscribeActiveOrders(cb) {
  const active = ['PENDING','COOKING','IN_PROGRESS','READY'];
  const qy = query(
    collection(db, 'orders'),
    where('createdAt', '>=', toTs(startOfToday())),
    where('status', 'in', active),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(qy, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// 🔔 Stream completo de órdenes de hoy (cualquier estatus)
export function subscribeOrders(cb) {
  const qy = query(
    collection(db, 'orders'),
    where('createdAt', '>=', toTs(startOfToday())),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(qy, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// Alias de compatibilidad
export const onOrdersSnapshot = subscribeOrders;

export async function createOrder(payload, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    const ref = await addDoc(collection(db, 'orders'), {
      ...payload,
      status: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return ref.id;
  }, `TRAIN-${Date.now()}`);
}
export async function setOrderStatus(id, status, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    await updateDoc(doc(db, 'orders', id), { status, updatedAt: serverTimestamp() });
    return { ok:true, id, status };
  }, { ok:true, id, status, _training:true });
}

/* ========= NUEVO getOrdersRange (robusto: une orders + archive, resumen) ========= */
export async function getOrdersRange(params = {}) {
  await ensureAuth();

  // ---- Compat de parámetros (soporta {from,to} y {time_min,time_max})
  const fromIn = params.from ?? params.time_min ?? null;
  const toIn   = params.to   ?? params.time_max ?? null;
  const includeArchive = params.includeArchive ?? params.include_archive ?? false;
  const type = params.orderType ?? params.type ?? null;

  // ---- Normalización de fechas (local, tolerante a string/Date/Timestamp)
  const toLocalDate = (v, fallback=null) => {
    if (!v) return fallback;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (typeof v?.toMillis === 'function') return new Date(v.toMillis());
    if (typeof v === 'number') return new Date(v);
    const d = new Date(v);
    return isNaN(d.getTime()) ? fallback : d;
  };

  // Si no hay rango, usa HOY local
  const today = new Date();
  const start = toLocalDate(fromIn, new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0,0));
  // Fin INCLUSIVO
  const end   = toLocalDate(toIn,   new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23,59,59,999));

  // ---- Construcción de queries
  const build = (collName) => {
    let qy = query(
      collection(db, collName),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
      orderBy('createdAt','asc')
    );
    if (type && type !== 'all') {
      // Ajusta el campo si usas otro para “tipo de pedido”
      qy = query(qy, where('orderType', '==', String(type)));
    }
    return qy;
  };

  // getDocs (usar el SDK modular si lo exportas en firebase.js; si no, fallback CDN)
  async function getDocsCompat(qref){
    try {
      const { getDocs } = await import('./firebase.js'); // si NO exportas getDocs, caerá al catch
      if (typeof getDocs === 'function') return getDocs(qref);
    } catch {}
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    return getDocs(qref);
  }

  const readList = async (qy) => {
    const snap = await getDocsCompat(qy);
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  };

  // ---- Leer colecciones
  const listMain = await readList(build('orders'));
  const listArc  = includeArchive ? await readList(build('orders_archive')) : [];

  // ---- Unir + dedupe + ordenar
  const uniq = new Map();
  for (const o of [...listMain, ...listArc]) {
    if (!o?.id) continue;
    uniq.set(o.id, o); // la última gana
  }
  const orders = Array.from(uniq.values()).sort((a,b)=>{
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return ta - tb;
  });

  // ---- Resumen
  let count=0, items=0, revenue=0;
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue;
    count++;
    const lines = Array.isArray(o.items) ? o.items : [];
    items += lines.reduce((acc, li)=> acc + (Number(li?.qty)||1), 0);
    revenue += Number(o.total)||0;
  }
  const summary = { orders:count, itemsSold:items, revenue, avgTicket: count ? (revenue / count) : 0 };

  return { orders, summary, range: { start, end }, filters: { includeArchive, type: type||'all' } };
}

/* =============== Settings (ETA, HappyHour, Theme, App Settings) =============== */
const SETTINGS = 'settings';

// ✅ Solo /admin/ o admin local (PIN 7777 en kiosko)
function assertAdminContext() {
  const path = (typeof location !== 'undefined' ? location.pathname : '') || '';
  const inAdmin = /\/admin(\/|$)/.test(path);
  let kioskAdmin = false;
  try {
    kioskAdmin = (typeof sessionStorage !== 'undefined') && sessionStorage.getItem('kioskAdmin') === '1';
  } catch {}
  if (!inAdmin && !kioskAdmin) {
    throw new Error('Acceso denegado: esta operación solo está permitida desde el panel de Admin.');
  }
}

// ETA
export async function setETA(text, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    await setDoc(doc(db, SETTINGS, 'eta'),
      { text: String(text), updatedAt: serverTimestamp() },
      { merge: true });
    return { ok:true };
  }, { ok:true, _training:true });
}
export function subscribeETA(cb) {
  return onSnapshot(doc(db, SETTINGS, 'eta'), (d) => {
    const data = d.data() ?? null;
    if (!data) return cb(null);
    const text = data.text ?? data.minutes ?? null;
    cb(text == null ? null : String(text));
  });
}

// Happy Hour
export async function setHappyHour(payload, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    const normalized = {
      ...payload,
      endsAt: toMillisFlexible(payload?.endsAt ?? null),
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, SETTINGS, 'happyHour'), normalized, { merge: true });
    return { ok:true };
  }, { ok:true, _training:true });
}
export function subscribeHappyHour(cb) {
  return onSnapshot(doc(db, SETTINGS, 'happyHour'), (d) => cb(d.data() ?? null));
}

// THEME
export async function setTheme({ name, overrides = {} }, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    await setDoc(doc(db, SETTINGS, 'theme'),
      { name, overrides, updatedAt: serverTimestamp() },
      { merge: true });
    return { ok:true };
  }, { ok:true, _training:true });
}
export function subscribeTheme(cb) {
  return onSnapshot(doc(db, SETTINGS, 'theme'), (d) => cb(d.data() ?? null));
}

// App settings (incluye opcional whatsappWebhookUrl)
export function subscribeSettings(cb) {
  return onSnapshot(doc(db, SETTINGS, 'app'), (d) => cb(d.data() ?? {}));
}

/* =============== Inventario / Compras / Proveedores =============== */
export function subscribeInventory(cb) {
  const qy = query(collection(db, 'inventory'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertInventoryItem(item, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    const ref = item.id ? doc(db,'inventory', item.id) : doc(collection(db,'inventory'));
    await setDoc(ref, { ...item, updatedAt: serverTimestamp() }, { merge: true });
    return ref.id;
  }, item.id ?? `TRAIN-INV-${Date.now()}`);
}

export function subscribeSuppliers(cb) {
  const qy = query(collection(db, 'suppliers'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertSupplier(supp, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    const ref = supp.id ? doc(db,'suppliers', supp.id) : doc(collection(db,'suppliers'));
    await setDoc(ref, { ...supp, updatedAt: serverTimestamp() }, { merge: true });
    return ref.id;
  }, supp.id ?? `TRAIN-SUP-${Date.now()}`);
}

export async function recordPurchase(purchase, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    const { itemId, qty=0, unitCost=0 } = purchase || {};
    await addDoc(collection(db,'purchases'), { ...purchase, createdAt: serverTimestamp() });

    if (itemId && qty > 0) {
      const ref = doc(db,'inventory', itemId);
      const snap = await getDoc(ref);
      const cur  = snap.exists() ? (snap.data().currentStock||0) : 0;
      const prevCost = snap.exists() ? Number(snap.data().costAvg||0) : 0;
      const newStock = Number(cur) + Number(qty);
      const newCost  = (prevCost>0 && cur>0) ? ((prevCost*cur + unitCost*qty) / newStock) : unitCost;
      await setDoc(ref,
        { currentStock: newStock, costAvg: newCost, updatedAt: serverTimestamp() },
        { merge:true }
      );
    }
    return { ok:true };
  }, { ok:true, _training:true });
}

// Movimiento directo de stock
export async function adjustStock(itemId, delta, reason='use', meta={}, opts = {}) {
  const { training=false } = opts;
  if (!itemId || !Number.isFinite(delta)) return;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    const ref = doc(db,'inventory', itemId);
    await setDoc(ref, { currentStock: increment(Number(delta)), updatedAt: serverTimestamp() }, { merge:true });
    await addDoc(collection(db,'inventory_moves'), {
      itemId, delta:Number(delta), reason, meta, createdAt: serverTimestamp()
    });
    return { ok:true };
  }, { ok:true, _training:true });
}

/* =============== Recetario / Producción =============== */
export function subscribeRecipes(cb) {
  const qy = query(collection(db, 'recipes'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function produceBatch({ recipeId, outputQty }, opts = {}) {
  const { training=false } = opts;
  if (!recipeId || !(outputQty > 0)) throw new Error('Datos de producción inválidos');
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    await addDoc(collection(db, 'productions'), {
      recipeId, outputQty,
      createdAt: serverTimestamp()
    });
    return { ok:true };
  }, { ok:true, _training:true });
}

/* =============== Artículos (CRUD Admin) =============== */
export function subscribeArticles(cb) {
  const qy = query(collection(db, 'articles'), orderBy('updatedAt','desc'), limit(100));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertArticle(article, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    const ref = article.id ? doc(db,'articles', article.id) : doc(collection(db,'articles'));
    await setDoc(ref, { ...article, updatedAt: serverTimestamp() }, { merge: true });
    return ref.id;
  }, article.id ?? `TRAIN-ART-${Date.now()}`);
}
export async function deleteArticle(id, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    await updateDoc(doc(db,'articles', id), { deletedAt: serverTimestamp() });
    return { ok:true, id };
  }, { ok:true, id, _training:true });
}
export async function fetchFeaturedArticles() {
  return new Promise((resolve) => {
    const qy = query(collection(db, 'articles'), orderBy('updatedAt','desc'), limit(100));
    const unsub = onSnapshot(qy, (snap) => {
      const list = snap.docs.map(d=> ({ id:d.id, ...d.data() }));
      resolve(list.filter(a => a?.featured && !a?.deletedAt));
      unsub(); // una sola lectura “rápida”
    });
  });
}
export function mergeCatalogWithArticles(cat, articles=[]) {
  const acc = {
    burgers: [...(cat?.burgers||[])],
    minis:   [...(cat?.minis||[])],
    drinks:  [...(cat?.drinks||[])],
    sides:   [...(cat?.sides||[])],
    extras:  { ...(cat?.extras||{}) },
    appSettings: cat?.appSettings || {},
    happyHour:   cat?.happyHour || {}
  };
  for (const a of (articles||[])) {
    if (!a?.category || !a?.featured || a?.deletedAt) continue;
    if (a.category === 'burgers') acc.burgers.push(a);
    else if (a.category === 'minis') acc.minis.push(a);
    else if (a.category === 'drinks') acc.drinks.push(a);
    else if (a.category === 'sides') acc.sides.push(a);
  }
  return acc;
}

/* =============== Products (CRUD opcional “oficial”) =============== */
export function subscribeProductsLive(cb) {
  const qy = query(collection(db, 'products'), orderBy('updatedAt','desc'), limit(200));
  return onSnapshot(qy, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function upsertProduct(product, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    const ref = product?.id
      ? doc(db, 'products', product.id)
      : doc(collection(db, 'products'));
    await setDoc(ref, {
      ...product,
      updatedAt: serverTimestamp(),
      createdAt: product?.createdAt ?? serverTimestamp()
    }, { merge: true });
    return ref.id;
  }, product?.id ?? `TRAIN-PROD-${Date.now()}`);
}
export async function deleteProduct(id, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    assertAdminContext();
    await ensureAuth();
    await setDoc(doc(db, 'products', id), { deletedAt: serverTimestamp() }, { merge: true });
    return { ok:true, id };
  }, { ok:true, id, _training:true });
}

/* =============== Clientes (kiosko: autocompletar por teléfono) =============== */
export async function fetchCustomer(phoneDigits) {
  const id = String(phoneDigits||'').replace(/\D+/g,'');
  if (!id) return null;
  const d1 = await getDoc(doc(db,'customers', id));
  return d1.exists() ? d1.data() : null;
}
export async function upsertCustomerFromOrder(order, opts = {}) {
  const { training=false } = opts;
  const phone = String(order?.phone||'').replace(/\D+/g,'');
  if (!phone) return;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    await setDoc(doc(db,'customers', phone), {
      phone, name: order?.customer || null, updatedAt: serverTimestamp()
    }, { merge:true });
    return { ok:true, phone };
  }, { ok:true, phone, _training:true });
}
export async function attachLastOrderRef(phone, orderId, opts = {}) {
  const { training=false } = opts;
  const id = String(phone||'').replace(/\D+/g,'');
  if (!id || !orderId) return;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    await setDoc(doc(db,'customers', id), {
      lastOrderId: orderId, lastOrderAt: serverTimestamp()
    }, { merge:true });
    return { ok:true, id, orderId };
  }, { ok:true, id, orderId, _training:true });
}

/* =============== Coleccionables (stickers/tarjetas) =============== */
// Límites
export const COLLECTIBLE_LIMIT = 7;
export const RARE_LIMIT = 2;

// Pools (ajusta nombres/emojis a tu marca)
export const COMMON_POOL = [
  { id:'c1', emoji:'🍟', name:'Papas Pro' },
  { id:'c2', emoji:'🥤', name:'Refresco Retro' },
  { id:'c3', emoji:'🧀', name:'Cheddar Crew' },
  { id:'c4', emoji:'🌶️', name:'Spicy Squad' },
  { id:'c5', emoji:'🥓', name:'Bacon Band' }
];
export const RARE_POOL = [
  { id:'r1', emoji:'👑🍔', name:'Burger Kingpin', rare:true },
  { id:'r2', emoji:'🛸🍔', name:'UFO Patty', rare:true }
];

function pickCollectible(current=[]) {
  const have = new Set(current.map(x=>x.id));
  const leftCommon = COMMON_POOL.filter(x=>!have.has(x.id));
  const leftRare   = RARE_POOL.filter(x=>!have.has(x.id));

  // Probabilidad rara 10% si ya tiene >=3 y hay raras disponibles
  const tryRare = (current.length>=3) && leftRare.length>0 && Math.random()<0.10;
  const pool = tryRare ? leftRare : (leftCommon.length ? leftCommon : leftRare);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}

/**
 * Lee la colección del cliente.
 * @returns {Promise<{collection: Array, awardedOrderIds: Array, counters: {total:number, rares:number}}>}
 */
export async function getCollectibles(phoneRaw){
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { collection:[], awardedOrderIds:[], counters:{ total:0, rares:0 } };
  const d = await getDoc(doc(db,'customers', phone));
  if (!d.exists()) return { collection:[], awardedOrderIds:[], counters:{ total:0, rares:0 } };
  const data = d.data() || {};
  const collection = Array.isArray(data.collection) ? data.collection : [];
  const awardedOrderIds = Array.isArray(data.awardedOrderIds) ? data.awardedOrderIds : [];
  const counters = data.counters || { total: collection.length, rares: collection.filter(x=>x.rare).length };
  return { collection, awardedOrderIds, counters };
}

/**
 * Suscripción a cambios de coleccionables del cliente.
 * @param {string} phoneRaw
 * @param {(payload)=>void} cb
 */
export function subscribeCollectibles(phoneRaw, cb){
  const phone = normalizePhone(phoneRaw);
  if (!phone) return ()=>{};
  return onSnapshot(doc(db,'customers', phone), (d)=>{
    if (!d.exists()) { cb({ collection:[], awardedOrderIds:[], counters:{total:0,rares:0} }); return; }
    const data = d.data() || {};
    cb({
      collection: Array.isArray(data.collection) ? data.collection : [],
      awardedOrderIds: Array.isArray(data.awardedOrderIds) ? data.awardedOrderIds : [],
      counters: data.counters || {
        total:(data.collection||[]).length,
        rares:(data.collection||[]).filter(x=>x.rare).length
      }
    });
  });
}

/**
 * Premia al cliente si procede (READY/DONE/PAID/DELIVERED), una sola vez por orderId,
 * respetando límites: máx. 7 totales, máx. 2 raros.
 * Devuelve { awarded: boolean, reward, collection }.
 */
export async function awardCollectible({ phone: phoneRaw, orderId, forceReward=null }, opts = {}){
  const { training=false } = opts;
  const phone = normalizePhone(phoneRaw);
  if (!phone || !orderId) return { awarded:false, reward:null, collection:[] };

  if (training){
    const { collection } = await getCollectibles(phone);
    const reward0 = forceReward || pickCollectible(collection);
    if (!reward0) return { awarded:false, reward:null, collection, _training:true };
    return { awarded:true, reward:reward0, collection:[...collection, reward0], _training:true };
  }

  await ensureAuth();

  const ref = doc(db,'customers', phone);
  const snap = await getDoc(ref);
  const data = snap.exists() ? (snap.data() || {}) : {};

  const collection = Array.isArray(data.collection) ? data.collection : [];
  const awardedOrderIds = new Set(Array.isArray(data.awardedOrderIds) ? data.awardedOrderIds : []);
  const counters = data.counters || { total: collection.length, rares: collection.filter(x=>x.rare).length };

  if (awardedOrderIds.has(orderId)) {
    return { awarded:false, reward:null, collection };
  }
  if (counters.total >= COLLECTIBLE_LIMIT) {
    await setDoc(ref, { awardedOrderIds: Array.from(new Set([...awardedOrderIds, orderId])) }, { merge:true });
    return { awarded:false, reward:null, collection };
  }

  // Elegir premio
  const reward0 = forceReward || pickCollectible(collection);
  if (!reward0) {
    await setDoc(ref, { awardedOrderIds: Array.from(new Set([...awardedOrderIds, orderId])) }, { merge:true });
    return { awarded:false, reward:null, collection };
  }

  // Validar raros
  let reward = { ...reward0 };
  const isRare = !!reward.rare;
  if (isRare && counters.rares >= RARE_LIMIT) {
    const have = new Set(collection.map(x=>x.id));
    const commonsLeft = COMMON_POOL.filter(x=>!have.has(x.id));
    const fallback = commonsLeft[0] || null;
    if (!fallback) {
      await setDoc(ref, { awardedOrderIds: Array.from(new Set([...awardedOrderIds, orderId])) }, { merge:true });
      return { awarded:false, reward:null, collection };
    }
    reward = { ...fallback };
  }

  // Aplicar
  const stamp = { ...reward, at: serverTimestamp() };
  const newCollection = [...collection, stamp];
  const newAwarded = Array.from(new Set([...awardedOrderIds, orderId]));
  const newCounters = {
    total: newCollection.length,
    rares: newCollection.filter(x=>x.rare).length
  };

  await setDoc(ref, {
    phone,
    collection: newCollection,
    awardedOrderIds: newAwarded,
    counters: newCounters,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return { awarded:true, reward, collection: newCollection };
}

/* =============== Métricas preparación (para track.js) =============== */
/**
 * Persiste una métrica de preparación (opcional).
 * payload: { orderId, createdAtLocal, readyAtLocal, source }
 */
export async function logPrepMetric(payload, opts = {}){
  const { training=false } = opts;
  const { orderId, createdAtLocal=null, readyAtLocal=null, source='track' } = payload || {};
  if (!orderId) return { ok:false, error:'orderId requerido' };
  return guardWrite(training, async ()=>{
    await ensureAuth();
    await addDoc(collection(db,'metrics_prep'), {
      orderId,
      createdAtLocal: Number(createdAtLocal) || null,
      readyAtLocal: Number(readyAtLocal) || null,
      source: String(source||'track'),
      createdAt: serverTimestamp()
    });
    return { ok:true };
  }, { ok:true, _training:true });
}

/* =============== WhatsApp (opcional vía webhook) =============== */
/**
 * Envía un mensaje de WhatsApp si configuraste un webhook:
 * En Firestore: settings/app.whatsappWebhookUrl = 'https://tu-backend/wa'
 * payload: { to: "52XXXXXXXXXX", text: "mensaje", meta?: {...} }
 */
export async function sendWhatsAppMessage(payload, opts = {}) {
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    try {
      // lee settings/app una vez
      const appDoc = await getDoc(doc(db, SETTINGS, 'app'));
      const webhook = appDoc.exists() ? (appDoc.data()?.whatsappWebhookUrl || '') : '';
      const url = webhook || '/api/wa'; // fallback local si montas un proxy
      if (!url) return { ok:false, error:'No webhook configured' };

      const res = await fetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload || {})
      });
      const json = await res.json().catch(()=> ({}));
      return { ok: res.ok, ...json };
    } catch (e) {
      return { ok:false, error: String(e?.message||e) };
    }
  }, { ok:true, _training:true });
}
