
import { db, ensureAuth, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, where, orderBy } from './firebase.js';

const ORDERS = 'orders';
const ARCHIVE = 'orders_archive';

export async function createOrder(payload){
  await ensureAuth();
  const ref = await addDoc(collection(db, ORDERS), {
    ...payload,
    status: 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export function onOrdersSnapshot(cb){
  ensureAuth().then(()=>{
    const q = query(collection(db, ORDERS), orderBy('createdAt','asc'));
    onSnapshot(q, (snap)=>{
      const list = snap.docs.map(d=> ({ id:d.id, ...d.data() }));
      cb(list);
    });
  });
}

export async function setStatus(id, status){
  await ensureAuth();
  await updateDoc(doc(db, ORDERS, id), { status, updatedAt: serverTimestamp() });
}

export async function archiveDelivered(id){
  await ensureAuth();
  const dref = doc(db, ORDERS, id);
  // read data (minimal safe copy)
  // You can expand to full getDoc if needed; here we move by ids only
  await setDoc(doc(db, ARCHIVE, id), { orderId:id, archivedAt: serverTimestamp() });
  await deleteDoc(dref);
}

export async function deleteOrder(id){
  await ensureAuth();
  await deleteDoc(doc(db, ORDERS, id));
}

export async function updateOrder(id, data){
  await ensureAuth();
  await updateDoc(doc(db, ORDERS, id), { ...data, updatedAt: serverTimestamp() });
}
