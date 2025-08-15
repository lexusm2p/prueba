// Firebase (usa tu proyecto)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const firebaseConfig = {
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

// Collections helpers
export const ordersCol = () => collection(db, 'orders');
export const purchasesCol = () => collection(db, 'purchases');
export const inventoryCol = () => collection(db, 'inventory');
export const configDoc = (key) => doc(db, 'config', key);

// Orders helpers
export const subscribeActiveOrders = (fn) => onSnapshot(
  query(ordersCol(), where('archived','!=', true), where('status','in',['PENDING','IN_PROGRESS','READY']), orderBy('createdAt','asc')),
  fn
);
export const subscribeRecentOrders = (fn) => onSnapshot(
  query(ordersCol(), orderBy('createdAt','desc'), limit(100)),
  fn
);
export const setStatus = (id, status) => updateDoc(doc(db,'orders',id), { status, updatedAt: serverTimestamp() });
export const archiveDelivered = (id) => updateDoc(doc(db,'orders',id), { archived:true, archivedAt: serverTimestamp(), status:'DELIVERED' });
export const createOrder = (payload) => addDoc(ordersCol(), { ...payload, createdAt: serverTimestamp(), status:'PENDING', archived:false });

// Inventory & config helpers
export const setConfig = (key, data) => setDoc(configDoc(key), data, { merge:true });
export const getConfig = (key) => getDoc(configDoc(key));
export const addPurchase = (row) => addDoc(purchasesCol(), { ...row, createdAt: serverTimestamp() });
export const setInventoryItem = (id, data) => setDoc(doc(db,'inventory',id), data, { merge:true });
export const subscribeInventory = (fn) => onSnapshot(inventoryCol(), fn);
