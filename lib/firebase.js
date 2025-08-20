// lib/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth();

export function ensureAuth(){
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
      else signInAnonymously(auth).then(({user})=>resolve(user));
    });
  });
}

// --- ORDERS ---
export const ordersCol = () => collection(db, "orders");
export async function createOrder(payload){
  const ref = await addDoc(ordersCol(), { ...payload, status:"PENDING", createdAt: serverTimestamp() });
  return ref.id;
}
export function setStatus(id, status){
  return updateDoc(doc(db,"orders",id), { status, updatedAt: serverTimestamp() });
}
export function subscribeActiveOrders(cb){
  const q = query(ordersCol(), where("status","in",["PENDING","IN_PROGRESS","READY"]), orderBy("createdAt","desc"));
  return onSnapshot(q, cb);
}
export function subscribeMyOrders(meseroId, cb){
  const q = query(ordersCol(), where("waiterId","==",meseroId), orderBy("createdAt","desc"));
  return onSnapshot(q, cb);
}

// --- PURCHASES ---
export const purchasesCol = () => collection(db, "purchases");
export async function addPurchase(data){
  return addDoc(purchasesCol(), { ...data, createdAt: serverTimestamp() });
}

// --- INVENTORY ---
export const inventoryCol = () => collection(db, "inventory");
export async function upsertInventory(id, data){
  return setDoc(doc(db, "inventory", id), data, { merge:true });
}
export async function adjustStock(id, delta){
  const ref = doc(db, "inventory", id);
  const snap = await getDoc(ref);
  const stock = (snap.exists() ? (snap.data().stock||0) : 0) + delta;
  return setDoc(ref, { stock }, { merge:true });
}
