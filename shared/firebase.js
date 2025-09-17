// /shared/firebase.js
// Firebase v10.12 (ESM) — App, Auth (anónima), Firestore + helpers y re-exports.

import { initializeApp, getApps, getApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import { getAuth, signInAnonymously, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  getFirestore,
  // lecturas/queries
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot,
  // escrituras/utilidades
  addDoc, setDoc, updateDoc, deleteDoc,
  // valores especiales
  serverTimestamp, increment, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Config pública (asegura reglas de seguridad en Firestore)
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.appspot.com",          // ✅ dominio correcto
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY",
};

// App única
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Servicios
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Sesión anónima silenciosa (y helper explícito por compatibilidad)
onAuthStateChanged(auth, (u) => { if (!u) signInAnonymously(auth).catch(()=>{}); });
export async function ensureAuth() {
  try { if (!auth.currentUser) await signInAnonymously(auth); } catch {}
  return auth.currentUser || null;
}

// Re-exports para usar desde otros módulos
export {
  // Firestore base
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
};