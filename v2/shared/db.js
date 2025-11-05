// /shared/db.js — V2.5 (SAFE + Kiosko/Cocina/Admin)
// Fixes: filtra órdenes vacías/$0, anti-parpadeo, dedupe reforzado,
// DELIVERED solo 15 min, singleton en suscripciones.

const MODE = (typeof window !== 'undefined' && window.MODE) ? window.MODE : {
  OFFLINE:false, READONLY:false, LEGACY:false
};

/* -------- Prefijo (GitHub Pages) -------- */
const BASE_PREFIX = (()=>{ try{
  const p = location.pathname.split('/').filter(Boolean);
  return p[0] ? `/${p[0]}/` : '/';
}catch{ return '/'; }})();

/* -------- Firestore dinámico -------- */
let fs=null, app=null, db=null;
try{ const m = await import('./firebase.js'); app=m.app??null; db=m.db??null; }
catch(e){ console.warn('[db] firebase.js no disponible (PRUEBA):', e); }
try{ fs = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); }
catch(e){ console.warn('[db] Firestore CDN no disponible (PRUEBA):', e); }

/* -------- Shims Firestore -------- */
const Timestamp=fs?.Timestamp??{ fromDate:(d)=>({toMillis:()=> (d instanceof Date?d.getTime():new Date(d).getTime())}) };
const serverTimestamp=fs?.serverTimestamp??(()=>({__localServerTimestamp:Date.now()}));
const increment=fs?.increment??((n)=>n);
const doc=fs?.doc??(()=>({}));
const getDoc=fs?.getDoc??(async()=>({exists:()=>false,data:()=>null}));
const setDoc=fs?.setDoc??(async()=>void 0);
const updateDoc=fs?.updateDoc??(async()=>void 0);
const addDoc=fs?.addDoc??(async()=>({id:`TRAIN-${Math.random().toString(36).slice(2,8)}`}));
const deleteDoc=fs?.deleteDoc??(async()=>void 0);
const collection=fs?.collection??(()=>({}));
const onSnapshot=fs?.onSnapshot??(()=>()=>{});
const query=fs?.query??((...a)=>a);
const where=fs?.where??((...a)=>a);
const orderBy=fs?.orderBy??((...a)=>a);
const limit=fs?.limit??((...a)=>a);
const getDocs=fs?.getDocs??(async()=>({docs:[]}));

const HAS_DB = !!db && !!fs && typeof addDoc==='function';

/* -------- Utils -------- */
async function ensureAuth(){ return true; }
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms));
const nowMs=()=>Date.now();
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function toMillisFlexible(raw){
  if(raw==null) return null;
  if(typeof raw==='number') return raw;
  if(typeof raw?.toMillis==='function') return raw.toMillis();
  if(raw?.seconds!=null) return raw.seconds*1000 + Math.floor((raw.nanoseconds||0)/1e6);
  const ms=new Date(raw).getTime(); return Number.isFinite(ms)?ms:null;
}

/* -------- Guard writes -------- */
async function guardWrite(training, realWriteFn, fakeValue=null){
  const forceSim = MODE.OFFLINE || MODE.READONLY || training || !HAS_DB;
  if(!forceSim) return realWriteFn();
  await sleep(60);
  return (typeof fakeValue==='function')?fakeValue():(fakeValue??{ok:true,_training:true});
}

/* -------- Catálogo -------- */
function normalizeCatalog(cat={}){
  const A = (x)=>Array.isArray(x)?x:(x?[x]:[]);
  const appSettings = {
    miniMeatGrams:Number(cat?.appSettings?.miniMeatGrams??45),
    meatGrams:Number(cat?.appSettings?.meatGrams??85),
    defaultSuggestMlPerOrder:Number(cat?.appSettings?.defaultSuggestMlPerOrder??20),
    lowStockThreshold:Number(cat?.appSettings?.lowStockThreshold??5),
  };
  const happyHour = {
    enabled:!!cat?.happyHour?.enabled,
    discountPercent:Number(cat?.happyHour?.discountPercent??0),
    bannerText:String(cat?.happyHour?.bannerText??''),
    applyEligibleOnly:cat?.happyHour?.applyEligibleOnly!==false,
    endsAt:toMillisFlexible(cat?.happyHour?.endsAt??null),
  };
  return {
    burgers:A(cat.burgers), minis:A(cat.minis), drinks:A(cat.drinks), sides:A(cat.sides),
    extras:{
      sauces:A(cat?.extras?.sauces??[]),
      ingredients:A(cat?.extras?.ingredients??[]),
      ingredientPrice:Number(cat?.extras?.ingredientPrice??0),
      saucePrice:Number(cat?.extras?.saucePrice??0),
      dlcCarneMini:Number(cat?.extras?.dlcCarneMini??0),
    },
    appSettings, happyHour,
  };
}
const DATA_MENU_URL   = `${BASE_PREFIX}data/menu.json`;
const SHARED_MENU_URL = `${BASE_PREFIX}shared/catalog.json`;

