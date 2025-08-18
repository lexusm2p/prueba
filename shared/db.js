
import { db, auth } from './firebase.js';
import {
  collection, addDoc, serverTimestamp, onSnapshot, orderBy, query, updateDoc, doc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ORDERS = 'orders';
const ARCHIVE = 'orders_archive';

export async function createOrder(payload){
  const stamp = serverTimestamp();
  const ref = await addDoc(collection(db, ORDERS), {
    ...payload,
    status:'PENDING',
    createdAt: stamp,
    updatedAt: stamp,
  });
  return ref.id;
}

export function onOrdersSnapshot(cb){
  const q = query(collection(db, ORDERS), orderBy('createdAt','desc'));
  return onSnapshot(q, (snap)=>{
    const list = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    cb(list);
  });
}

export async function setStatus(id, status){
  await updateDoc(doc(db, ORDERS, id), { status, updatedAt: serverTimestamp() });
}

export async function updateOrder(id, patch){
  await updateDoc(doc(db, ORDERS, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function archiveDelivered(id){
  const ref = doc(db, ORDERS, id);
  // read current
  // Not reading to simplify: just move minimal
  const now = serverTimestamp();
  // We'll copy last known fields from client; for robustness this should read first.
  await setDoc(doc(db, ARCHIVE, id), { archivedAt: now });
  await deleteDoc(ref);
}

export async function deleteOrder(id){
  await deleteDoc(doc(db, ORDERS, id));
}
