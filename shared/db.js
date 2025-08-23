// /shared/db.js
import {
  collection, doc, addDoc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, deleteDoc, setDoc, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, ensureAnonAuth } from "./firebase.js";

/* =============================================================================
   CATÁLOGO (Kiosko + Admin)
   Colección "products" (tipos soportados):
   - type: 'big' | 'mini' | 'drink' | 'side' | 'combo'
   - { id, name, price, type, active, baseOf?, ingredients:[], salsaDefault,
       salsasSugeridas:[], icon:'', hhEligible?: true, comboItems?:[],
       // opcional para control de stock por pieza:
       // stockItemId?:string, stockPerUnit?:number, stockMap?:[{itemId,qty,unit}]
     }
   Extras:
   - /extras/sauces => { items: [{name, price}] }
   - /extras/ingredients => { items: [{name, price}] }
   Settings:
   - /settings/app => {
       dlcCarneMini:number,
       saucePrice?:number, ingredientPrice?:number,
       sauceCupItemId?: string   // ID de inventario para vasitos (opcional)
     }
   Happy Hour:
   - /settings/happyHour => {
       enabled:boolean, discountPercent:number (0-100),
       bannerText?:string, applyEligibleOnly?:boolean
     }
   ========================================================================== */

/** Catálogo → primero Firestore; si no hay datos, fallback a /data/menu.json */
export async function fetchCatalogWithFallback(){
  await ensureAnonAuth();

  try{
    // Productos activos
    const productsCol = collection(db, "products");
    const qAct = query(productsCol, where("active","==", true));
    const snap = await getDocs(qAct);
    const products = snap.docs.map(d => ({ id:d.id, ...d.data() }));

    // Extras + settings + HH
    const saucesDoc = await getDoc(doc(db, "extras", "sauces"));
    const ingreDoc  = await getDoc(doc(db, "extras", "ingredients"));
    const appCfgDoc = await getDoc(doc(db, "settings", "app"));
    const hhDoc     = await getDoc(doc(db, "settings", "happyHour"));

    const saucesArr = saucesDoc.exists() ? (saucesDoc.data().items||[]) : [];
    const ingsArr   = ingreDoc.exists()  ? (ingreDoc.data().items||[])  : [];
    const cfg       = appCfgDoc.exists() ? appCfgDoc.data()             : {};
    const happyHour = hhDoc.exists()     ? hhDoc.data()                 : { enabled:false, discountPercent:0 };

    if (products.length) {
      const burgers = products.filter(p=>p.type==='big');
      const minis   = products.filter(p=>p.type==='mini');
      const drinks  = products.filter(p=>p.type==='drink');
      const sides   = products.filter(p=>p.type==='side');
      const combos  = products.filter(p=>p.type==='combo');

      // Precio global de extras (si no hay por ítem)
      const saucePrice = Number(
        (cfg.saucePrice ?? (
          saucesArr.length ? (saucesArr.reduce((a,it)=>a+(Number(it.price)||0),0)/saucesArr.length) : 0
        ))
      ) || 8;

      const ingredientPrice = Number(
        (cfg.ingredientPrice ?? (
          ingsArr.length ? (ingsArr.reduce((a,it)=>a+(Number(it.price)||0),0)/ingsArr.length) : 0
        ))
      ) || 10;

      const dlcCarneMini = Number(cfg.dlcCarneMini ?? 12);

      return {
        burgers,
        minis,
        drinks,
        sides,
        combos,
        extras: {
          sauces: saucesArr.map(s=>s.name),
          saucePrice,
          ingredients: ingsArr.map(i=>i.name),
          ingredientPrice,
          dlcCarneMini
        },
        happyHour: {
          enabled: !!happyHour.enabled,
          discountPercent: Number(happyHour.discountPercent||0),
          bannerText: happyHour.bannerText || '',
          applyEligibleOnly: happyHour.applyEligibleOnly!==false // default true
        },
        appSettings: {
          sauceCupItemId: cfg.sauceCupItemId || null
        }
      };
    }
  }catch(e){
    console.warn('[fetchCatalogWithFallback] Firestore vacío o error, uso local:', e);
  }

  // Fallback a /data/menu.json
  const res = await fetch('../data/menu.json');
  const json = await res.json();
  if (!json.extras.dlcCarneMini) json.extras.dlcCarneMini = 12;
  json.happyHour ||= { enabled:false, discountPercent:0, bannerText:'', applyEligibleOnly:true };
  json.drinks ||= []; json.sides ||= []; json.combos ||= [];
  json.appSettings ||= { sauceCupItemId: null };
  return json;
}