export async function fetchCatalogWithFallback(){
  try{ await ensureAuth(); }catch{}
  try{ const r=await fetch(DATA_MENU_URL,{cache:'no-store'}); if(r.ok) return normalizeCatalog(await r.json()); }
  catch(e){ console.warn('[catalog]', DATA_MENU_URL, e); }
  try{ const r=await fetch(SHARED_MENU_URL,{cache:'no-store'}); if(r.ok) return normalizeCatalog(await r.json()); }
  catch(e){ console.warn('[catalog]', SHARED_MENU_URL, e); }
  try{
    if(HAS_DB){ const d=await getDoc(doc(db,'settings','catalog')); if(d?.exists()) return normalizeCatalog(d.data()); }
  }catch(e){ console.warn('[catalog] settings/catalog', e); }
  try{
    if(HAS_DB){ const d=await getDoc(doc(db,'catalog','public')); if(d?.exists()) return normalizeCatalog(d.data()); }
  }catch(e){ console.warn('[catalog] catalog/public', e); }
  return normalizeCatalog({});
}

/* -------- PRUEBA (localStorage) -------- */
const LS_ORDERS='__orders', LS_HH='__happyHour', LS_ETA='__eta';
const lsRead=(k,def)=>{ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v??def; }catch{ return def; } };
const lsWrite=(k,val)=>{ try{ localStorage.setItem(k, JSON.stringify(val)); }catch{} };

function simListActiveOrders(){
  const rows = lsRead(LS_ORDERS, []);
  const start = startOfToday();
  return rows.filter(o=>(o.createdAt||0)>=start).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
}
function simGetOrderById(id){
  return lsRead(LS_ORDERS, []).find(o=>o.id===id) || null;
}
function simUpsertOrder(row){
  const rows = lsRead(LS_ORDERS, []);
  const i = rows.findIndex(o=>o.id===row.id);
  const safe = {
    items: Array.isArray(row.items)?row.items:[],
    subtotal: Number(row.subtotal||0),
    createdAt: row.createdAt || nowMs(),
    updatedAt: nowMs(),
    ...row
  };
  if(i>=0) rows[i]=safe; else rows.push(safe);
  lsWrite(LS_ORDERS, rows);
}

/* -------- Órdenes: crear / actualizar -------- */
export async function createOrder(payload){
  const now=nowMs();
  const base={ id:null, status:'PENDING', createdAt:now, updatedAt:now, ...payload };

  return guardWrite(false, async()=>{
    const ref = await addDoc(collection(db,'orders'), {
      ...base, createdAt:serverTimestamp(), updatedAt:serverTimestamp()
    });
    return ref?.id;
  }, ()=>{ const id=`SIM-${now}-${Math.floor(Math.random()*1000)}`; simUpsertOrder({...base,id}); return id; });
}

export async function updateOrderStatus(orderId, status){
  const valid=['PENDING','IN_PROGRESS','READY','DELIVERED','PAID','CANCELLED'];
  if(!valid.includes(status)) throw new Error('status inválido');
  return guardWrite(false, async()=>{
    await updateDoc(doc(db,'orders',orderId), { status, updatedAt:serverTimestamp() });
    return {ok:true};
  }, ()=>{ const r=simGetOrderById(orderId); if(!r) return {ok:false,reason:'not_found'}; r.status=status; r.updatedAt=nowMs(); simUpsertOrder(r); return {ok:true,_training:true}; });
}

