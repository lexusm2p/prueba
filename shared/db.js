
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, deleteDoc, query, orderBy, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from './firebase.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const ORDERS = 'orders';
const ARCHIVE = 'orders_archive';

export async function createOrder(payload){
  payload.createdAt = serverTimestamp();
  payload.status = 'PENDING';
  return await addDoc(collection(db, ORDERS), payload);
}

export function subscribeOrders(cb){
  const q = query(collection(db, ORDERS), orderBy('createdAt','asc'));
  return onSnapshot(q, (snap)=>{
    const arr = []; snap.forEach(d=> arr.push({id:d.id, ...d.data()}));
    cb(arr);
  });
}

export async function setStatus(id, status){
  return updateDoc(doc(db, ORDERS, id), {status});
}

export async function archiveDelivered(id){
  const ref = doc(db, ORDERS, id);
  const snap = await getDoc(ref);
  if(snap.exists()){
    const data = snap.data();
    await addDoc(collection(db, ARCHIVE), {...data, deliveredAt: serverTimestamp()});
    await deleteDoc(ref);
  }
}