/* ---------------------
   CRUD Productos (Admin)
   --------------------- */
export function subscribeProducts(cb){
  const qy = query(collection(db, 'products'), orderBy('name', 'asc'));
  return onSnapshot(qy, (snap)=>{
    const items = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    cb(items);
  }, (err)=> console.error('[subscribeProducts]', err));
}

export async function upsertProduct(prod){
  await ensureAnonAuth();
  const now = serverTimestamp();
  const clean = {
    name: String(prod.name||'').trim(),
    price: Number(prod.price||0),
    type: prod.type || 'big', // 'big' | 'mini' | 'drink' | 'side' | 'combo'
    active: prod.active!==false,
    baseOf: prod.baseOf || null, // minis: id de la grande
    ingredients: Array.isArray(prod.ingredients) ? prod.ingredients : [],
    salsaDefault: prod.salsaDefault || null,
    salsasSugeridas: Array.isArray(prod.salsasSugeridas) ? prod.salsasSugeridas : [],
    icon: prod.icon || '',
    hhEligible: prod.hhEligible!==false,
    comboItems: Array.isArray(prod.comboItems) ? prod.comboItems : [],
    stockItemId: prod.stockItemId || null,
    stockPerUnit: (prod.stockPerUnit!=null) ? Number(prod.stockPerUnit) : null,
    stockMap: Array.isArray(prod.stockMap) ? prod.stockMap : []
  };
  if (prod.id && String(prod.id||'').trim()){
    const id = String(prod.id).trim();
    await setDoc(doc(db, 'products', id), { id, ...clean, updatedAt: now }, { merge:true });
    return id;
  }else{
    const ref = await addDoc(collection(db, 'products'), { ...clean, createdAt: now });
    await setDoc(ref, { id: ref.id }, { merge:true });
    return ref.id;
  }
}

export async function deleteProduct(productId){
  await ensureAnonAuth();
  await deleteDoc(doc(db, 'products', productId));
}

/* ---------------------
   Extras (aderezos/ingredientes)
   --------------------- */
export function subscribeExtras(cb){
  const unsub1 = onSnapshot(doc(db,'extras','sauces'), (d1)=>{
    const sauces = d1.exists()? (d1.data().items||[]) : [];
    getDoc(doc(db,'extras','ingredients')).then(d2=>{
      const ingredients = d2.exists()? (d2.data().items||[]) : [];
      cb({ sauces, ingredients });
    });
  }, (err)=> console.error('[subscribeExtras:sauces]', err));
  return ()=> unsub1();
}

export async function setSauces(items){
  await ensureAnonAuth();
  const clean = (items||[]).map(x=>({ name:String(x.name||'').trim(), price:Number(x.price||0) }));
  await setDoc(doc(db,'extras','sauces'), { items: clean }, { merge:true });
}

export async function setIngredients(items){
  await ensureAnonAuth();
  const clean = (items||[]).map(x=>({ name:String(x.name||'').trim(), price:Number(x.price||0) }));
  await setDoc(doc(db,'extras','ingredients'), { items: clean }, { merge:true });
}

/* ---------------------
   Settings (app) & Happy Hour
   --------------------- */
export function subscribeSettings(cb){
  return onSnapshot(doc(db,'settings','app'), (d)=>{
    cb(d.exists()? d.data() : {});
  }, (err)=> console.error('[subscribeSettings]', err));
}
export async function setSettings(patch){
  await ensureAnonAuth();
  await setDoc(doc(db,'settings','app'), patch, { merge:true });
}

export function subscribeHappyHour(cb){
  return onSnapshot(doc(db,'settings','happyHour'), (d)=>{
    cb(d.exists()? d.data() : { enabled:false, discountPercent:0, bannerText:'', applyEligibleOnly:true });
  }, (err)=> console.error('[subscribeHappyHour]', err));
}
export async function setHappyHour(patch){
  await ensureAnonAuth();
  const clean = {
    enabled: !!patch.enabled,
    discountPercent: Math.max(0, Math.min(100, Number(patch.discountPercent||0))),
    bannerText: String(patch.bannerText||''),
    applyEligibleOnly: patch.applyEligibleOnly!==false
  };
  await setDoc(doc(db,'settings','happyHour'), clean, { merge:true });
}

