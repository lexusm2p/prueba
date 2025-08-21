// /shared/db.js
import {
  collection, doc, addDoc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, deleteDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, ensureAnonAuth } from "./firebase.js";

/* =========================================================================
   CATÁLOGO (Kiosko + Admin)
   Colección "products" (tipos soportados):
   - type: 'big' | 'mini' | 'drink' | 'side' | 'combo'
   - { id, name, price, type, active, baseOf?, ingredients:[], salsaDefault, salsasSugeridas:[], icon:'', hhEligible?: true, comboItems?:[] }
   Extras:
   - /extras/sauces => { items: [{name, price}] }
   - /extras/ingredients => { items: [{name, price}] }
   Settings:
   - /settings/app => { dlcCarneMini:number, saucePrice?:number, ingredientPrice?:number }
   Happy Hour:
   - /settings/happyHour => { enabled:boolean, discountPercent:number (0-100), bannerText?:string, applyEligibleOnly?:boolean }
   ======================================================================= */

/** Catálogo → primero intenta Firestore; si no hay datos, fallback a /data/menu.json */
export async function fetchCatalogWithFallback(){
  await ensureAnonAuth();

  try{
    // 1) Productos activos
    const productsCol = collection(db, "products");
    const qAct = query(productsCol, where("active","==", true));
    const snap = await getDocs(qAct);
    const products = snap.docs.map(d => ({ id:d.id, ...d.data() }));

    // 2) Extras y settings
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
        }
      };
    }
  }catch(e){
    console.warn('[fetchCatalogWithFallback] Firestore vacío o error, uso local:', e);
  }

  // 3) Fallback a /data/menu.json
  const res = await fetch('../data/menu.json');
  const json = await res.json();
  if (!json.extras.dlcCarneMini) json.extras.dlcCarneMini = 12;
  // Si no trae HH en local:
  if (!json.happyHour) json.happyHour = { enabled:false, discountPercent:0, bannerText:'', applyEligibleOnly:true };
  // Para mantener compatibilidad si no trae bebidas/complementos/combos:
  json.drinks ||= [];
  json.sides  ||= [];
  json.combos ||= [];
  return json;
}

/* ---------------------
   CRUD Productos (Admin)
   --------------------- */

/** Suscripción tiempo real a productos (ordenados por nombre) */
export function subscribeProducts(cb){
  const q = query(collection(db, 'products'), orderBy('name', 'asc'));
  return onSnapshot(q, (snap)=>{
    const items = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    cb(items);
  }, (err)=> console.error('[subscribeProducts]', err));
}

/** Crear/actualizar producto. Si trae id, merge; si no, crea nuevo y regresa id */
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
    hhEligible: prod.hhEligible!==false, // por defecto true
    comboItems: Array.isArray(prod.comboItems) ? prod.comboItems : []
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

/** Eliminar producto por id */
export async function deleteProduct(productId){
  await ensureAnonAuth();
  await deleteDoc(doc(db, 'products', productId));
}

/* ---------------------
   Extras (aderezos/ingredientes)
   --------------------- */

/** Suscripción a extras; callback recibe { sauces:[{name,price}], ingredients:[{name,price}] } */
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

/** Guardar arreglo completo de aderezos: [{name,price}] */
export async function setSauces(items){
  await ensureAnonAuth();
  const clean = (items||[]).map(x=>({ name:String(x.name||'').trim(), price:Number(x.price||0) }));
  await setDoc(doc(db,'extras','sauces'), { items: clean }, { merge:true });
}

/** Guardar arreglo completo de ingredientes extra: [{name,price}] */
export async function setIngredients(items){
  await ensureAnonAuth();
  const clean = (items||[]).map(x=>({ name:String(x.name||'').trim(), price:Number(x.price||0) }));
  await setDoc(doc(db,'extras','ingredients'), { items: clean }, { merge:true });
}

/* ---------------------
   Settings (app)
   --------------------- */

/** Suscripción a settings/app */
export function subscribeSettings(cb){
  return onSnapshot(doc(db,'settings','app'), (d)=>{
    cb(d.exists()? d.data() : {});
  }, (err)=> console.error('[subscribeSettings]', err));
}

/** Guardar/actualizar settings/app (parches parciales) */
export async function setSettings(patch){
  await ensureAnonAuth();
  await setDoc(doc(db,'settings','app'), patch, { merge:true });
}

/* ---------------------
   Happy Hour
   --------------------- */

/** Suscripción a settings/happyHour */
export function subscribeHappyHour(cb){
  return onSnapshot(doc(db,'settings','happyHour'), (d)=>{
    cb(d.exists()? d.data() : { enabled:false, discountPercent:0, bannerText:'', applyEligibleOnly:true });
  }, (err)=> console.error('[subscribeHappyHour]', err));
}

/** Guardar/actualizar settings/happyHour */
export async function setHappyHour(patch){
  await ensureAnonAuth();
  // Normaliza datos
  const clean = {
    enabled: !!patch.enabled,
    discountPercent: Math.max(0, Math.min(100, Number(patch.discountPercent||0))),
    bannerText: String(patch.bannerText||''),
    applyEligibleOnly: patch.applyEligibleOnly!==false
  };
  await setDoc(doc(db,'settings','happyHour'), clean, { merge:true });
}

/* =========================================================================
   ÓRDENES
   ======================================================================= */
export async function createOrder(orderDraft){
  await ensureAnonAuth();
  const payload = {
    ...orderDraft,
    status: 'PENDING',
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'orders'), payload);
  return ref.id;
}

export function subscribeOrders(cb){
  const q = query(collection(db,'orders'), orderBy('createdAt','asc'));
  return onSnapshot(q, (snap)=>{
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
  await updateDoc(doc(db,'orders',orderId), patch);
}