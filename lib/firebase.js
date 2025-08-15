// lib/firebase.js (ESM)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, where, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// data access
const col = (...p)=>collection(db, ...p);

export async function createOrder(payload){
  payload.createdAt = serverTimestamp();
  payload.status = 'PENDING';
  const ref = await addDoc(col('orders'), payload);
  return ref.id;
}

export function subscribeOrders(cb){
  const q = query(col('orders'), orderBy('createdAt','asc'));
  return onSnapshot(q, (snap)=>{
    const rows = [];
    snap.forEach(d=>rows.push({id:d.id, ...d.data()}));
    cb(rows);
  });
}

export async function setStatus(id, status){
  await updateDoc(doc(db,'orders',id), { status });
}
