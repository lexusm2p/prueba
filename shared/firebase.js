// /shared/firebase.js
// Firebase v10.12 (ESM) — App, Auth (anónima), Firestore + helpers y re-exports.

import { initializeApp, getApps, getApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

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
  storageBucket: "seven-de-burgers.appspot.com",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY",
  // 👇 añade esto (URL exacta de tu RTDB)
  databaseURL: "https://seven-de-burgers-default-rtdb.firebaseio.com"
};
// App única
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Servicios
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Sesión anónima silenciosa al iniciar
onAuthStateChanged(auth, (u) => {
  if (!u) signInAnonymously(auth).catch(() => {});
});

// ensureAuth robusto (espera confirmación completa)
export async function ensureAuth() {
  const user = auth.currentUser;
  if (user) return user;

  // Espera breve por si está en proceso de login anónimo
  await new Promise(r => setTimeout(r, 10));
  if (auth.currentUser) return auth.currentUser;

  // Inicia sesión anónima
  await signInAnonymously(auth);

  // Espera a que esté confirmada
  return await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => {
      off();
      u ? resolve(u) : reject(new Error("No auth"));
    }, reject);
  });
}

// Re-exports para usar desde otros módulos
export {
  // Firestore base
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
};
