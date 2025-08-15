// Firebase modular SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import {
  getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Helpers
export const ordersCol = () => collection(db, 'orders');
export const subscribeOrders = (fn) => {
  const q = query(ordersCol(), where('archived','!=', true));
  return onSnapshot(q, fn);
};
export const subscribeActiveOrders = (fn) => {
  const q = query(ordersCol(), where('status','in',['PENDING','IN_PROGRESS','READY']), orderBy('createdAt','asc'));
  return onSnapshot(q, fn);
};
export const setStatus = async (id, status) => updateDoc(doc(db,'orders',id), { status, updatedAt: serverTimestamp() });
export const archiveDelivered = async (id) => updateDoc(doc(db,'orders',id), { archived:true, archivedAt: serverTimestamp() });
export const createOrder = async (payload) => {
  const data = { ...payload, createdAt: serverTimestamp(), status: 'PENDING', archived:false };
  return addDoc(ordersCol(), data);
};
