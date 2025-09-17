// /shared/db.js
// Firestore + catálogo con fallback. Reportes, settings (ETA/HH/Theme),
// inventario, recetas/producción, artículos y clientes.
// Modo PRUEBA: evita escrituras cuando opts.training === true.

import {
  db, ensureAuth,
  serverTimestamp, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  onSnapshot, query, where, orderBy, limit, Timestamp, increment, getDocs
} from './firebase.js';

// =================== Utils ===================
const sleep = (ms=60) => new Promise(r=>setTimeout(r, ms));
const toTs  = (d) => Timestamp.fromDate(new Date(d));
const startOfToday = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };

async function guardWrite(training, realWriteFn, fakeValue=null){
  if (!training) return realWriteFn();
  await sleep(60);
  return fakeValue ?? { ok:true, _training:true };
}

// =================== Catálogo: fetch con fallback ===================
function toMillisFlexible(raw){
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw?.seconds != null) return raw.seconds*1000 + Math.floor((raw.nanoseconds||0)/1e6);
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeCatalog(cat = {}){
  const safeArr = (x)=> Array.isArray(x) ? x : (x ? [x] : []);
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
    appSettings, happyHour,
  };
}
const guessDataPath = () => '../data/menu.json';

export async function fetchCatalogWithFallback(){
  try { const d1 = await getDoc(doc(db,'settings','catalog')); if (d1.exists()) return normalizeCatalog(d1.data()); } catch {}
  try { const d2 = await getDoc(doc(db,'catalog','public'));  if (d2.exists()) return normalizeCatalog(d2.data()); } catch {}
  try { const r  = await fetch(guessDataPath(), { cache:'no-store' }); if (r.ok)  return normalizeCatalog(await r.json()); } catch {}
  try { const r2 = await fetch('../shared/catalog.json', { cache:'no-store' }); if (r2.ok) return normalizeCatalog(await r2.json()); } catch {}
  return normalizeCatalog({});
}

// Solo lectura (para la tabla de Productos en Admin)
export function subscribeProducts(cb){
  (async ()=>{
    const cat = await fetchCatalogWithFallback();
    const items = [
      ...(cat.burgers||[]).map(p=>({...p, type:'burger'})),
      ...(cat.minis||[]).map(p=>({...p, type:'mini'})),
      ...(cat.drinks||[]).map(p=>({...p, type:'drink'})),
      ...(cat.sides||[]).map(p=>({...p, type:'side'})),
    ];
    cb(items);
  })();
}

// =================== Órdenes / Reportes ===================
export async function getOrdersRange({ from, to, includeArchive=false, orderType=null }){
  try{
    const _from = toTs(from);
    const _to   = toTs(to);

    const qMain = query(
      collection(db,'orders'),
      where('createdAt','>=', _from),
      where('createdAt','<=', _to),
      orderBy('createdAt','asc')
    );

    const reads = [ getDocs(qMain) ];
    if (includeArchive){
      const qArch = query(
        collection(db,'orders_archive'),
        where('createdAt','>=', _from),
        where('createdAt','<=', _to),
        orderBy('createdAt','asc')
      );
      reads.push(getDocs(qArch));
    }

    const snaps = await Promise.all(reads);
    let rows = snaps.flatMap(s=> s.docs.map(d=> ({ id:d.id, ...d.data() })));

    if (orderType && orderType !== 'all'){
      rows = rows.filter(o =>
        (o.orderType && o.orderType === orderType) ||
        (o.orderMeta?.type && o.orderMeta.type === orderType)
      );
    }
    return rows;
  } catch (e){
    console.error('[getOrdersRange]', e);
    return [];
  }
}

// =================== Happy Hour / Settings / Theme ===================
export function subscribeHappyHour(cb){
  return onSnapshot(doc(db,'settings','happyHour'), (d)=> cb(d.data() ?? null));
}
export async function setHappyHour(payload, opts={}){
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    const durationMin = Number(payload?.durationMin||0);
    const endsAtMs = payload?.enabled
      ? (durationMin>0 ? Date.now() + durationMin*60000 : toMillisFlexible(payload?.endsAt))
      : null;

    const normalized = {
      enabled: !!payload?.enabled,
      discountPercent: Number(payload?.discountPercent||0),
      bannerText: String(payload?.bannerText||''),
      endsAt: endsAtMs,
      durationMin: durationMin>0 ? durationMin : null,
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db,'settings','happyHour'), normalized, { merge:true });
    return { ok:true };
  }, { ok:true, _training:true });
}

