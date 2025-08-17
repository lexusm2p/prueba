
import { db, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, doc, updateDoc, deleteDoc, getDoc, setDoc } from './firebase.js';

const colOrders = collection(db, 'orders');
const colArchive = collection(db, 'orders_archive');

export function subscribeOrders(cb){
  const q = query(colOrders, orderBy('createdAt','asc'));
  return onSnapshot(q, (snap)=>{
    const arr = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    cb(arr);
  });
}

export async function createOrder(order){
  const payload = {
    ...order,
    status:'PENDING',
    createdAt: serverTimestamp()
  };
  return addDoc(colOrders, payload);
}

export async function setStatus(id, status){
  return updateDoc(doc(db,'orders',id), { status });
}

export async function archiveDelivered(id){
  const ref = doc(db, 'orders', id);
  const snap = await getDoc(ref);
  if(snap.exists()){
    const data = snap.data();
    await setDoc(doc(db, 'orders_archive', id), { ...data, deliveredAt: serverTimestamp() });
  }
  await deleteDoc(ref);
}

export async function updateOrder(id, patch){
  return updateDoc(doc(db, 'orders', id), patch);
}
export async function deleteOrder(id){
  return deleteDoc(doc(db, 'orders', id));
}

import { where, Timestamp, getDocs } from './firebase.js';

const colInventory = collection(db, 'inventory');
const docSettingsInv = doc(db, 'settings', 'inventory');

export async function getSettingsInventory(){
  const s = await getDoc(docSettingsInv);
  if(s.exists()) return s.data();
  const defaults = { leadTimeDays:3, safetyStockDays:2, reviewDays:4 };
  await setDoc(docSettingsInv, defaults);
  return defaults;
}
export async function setSettingsInventory(patch){
  return updateDoc(docSettingsInv, patch);
}
export async function listInventory(){
  // get all inventory items
  const snap = await getDocs(colInventory);
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function upsertInventory(item){
  // item: {id?, name, unit, stock}
  if(item.id){
    return updateDoc(doc(db,'inventory',item.id), { name:item.name, unit:item.unit, stock:item.stock });
  }else{
    return addDoc(colInventory, { name:item.name, unit:item.unit, stock:item.stock||0 });
  }
}

export function startOfDay(d=new Date()){
  const x = new Date(d); x.setHours(0,0,0,0); return x;
}
export function endOfDay(d=new Date()){
  const x = new Date(d); x.setHours(23,59,59,999); return x;
}

export async function listDeliveredBetween(from, to){
  const q = query(collection(db,'orders_archive'),
    where('deliveredAt','>=', from),
    where('deliveredAt','<', to),
    orderBy('deliveredAt','asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
  
