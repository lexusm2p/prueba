
export const Status = { PENDING:'pending', IN_PROGRESS:'in_progress', READY:'ready', DELIVERED:'delivered' };
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy, getDocs, limit } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
};
let app, db, auth;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch(e){}
export async function isAvailable(timeoutMs=1500){
  try{
    await signInAnonymously(auth);
    const q = query(collection(db,'orders'), limit(1));
    await Promise.race([getDocs(q), new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')), timeoutMs))]);
    return true;
  }catch(e){ return false; }
}
function ts2ms(ts){ try{ return ts?.toMillis?.() ?? ts ?? Date.now(); }catch{ return Date.now(); } }
export function subscribeOrders(callback){
  const q = query(collection(db,'orders'), orderBy('createdAt','desc'));
  return onSnapshot(q, (snap)=>{
    const arr = snap.docs.map(d=>({ id:d.id, ...d.data(), createdAt:ts2ms(d.data().createdAt), updatedAt:ts2ms(d.data().updatedAt) }));
    callback(arr);
  });
}
export async function addOrder(o){
  const payload = { ...o, status: Status.PENDING, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const ref = await addDoc(collection(db,'orders'), payload); return ref.id;
}
export async function setStatus(id, status){
  const ref = doc(db,'orders', id);
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
}
export async function archiveDelivered(id){
  const ref = doc(db,'orders', id);
  await deleteDoc(ref);
}
export const backendName = 'firestore';
