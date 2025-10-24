// /shared/db.js  (V2 SAFE)
// - Mocks seguros si no hay Firestore (no truena en offline).
// - fetchCatalogWithFallback() con fallbacks a JSON local.
// - setTheme() para guardar el tema activo en /settings/theme.
// - Exports mínimos usados por otros módulos.

const MODE = (typeof window !== 'undefined' && window.MODE)
  ? window.MODE
  : { OFFLINE:false, READONLY:false, LEGACY:false };

/* =================== Carga Firebase / Firestore =================== */
let fs = null;
let app = null;
let db  = null;

try {
  const mod = await import('./firebase.js'); // expone app y db
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

/* =================== Wrappers / Mocks =================== */
const Timestamp       = fs?.Timestamp      ?? { fromDate: (d)=>({ toMillis: ()=> (d instanceof Date? d.getTime(): new Date(d).getTime()) }) };
const serverTimestamp = fs?.serverTimestamp?? (() => ({ __localServerTimestamp: Date.now() }));
const increment       = fs?.increment      ?? ((n)=>n);
const doc             = fs?.doc            ?? (()=>({}));
const getDoc          = fs?.getDoc         ?? (async()=>({ exists:()=>false, data:()=>null }));
const setDoc          = fs?.setDoc         ?? (async()=>void 0);
const updateDoc       = fs?.updateDoc      ?? (async()=>void 0);
const addDoc          = fs?.addDoc         ?? (async()=>({ id: `TRAIN-${Math.random().toString(36).slice(2,8)}` }));
const deleteDoc       = fs?.deleteDoc      ?? (async()=>void 0);
const collection      = fs?.collection     ?? (()=>({}));
const onSnapshot      = fs?.onSnapshot     ?? (()=>()=>{});
const query           = fs?.query          ?? ((...a)=>a);
const where           = fs?.where          ?? ((...a)=>a);
const orderBy         = fs?.orderBy        ?? ((...a)=>a);
const limit           = fs?.limit          ?? ((...a)=>a);
const getDocs         = fs?.getDocs        ?? (async()=>({ docs: [] }));

// En Kiosko V2 no bloqueamos por auth: stub
async function ensureAuth(){ return true; }

/* =================== Utils =================== */
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

/* =================== Catálogo =================== */
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
const guessDataPath = () => '../data/menu.json';

export async function fetchCatalogWithFallback() {
  try { await ensureAuth(); } catch {}

  // 1) settings/catalog
  try {
    if (db) {
      const d1 = await getDoc(doc(db, 'settings', 'catalog'));
      if (d1?.exists()) return normalizeCatalog(d1.data());
    }
  } catch (e) { console.warn('[catalog] settings/catalog fallo, sigo...', e); }

  // 2) catalog/public
  try {
    if (db) {
      const d2 = await getDoc(doc(db, 'catalog', 'public'));
      if (d2?.exists()) return normalizeCatalog(d2.data());
    }
  } catch (e) { console.warn('[catalog] catalog/public fallo, sigo...', e); }

  // 3) ../data/menu.json
  try {
    const r = await fetch(guessDataPath(), { cache: 'no-store' });
    if (r.ok) return normalizeCatalog(await r.json());
  } catch (e) { console.warn('[catalog] ../data/menu.json fallo, sigo...', e); }

  // 4) shared/catalog.json
  try {
    const r2 = await fetch('../shared/catalog.json', { cache: 'no-store' });
    if (r2.ok) return normalizeCatalog(await r2.json());
  } catch (e) { console.warn('[catalog] shared/catalog.json fallo', e); }

  return normalizeCatalog({});
}

/* =================== Tema (fix para import { setTheme } ) =================== */
/**
 * Guarda el tema activo en Firestore (/settings/theme).
 * Acepta string ("Halloween") o un objeto { name, overrides? }.
 * Usa guardWrite para respetar OFFLINE/READONLY (simula en training).
 */
export async function setTheme(payload, opts = {}) {
  const { training = false } = opts;

  // Normaliza entrada
  const name = (typeof payload === 'string') ? payload : (payload?.name || 'Base');
  const overrides = (typeof payload === 'object' && payload && payload.overrides) ? payload.overrides : {};
  const body = {
    name,
    ...(Object.keys(overrides).length ? { overrides } : {}),
    updatedAt: serverTimestamp()
  };

  return guardWrite(training, async () => {
    await ensureAuth();
    if (!db) return { ok: true, _training: true }; // mock
    await setDoc(doc(db, 'settings', 'theme'), body, { merge: true });
    try { console.info('[db] setTheme OK:', name); } catch {}
    return { ok: true };
  }, { ok: true, _training: true });
}

/* =================== Exports básicos =================== */
export {
  db, app,
  collection, onSnapshot, query, where, orderBy, limit, getDocs,
  addDoc, setDoc, updateDoc, doc, getDoc, deleteDoc,
  Timestamp, serverTimestamp, increment,
  // helpers útiles
  toTs, startOfToday
};
