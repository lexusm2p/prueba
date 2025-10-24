// /shared/db.js — V2 SAFE (completo)
// - Usa Firestore real si está disponible via ./firebase.js.
// - Si falla, expone mocks seguros (no truenan).
// - Catálogo con fallback a /data/menu.json o ../shared/catalog.json.
// - Suscripción a órdenes en vivo (subscribeOrders) + alias.
// - Mantiene API mínima para el kiosko.

const MODE = (typeof window !== 'undefined' && window.MODE)
  ? window.MODE
  : { OFFLINE:false, READONLY:false, LEGACY:false };

/* =========================
   Carga segura de Firebase
   ========================= */
let app = null;
let db  = null;

// Intentamos importar TODO desde tu firebase.js
let fns = {};
try {
  const mod = await import('./firebase.js');
  app = mod.app ?? null;
  db  = mod.db  ?? null;
  fns = {
    // Lectura
    collection:   mod.collection,
    doc:          mod.doc,
    getDoc:       mod.getDoc,
    getDocs:      mod.getDocs,
    query:        mod.query,
    where:        mod.where,
    orderBy:      mod.orderBy,
    limit:        mod.limit,
    onSnapshot:   mod.onSnapshot,
    // Escritura
    addDoc:       mod.addDoc,
    setDoc:       mod.setDoc,
    updateDoc:    mod.updateDoc,
    deleteDoc:    mod.deleteDoc,
    // Utilidades
    serverTimestamp: mod.serverTimestamp,
    increment:    mod.increment,
    Timestamp:    mod.Timestamp,
    // (opcional) ensureAuth si lo exportas
    ensureAuth:   mod.ensureAuth,
  };
} catch (e) {
  console.warn('[db.js] No se pudo importar ./firebase.js (OK si estás offline):', e);
}

// Mocks ultra-seguros si faltara algo:
const noopAsync = async () => void 0;
const noop      = () => ({});
const TS_fallback = { fromDate: (d)=>({ toMillis: ()=> (d instanceof Date ? d.getTime() : new Date(d).getTime()) }) };

const collection      = fns.collection    ?? (()=>({}));
const doc             = fns.doc           ?? (()=>({}));
const getDoc          = fns.getDoc        ?? (async()=>({ exists:()=>false, data:()=>null }));
const getDocs         = fns.getDocs       ?? (async()=>({ docs: [] }));
const query           = fns.query         ?? ((...a)=>a);
const where           = fns.where         ?? ((...a)=>a);
const orderBy         = fns.orderBy       ?? ((...a)=>a);
const limit           = fns.limit         ?? ((...a)=>a);
const onSnapshot      = fns.onSnapshot    ?? (()=>()=>{});

const addDoc          = fns.addDoc        ?? (async()=>({ id: `TRAIN-${Math.random().toString(36).slice(2,8)}` }));
const setDoc          = fns.setDoc        ?? noopAsync;
const updateDoc       = fns.updateDoc     ?? noopAsync;
const deleteDoc       = fns.deleteDoc     ?? noopAsync;

const serverTimestamp = fns.serverTimestamp ?? (() => ({ __localServerTimestamp: Date.now() }));
const increment       = fns.increment       ?? ((n)=>n);
const Timestamp       = fns.Timestamp       ?? TS_fallback;

const ensureAuth = fns.ensureAuth ?? (async()=>true);

/* =========================
   Helpers comunes
   ========================= */
const sleep = (ms = 60) => new Promise(r => setTimeout(r, ms));
const toTs  = (d) => Timestamp.fromDate(new Date(d));

function toMillisFlexible(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw?.seconds != null) return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1e6);
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function guardWrite(training, realWriteFn, fakeValue = null) {
  const forceSim = MODE.OFFLINE || MODE.READONLY || training || !db;
  if (!forceSim && db && addDoc && setDoc) return realWriteFn();
  await sleep(60);
  return (fakeValue ?? { ok:true, _training:true });
}

/* =========================
   Catálogo con fallback
   ========================= */
function normalizeCatalog(cat = {}) {
  const A = (x) => Array.isArray(x) ? x : (x ? [x] : []);
  const appSettings = {
    miniMeatGrams: Number(cat?.appSettings?.miniMeatGrams ?? 45),
    meatGrams: Number(cat?.appSettings?.meatGrams ?? 85),
    defaultSuggestMlPerOrder: Number(cat?.appSettings?.defaultSuggestMlPerOrder ?? 20),
    lowStockThreshold: Number(cat?.appSettings?.lowStockThreshold ?? 5),
  };
  const happyHour = {
    enabled: !!cat?.happyHour?.enabled,
    discountPercent: Number(cat?.happyHour?.discountPercent ?? 0),
    bannerText: String(cat?.happyHour?.bannerText ?? ''),
    applyEligibleOnly: cat?.happyHour?.applyEligibleOnly !== false,
    endsAt: toMillisFlexible(cat?.happyHour?.endsAt ?? null),
  };
  return {
    burgers: A(cat.burgers),
    minis:   A(cat.minis),
    drinks:  A(cat.drinks),
    sides:   A(cat.sides),
    extras: {
      sauces: A(cat?.extras?.sauces ?? []),
      ingredients: A(cat?.extras?.ingredients ?? []),
      ingredientPrice: Number(cat?.extras?.ingredientPrice ?? 0),
      saucePrice: Number(cat?.extras?.saucePrice ?? 0),
      dlcCarneMini: Number(cat?.extras?.dlcCarneMini ?? 0),
    },
    appSettings,
    happyHour,
  };
}