/* -------- Filtros y dedupe -------- */
function stableHash(rows){
  try{
    const key = rows.map(r=>[
      r.id, r.status,
      Number(r.updatedAt||0), Number(r.createdAt||0),
      Number(r.subtotal||0), Array.isArray(r.items)?r.items.length:0
    ].join('|')).join('||');
    let h=0; for(let i=0;i<key.length;i++){ h=(h*31 + key.charCodeAt(i))|0; }
    return String(h);
  }catch{ return String(Math.random()); }
}

function onlyTodayActive(rows){
  const start = startOfToday();
  const now   = nowMs();
  const KEEP  = new Set(['PENDING','IN_PROGRESS','READY','DELIVERED']);
  const MAX_READY_AGE = 15*60*1000; // 15 min
  const out=[]; const seen=new Set();

  for(const r of rows||[]){
    if(!r || seen.has(r.id)) continue; seen.add(r.id);
    const ct = Number(r.createdAt||0);
    const ut = Number(r.updatedAt||ct||0);
    const subtotal = Number(r.subtotal||0);
    const itemsLen = Array.isArray(r.items)?r.items.length:0;

    if(!(ct>=start)) continue;                // sólo HOY
    if(!KEEP.has(r.status)) continue;         // sin PAID/CANCELLED
    if(subtotal<=0 || itemsLen<=0) continue;  // descarta “$0” / vacías
    if(r.status==='DELIVERED' && (now-ut)>MAX_READY_AGE) continue; // entregadas viejas

    out.push(r);
  }
  out.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  return out;
}

/* -------- Suscripción: Cocina (singleton + debounce) -------- */
let __kitchenUnsub=null;
export function subscribeKitchenOrders(cb){
  if(__kitchenUnsub){ try{ __kitchenUnsub(); }catch{} __kitchenUnsub=null; }

  let lastHash=''; let debounce=null;
  const push=(rows)=>{
    const clean=onlyTodayActive(rows);
    const h=stableHash(clean);
    if(h===lastHash) return;
    lastHash=h;
    clearTimeout(debounce);
    debounce=setTimeout(()=>{ try{ cb(clean); }catch(e){ console.warn('kitchen cb',e); } }, 150);
  };

  if(HAS_DB){
    // Si tu colección usa Timestamp real, este where puede requerir índice; si falla, se filtra client-side.
    let qRef = query(collection(db,'orders'), orderBy('createdAt','desc'), limit(150));
    try{
      const start = Timestamp.fromDate(new Date(startOfToday()));
      qRef = query(collection(db,'orders'), where('createdAt','>=',start), orderBy('createdAt','desc'), limit(150));
    }catch{ /* fallback sin where */ }

    const unsub = onSnapshot(qRef, snap=>{
      const rows = snap.docs.map(d=>{
        const data=d.data()||{};
        return {
          id:d.id, ...data,
          createdAt: toMillisFlexible(data.createdAt),
          updatedAt: toMillisFlexible(data.updatedAt),
          subtotal: Number(data.subtotal||0),
          items: Array.isArray(data.items)?data.items:[]
        };
      });
      push(rows);
    }, err=> console.warn('[subscribeKitchenOrders] onSnapshot', err));
    __kitchenUnsub=()=>{ clearTimeout(debounce); unsub(); };
    return __kitchenUnsub;
  }

  // PRUEBA: polling
  let alive=true;
  const tick=()=>{ if(!alive) return; try{ push(simListActiveOrders()); }catch(e){console.warn('poll kitchen',e);} __kitchenUnsub=setTimeout(tick,1200); };
  tick();
  return ()=>{ alive=false; clearTimeout(__kitchenUnsub); __kitchenUnsub=null; };
}

