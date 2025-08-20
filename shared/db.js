/*  // Abstracciones para manejar Firestore
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
*/
// shared/db.js
import { db } from "./firebase.js";
import { 
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, 
  onSnapshot, serverTimestamp, query, orderBy, where 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ORDERS = 'orders';
const ARCHIVE = 'orders_archive';

// Crear pedido
export async function createOrder(payload){
  const ref = await addDoc(collection(db, ORDERS), {
    ...payload,
    status: 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

// Escuchar pedidos
export function onOrdersSnapshot(cb){
  const q = query(collection(db, ORDERS), orderBy('createdAt','asc'));
  onSnapshot(q, (snap)=>{
    const list = snap.docs.map(d=> ({ id:d.id, ...d.data() }));
    cb(list);
  });
}

// Cambiar estado
export async function setStatus(id, status){
  await updateDoc(doc(db, ORDERS, id), { status, updatedAt: serverTimestamp() });
}

// Archivar pedido entregado
export async function archiveDelivered(id){
  const ref = doc(db, ORDERS, id);
  const snap = await getDoc(ref);
  if(snap.exists()){
    await setDoc(doc(db, ARCHIVE, id), snap.data());
    await deleteDoc(ref);
  }
}
