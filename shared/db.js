// /shared/db.js
import {
  collection, doc, addDoc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, deleteDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, ensureAnonAuth } from "./firebase.js";

// ---------- CATÁLOGO ----------

export async function fetchCatalogWithFallback(){
  await ensureAnonAuth();

  // 1) Intentar Firestore
  const productsCol = collection(db, "products");
  const q = query(productsCol, where("active","==", true));
  const snap = await getDocs(q);
  let products = snap.docs.map(d => ({ id:d.id, ...d.data() }));

  const saucesDoc = await getDoc(doc(db, "extras", "sauces"));
  const ingreDoc  = await getDoc(doc(db, "extras", "ingredients"));
  const settings  = await getDoc(doc(db, "settings", "app"));

  const sauces = saucesDoc.exists() ? (saucesDoc.data().items||[]) : [];
  const ings   = ingreDoc.exists()  ? (ingreDoc.data().items||[])  : [];
  const cfg    = settings.exists()  ? settings.data()              : { dlcCarneMini: 12 };

  if (products.length) {
    return {
      burgers: products.filter(p=>p.type==='big'),
      minis:   products.filter(p=>p.type==='mini'),
      extras: {
        sauces: sauces.map(s=>s.name),
        saucePrice: sauces[0]?.price ?? 5, // si todas valen lo mismo
        ingredients: ings.map(i=>i.name),
        ingredientPrice: 5, // ajusta si difieren por ítem
        dlcCarneMini: cfg.dlcCarneMini ?? 12
      }
    };
  }

  // 2) Fallback a /data/menu.json
  const res = await fetch('../data/menu.json');
  const json = await res.json();
  // si no trae dlc, añade el acordado
  if (!json.extras.dlcCarneMini) json.extras.dlcCarneMini = 12;
  return json;
}

// ---------- ÓRDENES ----------
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
