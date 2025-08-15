// Firebase (usa tu proyecto)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc,
  onSnapshot, serverTimestamp, query, where
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

// 🚑 Hotfix: simplificamos la suscripción para evitar índices compuestos y '!='.
// Filtramos por estado y ORDENAMOS EN CLIENTE por createdAt.
export const subscribeActiveOrders = (fn) => onSnapshot(
  query(ordersCol(), where('status','in',['PENDING','IN_PROGRESS','READY'])),
  fn
);

export const setStatus = (id, status) =>
  updateDoc(doc(db,'orders',id), { status, updatedAt: serverTimestamp() });

export const archiveDelivered = (id) =>
  updateDoc(doc(db,'orders',id), { archived:true, archivedAt: serverTimestamp(), status:'DELIVERED' });

export const createOrder = (payload) =>
  addDoc(ordersCol(), { ...payload, createdAt: serverTimestamp(), status:'PENDING', archived:false });
