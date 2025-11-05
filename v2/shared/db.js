// /shared/db.js — V2.2 (SAFE + GitHub Pages prefix + Cocina/Kiosko compatibles)
// - Prefijo automático para /prueba/ u otros repos de GitHub Pages
// - Catálogo con fallback (json local -> Firestore -> vacío normalizado)
// - Suscripciones y acciones de ÓRDENES para Cocina/Kiosko
// - Happy Hour y ETA en tiempo real (+ fallback)
// - Guard writes simulados si OFFLINE/READONLY (modo PRUEBA seguro)

const MODE = (typeof window !== 'undefined' && window.MODE)
  ? window.MODE
  : { OFFLINE:false, READONLY:false, LEGACY:false };

/* ------------ Prefijo para archivos estáticos (GitHub Pages) ------------ */
export const BASE_PREFIX = (() => {
  try {
    const first = (location.pathname.split('/').filter(Boolean)[0]) || '';
    return first ? `/${first}/` : '/';
  } catch { return '/'; }
})();

/* ---------------------------- Firebase imports --------------------------- */
let app = null, db = null, ensureAuth = async ()=>true;
try {
  const mod = await import('./firebase.js'); // tu inicialización propia
  app = mod.app ?? null;
  db  = mod.db  ?? null;
  ensureAuth = mod.ensureAuth || ensureAuth;
} catch (e) {
  console.warn('[db.js] No se pudo importar ./firebase.js (OK offline):', e);
}

/* ---------------------- Firestore SDK (wrapper seguro) ------------------- */
let fs = null;
try {
  fs = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
} catch (e) {
  console.warn('[db.js] Firestore CDN no disponible (OK offline):', e);
}
const Timestamp       = fs?.Timestamp      ?? { fromDate: (d)=>({ toMillis: ()=> (d instanceof Date? d.getTime(): new Date(d).getTime()) }) };
const serverTimestamp = fs?.serverTimestamp?? (() => ({ __localServerTimestamp: Date.now() }));
const increment       = fs?.increment      ?? ((n)=>n);
const doc             = fs?.doc            ?? (()=>({}));
const getDoc          = fs?.getDoc         ?? (async()=>({ exists:()=>false, data:()=>null }));
const setDoc          = fs?.setDoc         ?? (async()=>void 0);
const updateDoc       = fs?.updateDoc      ?? (async()=>void 0);
const addDoc          = fs?.addDoc         ?? (async()=>({ id:`TRAIN-${Math.random().toString(36).slice(2,8)}` }));
const deleteDoc       = fs?.deleteDoc      ?? (async()=>void 0);
const collection      = fs?.collection     ?? (()=>({}));
const onSnapshot      = fs?.onSnapshot     ?? (()=>()=>{});
const query           = fs?.query          ?? ((...a)=>a);
const where           = fs?.where          ?? ((...a)=>a);
const orderBy         = fs?.orderBy        ?? ((...a)=>a);
const limit           = fs?.limit          ?? ((...a)=>a);
const getDocs         = fs?.getDocs        ?? (async()=>({ docs: [] }));

/* --------------------------------- Utils --------------------------------- */
const sleep = (ms=60)=> new Promise(r=>setTimeout(r,ms));
const toTs  = (d) => Timestamp.fromDate(new Date(d));
const msAny = (raw)=>{
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw?.seconds != null) return raw.seconds*1000 + Math.floor((raw.nanoseconds||0)/1e6);
  const v = new Date(raw).getTime();
  return Number.isFinite(v) ? v : null;
};

// Escribe real si hay DB y no estás en modo simulado; si no, simula.
async function guardWrite(training, realWriteFn, fakeValue=null){
  const sim = MODE.OFFLINE || MODE.READONLY || training || !db;
  if (!sim) return realWriteFn();
  await sleep(60);
  return (fakeValue ?? { ok:true, _training:true });
}

/* ================================ Catálogo =============================== */
const DATA_MENU_URL   = `${BASE_PREFIX}data/menu.json`;      // /prueba/data/menu.json
const SHARED_MENU_URL = `${BASE_PREFIX}shared/catalog.json`; // /prueba/shared/catalog.json

