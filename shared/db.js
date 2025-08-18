import { firebaseConfig } from './firebaseConfig.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  onSnapshot, serverTimestamp, query, orderBy, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

export const colOrders   = collection(db,'orders');
export const colArchive  = collection(db,'archive_orders');
export const colSettings = doc(db,'settings','global');
export const colInventory= collection(db,'inventory');
export const colRecipes  = collection(db,'recipes');

export async function createOrder(payload){
  payload.createdAt = serverTimestamp();
  payload.status = 'PENDING';
  await addDoc(colOrders, payload);
}
export async function setStatus(id, status){ await updateDoc(doc(colOrders,id), { status }); }
export async function archiveDelivered(id){
  const ref = doc(colOrders,id);
  const snap = await getDoc(ref);
  if(snap.exists()){
    await setDoc(doc(colArchive,id), { ...snap.data(), deliveredAt: serverTimestamp() });
    await deleteDoc(ref);
  }
}
export async function deleteOrder(id){ await deleteDoc(doc(colOrders,id)); }

export function subscribeOrders(cb){
  const q = query(colOrders, orderBy('createdAt','asc'));
  return onSnapshot(q, s=>{ const data=[]; s.forEach(d=>data.push({id:d.id,...d.data()})); cb(data); });
}

export async function setSettings(patch){
  const snap = await getDoc(colSettings);
  if(!snap.exists()) await setDoc(colSettings, patch);
  else await updateDoc(colSettings, patch);
}
export async function getSettings(){
  const snap = await getDoc(colSettings);
  return snap.exists()? snap.data(): {};
}

export async function decrementInventory(id, qty=1){
  const ref = doc(colInventory, id);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const curr = snap.data().stock ?? 0;
  await updateDoc(ref, { stock: Math.max(0, curr - qty) });
}
export async function getInventory(){
  const s = await getDocs(colInventory); const arr=[];
  s.forEach(d=>arr.push({id:d.id,...d.data()})); return arr;
}