export function subscribeSettings(cb){
  return onSnapshot(doc(db,'settings','app'), (d)=> cb(d.data() ?? {}));
}
export function subscribeTheme(cb){
  return onSnapshot(doc(db,'settings','theme'), (d)=> cb(d.data() ?? null));
}
export async function setTheme({ name, overrides = {} }, opts={}){
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    await setDoc(doc(db,'settings','theme'), { name, overrides, updatedAt:serverTimestamp() }, { merge:true });
    return { ok:true };
  }, { ok:true, _training:true });
}

// =================== Inventario / Proveedores / Compras ===================
export function subscribeInventory(cb){
  const qy = query(collection(db,'inventory'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertInventoryItem(item, opts={}){
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    const ref = item?.id ? doc(db,'inventory', item.id) : doc(collection(db,'inventory'));
    await setDoc(ref, { ...item, updatedAt:serverTimestamp() }, { merge:true });
    return ref.id;
  }, item?.id ?? `TRAIN-INV-${Date.now()}`);
}

export function subscribeSuppliers(cb){
  const qy = query(collection(db,'suppliers'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertSupplier(supp, opts={}){
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    const ref = supp?.id ? doc(db,'suppliers', supp.id) : doc(collection(db,'suppliers'));
    await setDoc(ref, { ...supp, updatedAt:serverTimestamp() }, { merge:true });
    return ref.id;
  }, supp?.id ?? `TRAIN-SUP-${Date.now()}`);
}

// compra: registra purchase + recalcula stock y costo promedio
export async function recordPurchase(purchase, opts={}){
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    const { itemId, qty=0, unitCost=0 } = purchase || {};
    await addDoc(collection(db,'purchases'), { ...purchase, createdAt:serverTimestamp() });

    if (itemId && qty > 0){
      const ref = doc(db,'inventory', itemId);
      const snap = await getDoc(ref);
      const cur = snap.exists()? Number(snap.data().currentStock||0) : 0;
      const prevCost = snap.exists()? Number(snap.data().costAvg||0) : 0;
      const newStock = cur + Number(qty);
      const newCost =
        (prevCost>0 && cur>0) ? ((prevCost*cur + unitCost*qty) / newStock) : unitCost;
      await setDoc(ref, { currentStock:newStock, costAvg:newCost, updatedAt:serverTimestamp() }, { merge:true });
    }
    return { ok:true };
  }, { ok:true, _training:true });
}

export async function adjustStock(itemId, delta, reason='use', meta={}, opts={}){
  const { training=false } = opts;
  if (!itemId || !Number.isFinite(delta)) return;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    const ref = doc(db,'inventory', itemId);
    await setDoc(ref, { currentStock: increment(Number(delta)), updatedAt:serverTimestamp() }, { merge:true });
    await addDoc(collection(db,'inventory_moves'), {
      itemId, delta:Number(delta), reason, meta, createdAt:serverTimestamp()
    });
    return { ok:true };
  }, { ok:true, _training:true });
}

// =================== Recetas / Producción ===================
export function subscribeRecipes(cb){
  const qy = query(collection(db,'recipes'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function produceBatch({ recipeId, outputQty }, opts={}){
  const { training=false } = opts;
  if (!recipeId || !(outputQty>0)) throw new Error('Datos de producción inválidos');
  return guardWrite(training, async ()=>{
    await ensureAuth();
    await addDoc(collection(db,'productions'), { recipeId, outputQty, createdAt:serverTimestamp() });
    return { ok:true };
  }, { ok:true, _training:true });
}

// =================== Artículos (CRUD) ===================
export function subscribeArticles(cb){
  const qy = query(collection(db,'articles'), orderBy('updatedAt','desc'), limit(100));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertArticle(article, opts={}){
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    const ref = article?.id ? doc(db,'articles', article.id) : doc(collection(db,'articles'));
    await setDoc(ref, { ...article, updatedAt:serverTimestamp(), createdAt: article?.createdAt ?? serverTimestamp() }, { merge:true });
    return ref.id;
  }, article?.id ?? `TRAIN-ART-${Date.now()}`);
}
export async function deleteArticle(id, opts={}){
  const { training=false } = opts;
  return guardWrite(training, async ()=>{
    await ensureAuth();
    await updateDoc(doc(db,'articles', id), { deletedAt:serverTimestamp() });
    return { ok:true, id };
  }, { ok:true, id, _training:true });
}