// Siempre queremos que en GitHub Pages bajo /prueba/... busque /prueba/data/menu.json
const guessDataPath = () => '../data/menu.json';

export async function fetchCatalogWithFallback() {
  try { await ensureAuth(); } catch {}
  // 1) settings/catalog
  try {
    if (db) {
      const d1 = await getDoc(doc(db, 'settings', 'catalog'));
      if (d1?.exists?.()) return normalizeCatalog(d1.data());
    }
  } catch (e) { console.warn('[catalog] settings/catalog falló, sigo...', e); }

  // 2) catalog/public
  try {
    if (db) {
      const d2 = await getDoc(doc(db, 'catalog', 'public'));
      if (d2?.exists?.()) return normalizeCatalog(d2.data());
    }
  } catch (e) { console.warn('[catalog] catalog/public falló, sigo...', e); }

  // 3) /data/menu.json (proyecto)
  try {
    const r = await fetch(guessDataPath(), { cache: 'no-store' });
    if (r.ok) return normalizeCatalog(await r.json());
  } catch (e) { console.warn('[catalog] ../data/menu.json falló, sigo...', e); }

  // 4) ../shared/catalog.json (fallback adicional)
  try {
    const r2 = await fetch('../shared/catalog.json', { cache: 'no-store' });
    if (r2.ok) return normalizeCatalog(await r2.json());
  } catch (e) { console.warn('[catalog] shared/catalog.json falló', e); }

  return normalizeCatalog({});
}

// Tabla simple para Admin (solo lectura, usando el catálogo actual)
export function subscribeProducts(cb) {
  (async () => {
    const cat = await fetchCatalogWithFallback();
    const items = [
      ...(cat.burgers || []).map(p => ({ ...p, type: 'burger' })),
      ...(cat.minis   || []).map(p => ({ ...p, type: 'mini' })),
      ...(cat.drinks  || []).map(p => ({ ...p, type: 'drink' })),
      ...(cat.sides   || []).map(p => ({ ...p, type: 'side'  })),
    ];
    cb?.(items);
  })();
}

/* =========================
   Órdenes — lectura en vivo
   ========================= */
export function subscribeOrders(cb, { limitN = 50 } = {}) {
  if (!db || !onSnapshot) {
    console.warn('[db.js] subscribeOrders: no DB activo (modo offline/readonly).');
    cb?.([]);
    return () => {};
  }
  const ref = collection(db, 'orders');
  const qy  = query(ref, orderBy('createdAt', 'desc'), limit(limitN));
  return onSnapshot(
    qy,
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cb?.(list);
    },
    (err) => console.error('[subscribeOrders] onSnapshot error:', err)
  );
}

// Alias de compatibilidad
export const onOrdersSnapshot   = subscribeOrders;
export const subscribeActiveOrders = subscribeOrders;

// Kitchen: filtra por estados típicos
export function subscribeKitchenOrders(cb, { limitN = 120 } = {}) {
  const valid = new Set(['PENDING','IN_PROGRESS','READY','DELIVERED']);
  return subscribeOrders((rows) => {
    cb?.((rows || []).filter(o => valid.has(String(o?.status || '').toUpperCase())));
  }, { limitN });
}

/* =========================
   (Opcional) CRUD mínimos
   ========================= */
export async function createOrder(order, opts = {}) {
  const { training = false } = opts;
  const payload = {
    ...order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  return guardWrite(training, async () => {
    await ensureAuth().catch(()=>{});
    const ref = await addDoc(collection(db, 'orders'), payload);
    return ref.id;
  }, `TRAIN-ORDER-${Date.now()}`);
}

export async function updateOrder(id, patch, opts = {}) {
  const { training = false } = opts;
  if (!id || typeof patch !== 'object') return { ok:false, reason: 'invalid' };
  return guardWrite(training, async () => {
    await ensureAuth().catch(()=>{});
    await updateDoc(doc(db, 'orders', id), { ...patch, updatedAt: serverTimestamp() });
    return { ok:true };
  }, { ok:true, _training:true });
}

/* =========================
   Exports “públicos”
   ========================= */
export {
  app, db,
  // Firestore helpers
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
};