function normalizeCatalog(cat = {}){
  const A = (x)=> Array.isArray(x) ? x : (x ? [x] : []);
  const happyHour = {
    enabled: !!cat?.happyHour?.enabled,
    discountPercent: Number(cat?.happyHour?.discountPercent ?? 0),
    bannerText: String(cat?.happyHour?.bannerText ?? ''),
    applyEligibleOnly: cat?.happyHour?.applyEligibleOnly !== false,
    endsAt: msAny(cat?.happyHour?.endsAt ?? null),
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
    appSettings:{
      miniMeatGrams: Number(cat?.appSettings?.miniMeatGrams ?? 45),
      meatGrams: Number(cat?.appSettings?.meatGrams ?? 85),
      defaultSuggestMlPerOrder: Number(cat?.appSettings?.defaultSuggestMlPerOrder ?? 20),
      lowStockThreshold: Number(cat?.appSettings?.lowStockThreshold ?? 5),
    },
    happyHour,
  };
}

export async function fetchCatalogWithFallback(){
  try { await ensureAuth(); } catch {}

  // 1) JSON local (rápido y siempre disponible)
  try {
    const r = await fetch(DATA_MENU_URL, { cache:'no-store' });
    if (r.ok) return normalizeCatalog(await r.json());
    console.warn('[catalog] no está', DATA_MENU_URL, r.status);
  } catch (e) { console.warn('[catalog] fallo leyendo', DATA_MENU_URL, e); }

  try {
    const r2 = await fetch(SHARED_MENU_URL, { cache:'no-store' });
    if (r2.ok) return normalizeCatalog(await r2.json());
    console.warn('[catalog] no está', SHARED_MENU_URL, r2.status);
  } catch (e) { console.warn('[catalog] fallo leyendo', SHARED_MENU_URL, e); }

  // 2) Firestore (si existe)
  try {
    if (db) {
      const s1 = await getDoc(doc(db,'settings','catalog'));
      if (s1?.exists()) return normalizeCatalog(s1.data());
    }
  } catch (e) { console.warn('[catalog] settings/catalog fallo, sigo...', e); }
  try {
    if (db) {
      const s2 = await getDoc(doc(db,'catalog','public'));
      if (s2?.exists()) return normalizeCatalog(s2.data());
    }
  } catch (e) { console.warn('[catalog] catalog/public fallo, sigo...', e); }

  // 3) Último recurso
  return normalizeCatalog({});
}

/* =========================== ÓRDENES (Kitchen/Kiosk) =========================== */
// Listado puntual (por si no hay tiempo real)
export async function listActiveOrders(limitN=80){
  if (!(db && getDocs)) return [];
  try{
    const qy = query(
      collection(db,'orders'),
      where('status','in',['PENDING','IN_PROGRESS','READY','DELIVERED']),
      orderBy('createdAt','desc'),
      limit(limitN)
    );
    const snap = await getDocs(qy);
    return snap.docs.map(d => ({ id:d.id, ...d.data(), createdAt: msAny(d.data()?.createdAt) }));
  }catch(e){
    console.warn('[db] listActiveOrders error:', e);
    return [];
  }
}

// Suscripción en vivo (con fallback a polling 5s)
export function subscribeActiveOrders(cb){
  if (db && onSnapshot && query && where && orderBy && limit){
    try{
      const qy = query(
        collection(db,'orders'),
        where('status','in',['PENDING','IN_PROGRESS','READY','DELIVERED']),
        orderBy('createdAt','desc'),
        limit(120)
      );
      return onSnapshot(qy, (snap)=>{
        const rows = snap.docs.map(d => ({ id:d.id, ...d.data(), createdAt: msAny(d.data()?.createdAt) }));
        cb(rows);
      }, (err)=> console.warn('[db] subscribeActiveOrders snapshot err:', err));
    }catch(e){
      console.warn('[db] subscribeActiveOrders query err, uso polling:', e);
    }
  }
  // fallback polling
  let t=null;
  const tick = async()=> cb(await listActiveOrders());
  t = setInterval(tick, 5000); tick();
  return ()=> { if(t) clearInterval(t); };
}