/* =============================================================================
   ÓRDENES
   Estructura recomendada:
   {
     customer, orderType:'pickup'|'dinein'|'delivery', table?, channel? ('delivery'|'onsite'),
     supplierId?, commission?:number, tip?:number, subtotal:number, notes?,
     items:[{ id,name,mini,qty,unitPrice,lineTotal, extras:{sauces,ingredients,dlcCarne}, ... }]
   }
   ========================================================================== */
export async function createOrder(orderDraft){
  await ensureAnonAuth();
  const payload = {
    ...orderDraft,
    commission: Number(orderDraft.commission||0),
    tip: Number(orderDraft.tip||0),
    status: 'PENDING',
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'orders'), payload);
  return ref.id; // devolvemos el id para poder referenciarlo desde clientes
}

export function subscribeOrders(cb){
  const qy = query(collection(db,'orders'), orderBy('createdAt','asc'));
  return onSnapshot(qy, (snap)=>{
    const list = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    cb(list);
  });
}

export async function setStatus(orderId, status){
  await updateDoc(doc(db,'orders',orderId), { status });
}

export async function archiveDelivered(orderId){
  const ref = doc(db,'orders',orderId);
  const snap= await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  await setDoc(doc(db,'orders_archive', orderId), { ...data, archivedAt: serverTimestamp() });
  await deleteDoc(ref);
}

export async function updateOrder(orderId, patch){
  await ensureAnonAuth();
  await updateDoc(doc(db,'orders',orderId), patch);
}

/* ---------------------
   Reportes por rango
   --------------------- */
export async function getOrdersRange({ from, to, includeArchive = true, orderType = null }){
  await ensureAnonAuth();

  async function runOne(colName){
    let qBase = query(collection(db, colName), orderBy('createdAt', 'asc'));
    if (from) qBase = query(qBase, where('createdAt', '>=', from));
    if (to)   qBase = query(qBase, where('createdAt', '<=', to));
    const snap = await getDocs(qBase);
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (orderType) {
      rows = rows.filter(o => (o.orderType || o.channel || '').toLowerCase() === orderType.toLowerCase());
    }
    return rows;
  }

  const live = await runOne('orders');
  if (!includeArchive) return live;
  const arch = await runOne('orders_archive');
  const all = [...live, ...arch].sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() :
               (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() :
               (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return ta - tb;
  });
  return all;
}

/* =============================================================================
   INVENTARIO + RECETAS + PROVEEDORES
   Colección "inventory":
   { id, name, unit:'g'|'ml'|'unit', category?:string, currentStock:number,
     min?:number, max?:number, perish?:boolean, expiryDays?:number,
     supplierId?:string, sku?:string, notes?:string, lastUpdated? }

   Movimientos "inventory_moves":
   { id, itemId, delta:+/-number, reason:'purchase'|'use'|'adjust'|'production'|'waste',
     meta?:{}, at:serverTimestamp() }

   Compras "purchases":
   { id, itemId, qty, unitCost, supplierId?, expiryDate?, channel? ('delivery'|'pickup'|'onsite'),
     createdAt }

   Recetas "recipes":
   { id, name, outputItemId, yieldQty:number, yieldUnit:'ml'|'g'|'unit',
     ingredients: [{ itemId, qty, unit }], notes? }

   Proveedores "suppliers":
   { id, name, type:'delivery'|'pickup'|'wholesale'|'other',
     commissionPercent?:number, contact?:{} }

   Precios por proveedor "supplier_prices":
   { id, supplierId, itemId, price, currency:'MXN', updatedAt }
   ========================================================================== */

