// /shared/firebase.js
// Firebase v10.12 (ESM) — App, Auth anónima, Firestore y helpers seguros.

import { initializeApp, getApps, getApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  // OJO: todas estas funciones deben venir del MISMO archivo que crea el db
  getFirestore,
  collection, doc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- Config pública de tu proyecto ---
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.appspot.com",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY",
  databaseURL: "https://seven-de-burgers-default-rtdb.firebaseio.com"
};

// --- Singletons ---
export const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Arranque: asegura sesión anónima silenciosa
onAuthStateChanged(auth, (u) => {
  if (!u) signInAnonymously(auth).catch(() => {});
});

// Robust: espera a que Auth esté lista (evita carreras)
export async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth).catch(()=>{});
  return await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => {
      off(); u ? resolve(u) : reject(new Error('No auth'));
    }, reject);
  });
}

/**
 * Helper seguro: devuelve una CollectionReference usando SIEMPRE
 * el mismo `db` singleton exportado arriba. Úsalo como `col('orders')`.
 */
export function col(path) {
  return collection(db, path);
}

// Re-exports (todas del MISMO módulo que creó `db`)
export {
  // Firestore core
  collection, doc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
};