// Aliases tolerantes (varias UIs las usan)
export const subscribeKitchenOrders = subscribeActiveOrders;
export const subscribeOrders        = subscribeActiveOrders;
export const onOrdersSnapshot       = subscribeActiveOrders;

// Crear orden (Kiosko)
export async function createOrder(orderBase={}, opts={}){
  const run = async ()=>{
    if (!(db && addDoc)) return { id:`TRAIN-${Date.now()}` };
    const ref = await addDoc(collection(db,'orders'), {
      ...orderBase,
      status: orderBase.status || 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { id: ref.id };
  };
  return guardWrite(opts?.training, run, { id:`TRAIN-${Math.random().toString(36).slice(2,8)}` });
}

// Cambiar estado (Cocina)
export async function updateOrderStatus(orderId, nextStatus, extras={}){
  const run = async ()=>{
    if (!(db && updateDoc)) return { ok:false };
    const ref = doc(db,'orders', orderId);
    const payload = {
      status: String(nextStatus||'PENDING'),
      updatedAt: serverTimestamp(),
      ...extras
    };
    if (nextStatus === 'IN_PROGRESS') payload.takenAt     = serverTimestamp();
    if (nextStatus === 'READY')       payload.readyAt     = serverTimestamp();
    if (nextStatus === 'DELIVERED')   payload.deliveredAt = serverTimestamp();
    if (nextStatus === 'PAID')        payload.paidAt      = serverTimestamp();
    if (nextStatus === 'CANCELLED')   payload.cancelledAt = serverTimestamp();
    await updateDoc(ref, payload);
    return { ok:true, id:orderId };
  };
  return guardWrite(extras?.training, run, { ok:true, id:orderId, _training:true });
}

/* ========================= SETTINGS (Happy Hour / ETA) ======================== */
export function subscribeHappyHour(cb){
  if (db && onSnapshot){
    const ref = doc(db,'settings','happyHour');
    return onSnapshot(ref, (snap)=>{
      const d = snap?.data?.() || {};
      cb({
        enabled: !!d.enabled,
        discountPercent: Number(d.discountPercent||0),
        bannerText: String(d.bannerText||''),
        applyEligibleOnly: d.applyEligibleOnly !== false,
        endsAt: msAny(d.endsAt)
      });
    }, (err)=>{
      console.warn('[db] subscribeHappyHour err:', err);
      cb({ enabled:false, discountPercent:0, bannerText:'', applyEligibleOnly:true, endsAt:null });
    });
  }
  // fallback
  cb({ enabled:false, discountPercent:0, bannerText:'', applyEligibleOnly:true, endsAt:null });
  return ()=>{};
}

export function subscribeETA(cb){
  if (db && onSnapshot){
    const ref = doc(db,'settings','eta');
    return onSnapshot(ref, (snap)=>{
      const v = snap?.data?.()?.text ?? snap?.data?.()?.eta ?? null;
      cb(v || '7–10 min');
    }, (err)=>{
      console.warn('[db] subscribeETA err:', err);
      cb('7–10 min');
    });
  }
  // fallback
  cb('7–10 min');
  return ()=>{};
}

/* =================== No-ops opcionales usados por Kiosko =================== */
export async function upsertCustomerFromOrder(){ /* no-op local */ }
export async function attachLastOrderRef(){ /* no-op local */ }
export async function sendWhatsAppMessage(){ /* no-op local */ }

/* ============================== Aux exports ============================== */
export {
  app, db,
  collection, onSnapshot, query, where, orderBy, limit, getDocs,
  addDoc, setDoc, updateDoc, doc, getDoc, deleteDoc,
  Timestamp, serverTimestamp, increment, ensureAuth, toTs
};

console.info('[db] BASE_PREFIX =', BASE_PREFIX, 'DATA_MENU_URL =', DATA_MENU_URL);