/* --- Inventory Items --- */
export function subscribeInventory(cb){
  const qy = query(collection(db,'inventory'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=>{
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    cb(rows.map(addStockFlags));
  });
}
export async function upsertInventoryItem(item){
  await ensureAnonAuth();
  const now = serverTimestamp();
  const clean = {
    name: String(item.name||'').trim(),
    unit: item.unit || 'unit',
    category: item.category || '',
    currentStock: Number(item.currentStock ?? 0),
    min: Number(item.min ?? 0),
    max: Number(item.max ?? 0),
    perish: item.perish!==false,
    expiryDays: item.expiryDays ? Number(item.expiryDays) : null,
    supplierId: item.supplierId || null,
    sku: item.sku || '',
    notes: item.notes || '',
    lastUpdated: now
  };
  if(item.id){
    await setDoc(doc(db,'inventory',item.id), { id:item.id, ...clean }, { merge:true });
    return item.id;
  }else{
    const ref = await addDoc(collection(db,'inventory'), { ...clean, createdAt: now });
    await setDoc(ref, { id: ref.id }, { merge:true });
    return ref.id;
  }
}
export async function deleteInventoryItem(itemId){
  await ensureAnonAuth();
  await deleteDoc(doc(db,'inventory',itemId));
}

/* --- Stock Moves --- */
export async function adjustStock(itemId, delta, reason='adjust', meta={}){
  await ensureAnonAuth();
  // registra movimiento
  await addDoc(collection(db,'inventory_moves'), {
    itemId, delta: Number(delta||0), reason, meta, at: serverTimestamp()
  });
  // aplica al item
  await updateDoc(doc(db,'inventory',itemId), {
    currentStock: increment(Number(delta||0)),
    lastUpdated: serverTimestamp()
  });
}

/* --- Purchases --- */
export async function recordPurchase({ itemId, qty, unitCost, supplierId=null, expiryDate=null, channel=null }){
  await ensureAnonAuth();
  const row = {
    itemId,
    qty: Number(qty||0),
    unitCost: Number(unitCost||0),
    supplierId: supplierId || null,
    expiryDate: expiryDate ? new Date(expiryDate) : null,
    channel: channel || null,
    createdAt: serverTimestamp()
  };
  await addDoc(collection(db,'purchases'), row);
  // abona al stock
  await adjustStock(itemId, Number(qty||0), 'purchase', { supplierId, unitCost, channel, expiryDate });
}

/** Versión con proveedor + descuento y costo final calculado */
export async function recordPurchasePro({ itemId, qty, unitCost, supplierId=null, discountPercent=0, expiryDate=null, channel=null }){
  await ensureAnonAuth();
  const priceAfterDiscount = Number(unitCost||0) * (1 - Math.max(0, Math.min(100, discountPercent))/100);
  await recordPurchase({ itemId, qty, unitCost: priceAfterDiscount, supplierId, expiryDate, channel });
  return { finalUnitCost: priceAfterDiscount };
}

/* --- Recipes & Production --- */
export function subscribeRecipes(cb){
  const qy = query(collection(db,'recipes'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=>{
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    cb(rows);
  });
}
/**
 * produceBatch:
 * - recipe.outputItemId se incrementa en "outputQty"
 * - por cada ingrediente se descuenta proporcionalmente
 * Ejemplo: receta 500ml, ingredientes en ml/g; si outputQty=1000ml => factor=2
 */
export async function produceBatch({ recipeId, outputQty }){
  await ensureAnonAuth();
  const rDoc = await getDoc(doc(db,'recipes', recipeId));
  if(!rDoc.exists()) throw new Error('Receta no encontrada');
  const r = rDoc.data();
  const baseYield = Number(r.yieldQty||0);
  if(!baseYield || !r.outputItemId) throw new Error('Receta mal definida');
  const factor = Number(outputQty)/baseYield;

  // descuenta ingredientes
  for(const ing of (r.ingredients||[])){
    const dQty = Number(ing.qty||0) * factor;
    await adjustStock(ing.itemId, -dQty, 'production', { recipeId, outputQty });
  }
  // abona producto terminado
  await adjustStock(r.outputItemId, Number(outputQty), 'production', { recipeId });
}

/* --- Suppliers --- */
export function subscribeSuppliers(cb){
  const qy = query(collection(db,'suppliers'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=>{
    cb(snap.docs.map(d=>({ id:d.id, ...d.data() })));
  });
}
export async function upsertSupplier(s){
  await ensureAnonAuth();
  const clean = {
    name: String(s.name||'').trim(),
    type: s.type || 'other', // delivery|pickup|wholesale|other
    commissionPercent: s.commissionPercent!=null ? Number(s.commissionPercent) : null,
    contact: s.contact || {}
  };
  if(s.id){
    await setDoc(doc(db,'suppliers',s.id), { id:s.id, ...clean }, { merge:true });
    return s.id;
  }else{
    const ref = await addDoc(collection(db,'suppliers'), { ...clean, createdAt: serverTimestamp() });
    await setDoc(ref, { id: ref.id }, { merge:true });
    return ref.id;
  }
}

/* --- Supplier Prices --- */
export async function setSupplierPrice({ supplierId, itemId, price, currency='MXN' }){
  await ensureAnonAuth();
  const key = `${supplierId}__${itemId}`;
  await setDoc(doc(db,'supplier_prices', key), {
    id: key, supplierId, itemId, price: Number(price||0), currency, updatedAt: serverTimestamp()
  }, { merge:true });
}
export async function getSupplierPrices(itemId){
  await ensureAnonAuth();
  const qy = query(collection(db,'supplier_prices'), where('itemId','==', itemId));
  const snap = await getDocs(qy);
  return snap.docs.map(d=>({ id:d.id, ...d.data() })).sort((a,b)=> a.price - b.price);
}
/** Mejor oferta (menor precio) para un ítem de inventario */
export async function getBestSupplierOffer(itemId){
  const rows = await getSupplierPrices(itemId);
  return rows.length ? rows[0] : null;
}

/* =============================================================================
   UTILIDADES DE INVENTARIO
   ========================================================================== */
function addStockFlags(it){
  const flags = { low:false, critical:false, ok:true, expired:false, expiring:false };
  if (it.min!=null && it.currentStock<=it.min){ flags.low = true; flags.ok=false; }
  if (it.min!=null && it.currentStock<=Math.max(0, it.min*0.5)){ flags.critical = true; flags.low=true; flags.ok=false; }
  // (Si manejas expiry por lote, puedes calcular expiring/expired)
  return { ...it, flags };
}

/** Snapshot simple del inventario para front no-admin */
export async function getInventorySnapshot(){
  const snap = await getDocs(collection(db,'inventory'));
  const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  return rows.reduce((map, it)=>{ map[it.id]=it; return map; }, {});
}

/** Disponibilidad estimada para un producto (si usa stockItemId) */
export async function getProductAvailableUnits(product){
  if (!product?.stockItemId) return { type:'infinite', units: Infinity };
  try{
    const inv = await getDoc(doc(db,'inventory', product.stockItemId));
    if (!inv.exists()) return { type:'none', units: 0 };
    const it = inv.data();
    const per = Number(product.stockPerUnit ?? 1) || 1;
    const units = Math.floor(Number(it.currentStock||0) / per);
    return { type:'finite', units };
  }catch(e){
    console.warn('[getProductAvailableUnits]', e);
    return { type:'none', units: 0 };
  }
}

/* =============================================================================
   APLICAR INVENTARIO A UN PEDIDO
   - Vasitos por aderezo extra (settings.app.sauceCupItemId)
   - Descargo por producto (stockItemId/stockMap)
   ========================================================================== */
async function applyStockForLine(line){
  if (!line?.id) return;
  try{
    const prodSnap = await getDoc(doc(db,'products', line.id));
    if (!prodSnap.exists()) return;
    const prod = prodSnap.data() || {};
    const qty = Number(line.qty||1);

    // 1) Descuento simple por pieza
    if (prod.stockItemId){
      const per = Number(prod.stockPerUnit ?? 1);
      if (per > 0){
        await adjustStock(prod.stockItemId, -(per*qty), 'use', { reason:'product_sale', productId: line.id });
      }
    }
    // 2) Descuento receta por pieza
    if (Array.isArray(prod.stockMap) && prod.stockMap.length){
      for (const ing of prod.stockMap){
        const dQty = Number(ing.qty||0) * qty;
        if (ing.itemId && dQty>0){
          await adjustStock(ing.itemId, -dQty, 'use', { reason:'product_recipe_sale', productId: line.id });
        }
      }
    }
  }catch(e){ console.warn('[applyStockForLine]', e); }
}

export async function applyInventoryForOrder(order){
  await ensureAnonAuth();
  if(!order) return;

  // 0) Vasitos por aderezos extra
  try{
    const appCfgDoc = await getDoc(doc(db, "settings", "app"));
    const cfg = appCfgDoc.exists()? appCfgDoc.data() : {};
    const cupId = cfg.sauceCupItemId || null;
    if(cupId && Array.isArray(order.items)){
      let cups = 0;
      for(const l of order.items){
        const extraSauces = (l.extras?.sauces||[]).length || 0;
        cups += extraSauces * Number(l.qty||1);
      }
      if(cups>0){
        await adjustStock(cupId, -cups, 'use', { orderId: order.id||null, reason:'sauce_cups' });
      }
    }
  }catch(e){ console.warn('[applyInventoryForOrder] cups', e); }

  // 1) Descargo por producto
  try{
    for (const l of (order.items||[])){
      await applyStockForLine(l);
    }
  }catch(e){ console.warn('[applyInventoryForOrder] product stock', e); }
}

/* =============================================================================
   PAR (sugerencia por día/hora) – cálculo simple
   ========================================================================== */
export async function computeParSuggestion({ productId, hourBucket=2, weeksBack=8, date=new Date() }){
  await ensureAnonAuth();

  const to = new Date(date);
  const from = new Date(date); from.setDate(from.getDate() - weeksBack*7);
  const rows = await getOrdersRange({ from, to, includeArchive: true });

  const day = date.getDay();
  const bucketOf = (dt)=>{
    const h = (dt?.toDate ? dt.toDate() : (dt instanceof Date ? dt : new Date(dt))).getHours();
    return Math.floor(h / hourBucket);
  };
  const nowBucket = bucketOf(date);

  let totalQty = 0, n = 0;
  for (const o of rows){
    const t = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
    if (t.getDay() !== day) continue;
    if (bucketOf(t) !== nowBucket) continue;
    for (const it of (o.items||[])){
      if (it.id === productId) { totalQty += Number(it.qty||1); n++; }
    }
  }
  const avg = n ? (totalQty / n) : 0;

  const ymd = toISOStringYMD(date);
  const isSpecial = await isSpecialDay(ymd);
  const factor = isSpecial ? 1.2 : 1.0;

  return Math.ceil(avg * factor);
}
function toISOStringYMD(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
/** Marca/consulta día especial en colección 'special_days' ({ id:YYYY-MM-DD, reason }) */
export async function isSpecialDay(ymd){
  try{
    const ref = await getDoc(doc(db,'special_days', ymd));
    return ref.exists();
  }catch{ return false; }
}

/* =============================================================================
   CLIENTES (por teléfono)
   - Documento en 'customers/{phone}' donde {phone} es el número normalizado.
   ========================================================================== */
function normalizePhoneForId(raw=''){
  return String(raw).replace(/\D+/g,'').slice(0,15); // igual que en kiosko
}

export async function fetchCustomer(phone){
  await ensureAnonAuth();
  const id = normalizePhoneForId(phone);
  if (!id) return null;
  const snap = await getDoc(doc(db, 'customers', id));
  return snap.exists() ? { id, ...snap.data() } : null;
}

export async function upsertCustomerFromOrder(order){
  await ensureAnonAuth();
  const phoneId = normalizePhoneForId(order?.phone||'');
  if (!phoneId) return;
  const ref = doc(db, 'customers', phoneId);
  const now = serverTimestamp();
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await setDoc(ref, {
      phone: phoneId,
      name: order.customer || '',
      firstSeenAt: now,
      lastSeenAt: now,
      ordersCount: 1,
      lastOrderRef: null
    }, { merge: true });
  } else {
    await updateDoc(ref, {
      name: order.customer || snap.data().name || '',
      lastSeenAt: now,
      ordersCount: increment(1)
    });
  }
  return ref;
}

export async function attachLastOrderRef(phone, orderId){
  await ensureAnonAuth();
  const id = normalizePhoneForId(phone);
  if (!id || !orderId) return;
  await setDoc(doc(db, 'customers', id), {
    lastOrderRef: doc(db, 'orders', orderId),
    lastSeenAt: serverTimestamp()
  }, { merge:true });
}

/* =============================================================================
   FIN
   ========================================================================== */
