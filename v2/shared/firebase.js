// /shared/firebase.js
// Inicializa Firebase (App, Auth, Firestore) y expone helpers globales
// para que shared/db.js y otros módulos puedan usar la misma instancia.

// SDK 10.12.5 (modular)
import {
  initializeApp, getApps, getApp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import {
  getFirestore,
  collection, doc, getDoc, getDocs,
  query, where, orderBy, limit,
  onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// ⚙️ Config de tu proyecto
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

// 🟢 App única (evita reinicializar si se importa en varias páginas)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 🔐 Auth + login anónimo automático
export const auth = getAuth(app);

onAuthStateChanged(auth, (u) => {
  if (!u) {
    signInAnonymously(auth).catch((err) => {
      console.warn("[firebase] signInAnonymously fallo", err);
    });
  }
});

// Helper opcional para quien quiera esperar sesión lista
export async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;

  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.warn("[firebase] ensureAuth: error en signInAnonymously", e);
  }

  return await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(
      auth,
      (u) => {
        off();
        u ? resolve(u) : reject(new Error("No auth"));
      },
      (err) => {
        off();
        reject(err);
      }
    );
  });
}

// 🔥 Firestore instancia principal
export const db = getFirestore(app);

// Re-export modular (por si otros módulos lo importan directo desde aquí)
export {
  collection, doc, getDoc, getDocs,
  query, where, orderBy, limit,
  onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
};

// 🌍 Exponer en window para shared/db.js y demás (clave para que NO use SIM)
if (typeof window !== "undefined") {
  // Evita sobreescribir en caso de imports múltiples
  if (!window.FIREBASE_DB) {
    window.FIREBASE_DB = db;
  }
  if (!window.FIREBASE_FS) {
    window.FIREBASE_FS = {
      collection,
      doc,
      getDoc,
      getDocs,
      query,
      where,
      orderBy,
      limit,
      onSnapshot,
      addDoc,
      setDoc,
      updateDoc,
      deleteDoc,
      serverTimestamp,
      increment,
      Timestamp,
    };
  }

  console.info("[firebase] inicializado OK: seven-de-burgers");
}
