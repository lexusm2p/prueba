// /shared/firebase.js
// ÚNICA inicialización de Firebase (App, Auth, Firestore).
// Evita múltiples SDKs/duplicados. Si tenías /lib/firebase.js, elimínalo y usa solo este.
// ------------------------------------------------------------

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously /*, onAuthStateChanged*/ } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  serverTimestamp, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  onSnapshot, query, where, orderBy, limit, Timestamp,
  increment // ← IMPORTANTE: lo necesitabas para adjustStock y otros
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 🔐 TU CONFIG (una sola fuente de verdad)
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
};

// 🧩 Asegura app única (no doble init)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 🔑 Servicios
const auth = getAuth(app);
const db   = getFirestore(app);

// 🧭 Helper: asegura sesión anónima (evita errores de permisos)
async function ensureAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return auth.currentUser;
}

// 🔔 Listener público para depurar (opcional)
// onAuthStateChanged(auth, (u) => console.debug('[auth]', u?.uid));

export {
  app, auth, db, ensureAuth,
  // Firestore utils que usas en el proyecto:
  serverTimestamp, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  onSnapshot, query, where, orderBy, limit, Timestamp,
  increment // ← EXPORTADO
};
