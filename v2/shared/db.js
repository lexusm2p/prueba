// /shared/db.js — V2.6 (SAFE + v2-aware + emisión estable + anti-rebote)
// - Namespace de localStorage por ruta (/prueba/v2/) para evitar colisiones.
// - Filtro cocina: HOY + estados visibles + subtotal>0 + items>0 + dedup.
// - onSnapshot coalesced (250ms) + DISTINCT-BY-HASH (insensible a updatedAt).
// - Anti-rollback de estado: no permite retroceder PENDING<-IN_PROGRESS<-READY<-DELIVERED<-PAID.
// - PRUEBA (sin Firestore): polling 2s con los mismos filtros y anti-rebote.
// - Utilidades: purgeSimToday().

const MODE = (typeof window !== 'undefined' && window.MODE) ? window.MODE : {
  OFFLINE:false, READONLY:false, LEGACY:false
};

/* -------------------- Prefijo (GitHub Pages) -------------------- */
const BASE_PREFIX = (() => {
  try {
    const parts = location.pathname.split('/').filter(Boolean); // ["prueba","v2","cocina","index.html"]
    if (parts[0] && parts[1] === 'v2') return `/${parts[0]}/v2/`;
    return parts[0] ? `/${parts[0]}/` : '/';
  } catch { return '/'; }
})();
const STORAGE_SLUG = (() => {
  try {
    const parts = location.pathname.split('/').filter(Boolean);
    return (parts[0] ? parts[0] : 'root') + (parts[1] ? `-${parts[1]}` : '');
  } catch { return 'root'; }
})();

/* -------------------- Firestore dinámico -------------------- */
let fs = null, app = null, db = null;
try { const mod = await import('./firebase.js'); app = mod.app ?? null; db = mod.db ?? null; }
catch (e) { console.warn('[db] No ./firebase.js (PRUEBA ok):', e); }
try { fs = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); }
catch (e) { console.warn('[db] No Firestore CDN (PRUEBA ok):', e); }

/* -------------------- Shims/exports -------------------- */
const Timestamp        = fs?.Timestamp       ?? { fromDate: (d)=>({ toMillis: ()=> (d instanceof Date? d.getTime(): new Date(d).getTime()) }) };
const serverTimestamp  = fs?.serverTimestamp ?? (() => ({ __localServerTimestamp: Date.now() }));
const increment        = fs?.increment       ?? ((n)=>n);
const doc              = fs?.doc             ?? (()=>({}));
const getDoc           = fs?.getDoc          ?? (async()=>({ exists:()=>false, data:()=>null }));
const setDoc           = fs?.setDoc          ?? (async()=>void 0);
const updateDoc        = fs?.updateDoc       ?? (async()=>void 0);
const addDoc           = fs?.addDoc          ?? (async()=>({ id: `TRAIN-${Math.random().toString(36).slice(2,8)}` }));
const deleteDoc        = fs?.deleteDoc       ?? (async()=>void 0);
const collection       = fs?.collection      ?? (()=>({}));
const onSnapshot       = fs?.onSnapshot      ?? (()=>()=>{});
const query            = fs?.query           ?? ((...a)=>a);
const where            = fs?.where           ?? ((...a)=>a);
const orderBy          = fs?.orderBy         ?? ((...a)=>a);
const limit            = fs?.limit           ?? ((...a)=>a);
const getDocs          = fs?.getDocs         ?? (async()=>({ docs: [] }));

const HAS_DB = !!db && !!fs && typeof addDoc === 'function';

/* -------------------- Utils -------------------- */
async function ensureAuth(){ return true; }
const sleep = (ms = 80) => new Promise(r => setTimeout(r, ms));
function nowMs(){ return Date.now(); }
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function toMillisFlexible(raw){
  if (raw==null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw?.seconds != null) return raw.seconds*1000 + Math.floor((raw.nanoseconds||0)/1e6);
  const ms = new Date(raw).getTime(); return Number.isFinite(ms) ? ms : null;
}

/* -------------------- Guard writes -------------------- */
async function guardWrite(training, realWriteFn, fakeValue=null){
  const forceSim = MODE.OFFLINE || MODE.READONLY || training || !HAS_DB;
  if (!forceSim) return realWriteFn();
  await sleep(60);
  return (typeof fakeValue === 'function') ? fakeValue() : (fakeValue ?? { ok:true, _training:true });
}

