// /shared/db.js  (V2 SAFE con BASE_PREFIX = "/prueba/")
const MODE = (typeof window !== 'undefined' && window.MODE) ? window.MODE : { OFFLINE:false, READONLY:false, LEGACY:false };

/* ------------ Prefijo para archivos estáticos en GitHub Pages ------------ */
// Tomamos el primer segmento de la URL: /prueba/...
const BASE_PREFIX = (() => {
  try {
    const parts = location.pathname.split('/').filter(Boolean);
    const first = parts[0];
    return first ? `/${first}/` : '/';
  } catch { return '/'; }
})();

let fs = null;
let app = null;
let db  = null;

try {
  const mod = await import('./firebase.js');
  app = mod.app ?? null;
  db  = mod.db  ?? null;
} catch (e) {
  console.warn('[db.js] No se pudo importar ./firebase.js (OK en offline):', e);
}

try {
  fs = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
} catch (e) {
  console.warn('[db.js] Firestore CDN no disponible (OK en offline):', e);
}

const Timestamp        = fs?.Timestamp ?? { fromDate: (d)=>({ toMillis: ()=> (d instanceof Date? d.getTime(): new Date(d).getTime()) }) };
const serverTimestamp  = fs?.serverTimestamp ?? (() => ({ __localServerTimestamp: Date.now() }));
const increment        = fs?.increment ?? ((n)=>n);
const doc              = fs?.doc ?? (()=>({}));
const getDoc           = fs?.getDoc ?? (async()=>({ exists:()=>false, data:()=>null }));
const setDoc           = fs?.setDoc ?? (async()=>void 0);
const updateDoc        = fs?.updateDoc ?? (async()=>void 0);
const addDoc           = fs?.addDoc ?? (async()=>({ id: `TRAIN-${Math.random().toString(36).slice(2,8)}` }));
const deleteDoc        = fs?.deleteDoc ?? (async()=>void 0);
const collection       = fs?.collection ?? (()=>({}));
const onSnapshot       = fs?.onSnapshot ?? (()=>()=>{});
const query            = fs?.query ?? ((...a)=>a);
const where            = fs?.where ?? ((...a)=>a);
const orderBy          = fs?.orderBy ?? ((...a)=>a);
const limit            = fs?.limit ?? ((...a)=>a);
const getDocs          = fs?.getDocs ?? (async()=>({ docs: [] }));

async function ensureAuth(){ return true; }

const sleep = (ms = 60) => new Promise(r => setTimeout(r, ms));
const toTs = (d) => Timestamp.fromDate(new Date(d));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

async function guardWrite(training, realWriteFn, fakeValue = null) {
  const forceSim = MODE.OFFLINE || MODE.READONLY || training;
  if (!forceSim && db && addDoc && setDoc) return realWriteFn();
  await sleep(60);
  return (fakeValue ?? { ok:true, _training:true });
}

function toMillisFlexible(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw?.seconds != null) return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1e6);
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ======= Catálogo =======
function normalizeCatalog(cat = {}) {
  const safeArr = (x) => Array.isArray(x) ? x : (x ? [x] : []);
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
    burgers: safeArr(cat.burgers),
    minis:   safeArr(cat.minis),
    drinks:  safeArr(cat.drinks),
    sides:   safeArr(cat.sides),
    extras: {
      sauces: safeArr(cat?.extras?.sauces ?? []),
      ingredients: safeArr(cat?.extras?.ingredients ?? []),
      ingredientPrice: Number(cat?.extras?.ingredientPrice ?? 0),
      saucePrice: Number(cat?.extras?.saucePrice ?? 0),
      dlcCarneMini: Number(cat?.extras?.dlcCarneMini ?? 0),
    },
    appSettings,
    happyHour,
  };
}

/* Rutas correctas en GitHub Pages */
const DATA_MENU_URL   = `${BASE_PREFIX}data/menu.json`;      // -> /prueba/data/menu.json
const SHARED_MENU_URL = `${BASE_PREFIX}shared/catalog.json`; // -> /prueba/shared/catalog.json`

export async function fetchCatalogWithFallback() {
  try { await ensureAuth(); } catch {}

  // 1) Primero: JSON local (para que siempre tengas menú aunque falle Firestore)
  try {
    const r = await fetch(DATA_MENU_URL, { cache: 'no-store' });
    if (r.ok) return normalizeCatalog(await r.json());
    console.warn('[catalog] no está', DATA_MENU_URL, r.status);
  } catch (e) { console.warn('[catalog] fallo leyendo', DATA_MENU_URL, e); }

  try {
    const r2 = await fetch(SHARED_MENU_URL, { cache: 'no-store' });
    if (r2.ok) return normalizeCatalog(await r2.json());
    console.warn('[catalog] no está', SHARED_MENU_URL, r2.status);
  } catch (e) { console.warn('[catalog] fallo leyendo', SHARED_MENU_URL, e); }

  // 2) Luego: Firestore (si está configurado)
  try {
    if (db) {
      const d1 = await getDoc(doc(db, 'settings', 'catalog'));
      if (d1?.exists()) return normalizeCatalog(d1.data());
    }
  } catch (e) { console.warn('[catalog] settings/catalog fallo, sigo...', e); }

  try {
    if (db) {
      const d2 = await getDoc(doc(db, 'catalog', 'public'));
      if (d2?.exists()) return normalizeCatalog(d2.data());
    }
  } catch (e) { console.warn('[catalog] catalog/public fallo, sigo...', e); }

  // 3) Último recurso: vacío normalizado
  return normalizeCatalog({});
}

// ======= Aux exports =======
export {
  db, collection, onSnapshot, query, where, orderBy, limit, getDocs,
  addDoc, setDoc, updateDoc, doc, getDoc, deleteDoc,
  Timestamp, serverTimestamp, increment
};

console.info('[db] BASE_PREFIX =', BASE_PREFIX, 'DATA_MENU_URL =', DATA_MENU_URL);