/* -------- Suscripción genérica (kiosko/admin) -------- */
let __ordersUnsub=null;
export function subscribeOrders(cb){
  if(__ordersUnsub){ try{ __ordersUnsub(); }catch{} __ordersUnsub=null; }

  let lastHash='';
  const push=(rows)=>{ const clean=onlyTodayActive(rows); const h=stableHash(clean); if(h===lastHash) return; lastHash=h; try{ cb(clean); }catch{} };

  if(HAS_DB){
    let qRef = query(collection(db,'orders'), orderBy('createdAt','desc'), limit(150));
    try{
      const start = Timestamp.fromDate(new Date(startOfToday()));
      qRef = query(collection(db,'orders'), where('createdAt','>=',start), orderBy('createdAt','desc'), limit(150));
    }catch{}
    const unsub = onSnapshot(qRef, snap=>{
      const rows = snap.docs.map(d=>{
        const data=d.data()||{};
        return {
          id:d.id, ...data,
          createdAt: toMillisFlexible(data.createdAt),
          updatedAt: toMillisFlexible(data.updatedAt),
          subtotal: Number(data.subtotal||0),
          items: Array.isArray(data.items)?data.items:[]
        };
      });
      push(rows);
    });
    __ordersUnsub=unsub;
    return ()=>{ unsub(); __ordersUnsub=null; };
  }

  // PRUEBA
  let alive=true;
  const tick=()=>{ if(!alive) return; try{ push(simListActiveOrders()); }catch{} __ordersUnsub=setTimeout(tick,1800); };
  tick();
  return ()=>{ alive=false; clearTimeout(__ordersUnsub); __ordersUnsub=null; };
}

/* -------- HH y ETA -------- */
export function subscribeHappyHour(cb){
  if(HAS_DB){
    const ref=doc(db,'settings','happyHour');
    return onSnapshot(ref, snap=>{
      const d=snap.data?.() || snap.data && snap.data() || {};
      cb({ enabled:!!d.enabled, discountPercent:Number(d.discountPercent||0), bannerText:d.bannerText||'', applyEligibleOnly:d.applyEligibleOnly!==false, endsAt:toMillisFlexible(d.endsAt) });
    }, err=> console.warn('[subscribeHappyHour]', err));
  }
  let alive=true; const tick=()=>{ if(!alive) return; cb(lsRead(LS_HH,{enabled:false,discountPercent:0,bannerText:'',applyEligibleOnly:true,endsAt:null})); setTimeout(tick,5000); };
  tick(); return ()=>{ alive=false; };
}
export function subscribeETA(cb){
  if(HAS_DB){
    const ref=doc(db,'settings','eta');
    return onSnapshot(ref, snap=>{
      const d=snap.data?.() || snap.data && snap.data() || {};
      const txt=d?.text ?? d?.value ?? '7–10 min';
      cb(String(txt));
    }, err=> console.warn('[subscribeETA]', err));
  }
  let alive=true; const tick=()=>{ if(!alive) return; cb(String(lsRead(LS_ETA,'7–10 min'))); setTimeout(tick,5000); };
  tick(); return ()=>{ alive=false; };
}

/* -------- Clientes / WhatsApp (stubs) -------- */
export async function upsertCustomerFromOrder(order){
  return guardWrite(false, async()=>{
    if(!HAS_DB) return {ok:true,_training:true};
    const ref=doc(db,'customers', order.phone || order.clientId);
    await setDoc(ref,{ name:order.customer||null, phone:order.phone||null, lastOrderId:order.id||null, updatedAt:serverTimestamp(), createdAt:serverTimestamp() },{merge:true});
    return {ok:true};
  }, {ok:true,_training:true});
}
export async function attachLastOrderRef(phone, orderId){
  if(!phone) return {ok:false,reason:'no_phone'};
  return guardWrite(false, async()=>{
    if(!HAS_DB) return {ok:true,_training:true};
    await setDoc(doc(db,'customers',phone),{ lastOrderId:orderId, updatedAt:serverTimestamp() },{merge:true});
    return {ok:true};
  }, {ok:true,_training:true});
}
export async function sendWhatsAppMessage({to,text}){ console.info('[WA] pretend send to',to,'\n',text); return {ok:true,simulated:true}; }

/* -------- Export helpers -------- */
export {
  db, collection, onSnapshot, query, where, orderBy, limit, getDocs,
  addDoc, setDoc, updateDoc, doc, getDoc, deleteDoc,
  Timestamp, serverTimestamp, increment
};

console.info('[db] BASE_PREFIX =', BASE_PREFIX, 'DATA_MENU_URL =', DATA_MENU_URL, 'HAS_DB=', HAS_DB);