/* -------------------- Catálogo -------------------- */
function normalizeCatalog(cat = {}){
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
const DATA_MENU_URL   = `${BASE_PREFIX}data/menu.json`;
const SHARED_MENU_URL = `${BASE_PREFIX}shared/catalog.json`;

export async function fetchCatalogWithFallback(){
  try{ await ensureAuth(); }catch{}
  try{ const r = await fetch(DATA_MENU_URL, {cache:'no-store'}); if (r.ok) return normalizeCatalog(await r.json()); }
  catch (e){ console.warn('[catalog]', DATA_MENU_URL, e); }
  try{ const r2 = await fetch(SHARED_MENU_URL, {cache:'no-store'}); if (r2.ok) return normalizeCatalog(await r2.json()); }
  catch (e){ console.warn('[catalog]', SHARED_MENU_URL, e); }
  try{ if (HAS_DB){ const d1 = await getDoc(doc(db,'settings','catalog')); if (d1?.exists()) return normalizeCatalog(d1.data()); } }
  catch(e){ console.warn('[catalog] settings/catalog', e); }
  try{ if (HAS_DB){ const d2 = await getDoc(doc(db,'catalog','public')); if (d2?.exists()) return normalizeCatalog(d2.data()); } }
  catch(e){ console.warn('[catalog] catalog/public', e); }
  return normalizeCatalog({});
}

/* -------------------- Backend PRUEBA (localStorage, namespaced) -------------------- */
const LS_ORDERS = `__orders@${STORAGE_SLUG}`;
const LS_HH     = `__happyHour@${STORAGE_SLUG}`;
const LS_ETA    = `__eta@${STORAGE_SLUG}`;

function lsRead(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v??d; }catch{ return d; } }
function lsWrite(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
function simListAll(){ return lsRead(LS_ORDERS, []); }
function simUpsertOrder(row){ const rows=simListAll(); const i=rows.findIndex(o=>o.id===row.id); if(i>=0) rows[i]=row; else rows.push(row); lsWrite(LS_ORDERS, rows); }
function simGetOrderById(id){ return simListAll().find(o=>o.id===id)||null; }
function simListActiveToday(){
  const start=startOfToday();
  return simListAll().filter(o => (o.createdAt||0) >= start)
    .sort((a,b)=> (a.createdAt||0)-(b.createdAt||0));
}
export function purgeSimToday(){
  const start=startOfToday();
  const keep=simListAll().filter(o=> (o.createdAt||0) < start);
  lsWrite(LS_ORDERS, keep);
}

/* -------------------- Órdenes -------------------- */
export async function createOrder(payload){
  const now = nowMs();
  const base = { id:null, status:'PENDING', createdAt:now, updatedAt:now, ...payload };
  return guardWrite(false, async ()=>{
    const ref = await addDoc(collection(db,'orders'), { ...base, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
    return ref?.id;
  }, ()=>{ const id=`SIM-${now}-${Math.floor(Math.random()*1000)}`; simUpsertOrder({...base,id}); return id; });
}

export async function updateOrderStatus(orderId, status){
  const valid=['PENDING','IN_PROGRESS','READY','DELIVERED','PAID','CANCELLED'];
  if (!valid.includes(status)) throw new Error('status inválido');
  return guardWrite(false, async ()=>{
    await updateDoc(doc(db,'orders', orderId), { status, updatedAt: serverTimestamp() });
    return true;
  }, ()=>{ const row=simGetOrderById(orderId); if(!row) return {ok:false, reason:'not_found'};
          row.status=status; row.updatedAt=nowMs(); simUpsertOrder(row); return {ok:true,_training:true}; });
}

/* -------------------- Filtros + hash -------------------- */
function filterForKitchen(rows){
  const start = startOfToday();
  const okStatus = new Set(['PENDING','IN_PROGRESS','READY','DELIVERED']);
  const m = new Map();
  for (const raw of (rows||[])){
    if (!raw || !raw.id) continue;
    const o = { ...raw };
    o.createdAt = toMillisFlexible(o.createdAt);
    o.updatedAt = toMillisFlexible(o.updatedAt);
    if (!okStatus.has(o.status)) continue;
    if ((o.createdAt||0) < start) continue;
    if (!(Array.isArray(o.items) && o.items.length>0)) continue;
    if (!(Number(o.subtotal||0) > 0)) continue;
    m.set(o.id, o); // dedup por id
  }
  return Array.from(m.values()).sort((a,b)=>{
    const A=a.createdAt||0, B=b.createdAt||0;
    if (A!==B) return A-B;
    return String(a.id).localeCompare(String(b.id));
  });
}
function hashForKitchen(rows){
  // Hash “insensible” a updatedAt para reducir repaints por metadatos
  const pack = rows.map(o=>[o.id, o.status, Number(o.subtotal||0), (o.items?.length||0), (o.createdAt||0)]);
  try { return JSON.stringify(pack); } catch { return String(Math.random()); }
}

/* -------------------- Anti-rollback de estado -------------------- */
const RANK = { PENDING:1, IN_PROGRESS:2, READY:3, DELIVERED:4, PAID:5, CANCELLED:99 };
function applyMonotonicGuard(rows, lastMap){
  // lastMap: id -> rank ya visto; devolvemos nueva lista sin retrocesos
  const out = [];
  for (const o of rows){
    const r = RANK[o.status] ?? 0;
    const prev = lastMap.get(o.id) ?? 0;
    if (r >= prev) { lastMap.set(o.id, r); out.push(o); }
    // si r < prev, ignoramos este doc (snapshot atrasado)
  }
  return out;
}

/* -------------------- Suscripciones con coalesce -------------------- */
export function subscribeKitchenOrders(cb){
  let lastHash = '';
  let pending = null;
  let t = null;
  const lastRankMap = new Map(); // id -> rank máximo visto

  const emitOnce = (rows)=>{
    const filtered = filterForKitchen(rows);
    const monotone = applyMonotonicGuard(filtered, lastRankMap);
    const h = hashForKitchen(monotone);
    if (h === lastHash) return;
    lastHash = h;
    cb(monotone);
  };

  const schedule = (rows)=>{
    pending = rows;
    clearTimeout(t);
    t = setTimeout(()=>{ const p = pending; pending = null; emitOnce(p||[]); }, 250);
  };

  if (HAS_DB){
    const qRef = query(collection(db,'orders'), orderBy('createdAt','desc'), limit(160));
    const unsub = onSnapshot(qRef, snap=>{
      const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      schedule(rows);
    }, err=> console.warn('[subscribeKitchenOrders] onSnapshot error:', err));
    return ()=>{ try{ unsub?.(); }catch{} clearTimeout(t); };
  }

  // PRUEBA: polling 2s sin ráfagas (aplica el mismo guard)
  let alive = true;
  (function tick(){
    if (!alive) return;
    try { const rows = simListActiveToday(); emitOnce(rows); } catch (e) { console.warn('poll kitchen fail', e); }
    setTimeout(tick, 2000);
  })();
  return ()=>{ alive = false; clearTimeout(t); };
}

/* -------------------- Suscripción genérica -------------------- */
export function subscribeOrders(cb){
  if (HAS_DB){
    const qRef = query(collection(db,'orders'), orderBy('createdAt','desc'), limit(160));
    return onSnapshot(qRef, snap=>{
      const rows = snap.docs.map(d=>{
        const data = d.data()||{};
        return { id:d.id, ...data,
          createdAt: toMillisFlexible(data.createdAt),
          updatedAt: toMillisFlexible(data.updatedAt)
        };
      });
      cb(rows);
    });
  }
  let alive = true;
  (function tick(){ if (!alive) return; try{ cb(simListActiveToday()); }catch{} setTimeout(tick, 2500); })();
  return ()=>{ alive=false; };
}

/* -------------------- HH & ETA -------------------- */
export function subscribeHappyHour(cb){
  if (HAS_DB){
    const ref = doc(db,'settings','happyHour');
    return onSnapshot(ref, snap=>{
      const d = (typeof snap.data === 'function' ? snap.data() : snap.data) || {};
      cb({ enabled:!!d.enabled, discountPercent:Number(d.discountPercent||0),
           bannerText:d.bannerText||'', applyEligibleOnly:d.applyEligibleOnly!==false,
           endsAt: toMillisFlexible(d.endsAt) });
    }, err=> console.warn('[subscribeHappyHour] error', err));
  }
  let alive = true;
  (function tick(){ if(!alive) return; cb(lsRead(LS_HH,{enabled:false,discountPercent:0,bannerText:'',applyEligibleOnly:true,endsAt:null})); setTimeout(tick,5000); })();
  return ()=>{ alive=false; };
}
export function subscribeETA(cb){
  if (HAS_DB){
    const ref = doc(db,'settings','eta');
    return onSnapshot(ref, snap=>{
      const d = (typeof snap.data === 'function' ? snap.data() : snap.data) || {};
      cb(String(d?.text ?? d?.value ?? '7–10 min'));
    }, err=> console.warn('[subscribeETA] error', err));
  }
  let alive = true;
  (function tick(){ if(!alive) return; cb(String(lsRead(LS_ETA,'7–10 min'))); setTimeout(tick,5000); })();
  return ()=>{ alive=false; };
}

/* -------------------- Clientes / WhatsApp (stubs) -------------------- */
export async function upsertCustomerFromOrder(order){
  return guardWrite(false, async ()=>{
    if (!HAS_DB) return { ok:true, _training:true };
    const ref = doc(db,'customers', order.phone || order.clientId || order.id);
    await setDoc(ref, { name:order.customer||null, phone:order.phone||null, lastOrderId:order.id||null,
      updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge:true });
    return { ok:true };
  }, { ok:true, _training:true });
}
export async function attachLastOrderRef(phone, orderId){
  if (!phone) return { ok:false, reason:'no_phone' };
  return guardWrite(false, async ()=>{
    if (!HAS_DB) return { ok:true, _training:true };
    await setDoc(doc(db,'customers', phone), { lastOrderId:orderId, updatedAt:serverTimestamp() }, { merge:true });
    return { ok:true };
  }, { ok:true, _training:true });
}
export async function sendWhatsAppMessage({ to, text }){
  console.info('[WA] pretend send to', to, '\n', text);
  return { ok:true, simulated:true };
}

/* -------------------- Exports crudos -------------------- */
export {
  db, collection, onSnapshot, query, where, orderBy, limit, getDocs,
  addDoc, setDoc, updateDoc, doc, getDoc, deleteDoc,
  Timestamp, serverTimestamp, increment
};

console.info('[db] BASE_PREFIX =', BASE_PREFIX, 'HAS_DB =', HAS_DB, 'LS namespace =', STORAGE_SLUG);
