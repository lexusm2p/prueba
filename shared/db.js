  // Abstracciones para manejar Firestore
import { db, ensureAuth } from './firebase.js';
import {
  collection, doc, addDoc, updateDoc,
  onSnapshot, serverTimestamp, orderBy, query
} from "firebase/firestore";

const ORDERS = "orders";
const ARCHIVE = "orders_archive";

// Crear pedido
export async function createOrder(payload){
  await ensureAuth();
  return await addDoc(collection(db, ORDERS), {
    ...payload,
    status: "PENDING",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// Escuchar pedidos
export function onOrdersSnapshot(cb){
  ensureAuth().then(()=>{
    const q = query(collection(db, ORDERS), orderBy("createdAt","asc"));
    onSnapshot(q, (snap)=>{
      cb(snap.docs.map(d=>({ id:d.id, ...d.data() })));
    });
  });
}

// Cambiar estado
export async function setStatus(id, status){
  await ensureAuth();
  await updateDoc(doc(db, ORDERS, id), { status, updatedAt: serverTimestamp() });
}
